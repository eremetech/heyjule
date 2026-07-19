import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type {
  DoctorPublicKey,
  EncryptedDoctorExport,
  InboxEntry,
  PatientEntry,
  SealedEnvelope,
} from "@heyjule/shared-types";
import { decryptAtRest, encryptAtRest } from "./at-rest-crypto.ts";

type DeviceRow = {
  id: string;
  patient_id: string;
  public_key: string;
  fingerprint: string;
  created_at: string;
  last_seen_at: string;
  revoked_at: string | null;
};

type InboxRow = {
  id: string;
  patient_id: string;
  device_id: string;
  envelope_json: string;
  created_at: string;
  expires_at: string;
};

type PatientEntryRow = {
  id: string;
  patient_id: string;
  occurred_at: string;
  kind: PatientEntry["kind"];
  ciphertext: string;
  nonce: string;
  tag: string;
};

type DoctorKeyRow = {
  id: string;
  doctor_id: string;
  public_key: string;
  fingerprint: string;
  created_at: string;
};

type ExportRow = {
  id: string;
  patient_id: string;
  doctor_id: string;
  doctor_key_id: string;
  envelope_json: string;
  created_at: string;
  expires_at: string;
};

export type PatientDevice = {
  id: string;
  patientId: string;
  publicKey: string;
  fingerprint: string;
  createdAt: string;
};

function isoNow() {
  return new Date().toISOString();
}

function createConnection(databasePath: string) {
  if (databasePath !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true });
  const connection = new Database(databasePath);
  connection.pragma("journal_mode = WAL");
  connection.pragma("foreign_keys = ON");
  // Overwrite deleted SQLite cells. WAL/backups can still retain ciphertext,
  // which is why inbox/export payloads are encrypted to recipient-held keys.
  connection.pragma("secure_delete = ON");
  connection.pragma("busy_timeout = 5000");
  return connection;
}

export class ApiDatabase {
  readonly connection: Database.Database;

  constructor(
    databasePath: string,
    private readonly dataKey: Uint8Array,
  ) {
    this.connection = createConnection(databasePath);
    this.migrate();
  }

  close() {
    this.connection.close();
  }

  private migrate() {
    this.connection.exec(`
      CREATE TABLE IF NOT EXISTS patients (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS patient_devices (
        id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
        public_key TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        revoked_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_patient_devices_active
        ON patient_devices(patient_id, revoked_at, last_seen_at);

      CREATE TABLE IF NOT EXISTS inbox_entries (
        id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
        device_id TEXT NOT NULL REFERENCES patient_devices(id) ON DELETE CASCADE,
        envelope_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_inbox_delivery
        ON inbox_entries(patient_id, device_id, expires_at);

      CREATE TABLE IF NOT EXISTS patient_entries (
        id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
        occurred_at TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('check_in', 'chat_summary', 'prom', 'wearable')),
        ciphertext TEXT NOT NULL,
        nonce TEXT NOT NULL,
        tag TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_patient_entries_timeline
        ON patient_entries(patient_id, occurred_at);

      CREATE TABLE IF NOT EXISTS doctor_keys (
        id TEXT PRIMARY KEY,
        doctor_id TEXT NOT NULL,
        public_key TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        created_at TEXT NOT NULL,
        revoked_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_doctor_keys_active
        ON doctor_keys(doctor_id, revoked_at, created_at);

      CREATE TABLE IF NOT EXISTS care_relationships (
        patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
        doctor_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
        created_at TEXT NOT NULL,
        revoked_at TEXT,
        PRIMARY KEY (patient_id, doctor_id)
      );

      CREATE TABLE IF NOT EXISTS encrypted_exports (
        id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
        doctor_id TEXT NOT NULL,
        doctor_key_id TEXT NOT NULL REFERENCES doctor_keys(id),
        envelope_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_exports_doctor
        ON encrypted_exports(doctor_id, expires_at);

      CREATE TABLE IF NOT EXISTS audit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_id TEXT NOT NULL,
        action TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );
    `);
  }

  private ensurePatient(patientId: string) {
    this.connection
      .prepare("INSERT INTO patients (id, created_at) VALUES (?, ?) ON CONFLICT(id) DO NOTHING")
      .run(patientId, isoNow());
  }

  private audit(
    actorId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    metadata: Record<string, string> = {},
  ) {
    this.connection
      .prepare(
        `INSERT INTO audit_events
          (actor_id, action, resource_type, resource_id, occurred_at, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(actorId, action, resourceType, resourceId, isoNow(), JSON.stringify(metadata));
  }

  upsertDevice(patientId: string, deviceId: string, publicKey: string, fingerprint: string) {
    const now = isoNow();
    const transaction = this.connection.transaction(() => {
      this.ensurePatient(patientId);
      const existing = this.connection
        .prepare<[string], Pick<DeviceRow, "patient_id" | "public_key">>(
          "SELECT patient_id, public_key FROM patient_devices WHERE id = ?",
        )
        .get(deviceId);
      if (existing && existing.patient_id !== patientId) throw new Error("device_owner_mismatch");
      if (existing && existing.public_key !== publicKey) {
        const pending = this.connection
          .prepare<[string, string, string], { present: number }>(
            `SELECT 1 AS present FROM inbox_entries
              WHERE patient_id = ? AND device_id = ? AND expires_at > ? LIMIT 1`,
          )
          .get(patientId, deviceId, now);
        if (pending) throw new Error("device_has_pending_entries");
      }
      this.connection
        .prepare(
          `INSERT INTO patient_devices
            (id, patient_id, public_key, fingerprint, created_at, last_seen_at, revoked_at)
           VALUES (?, ?, ?, ?, ?, ?, NULL)
           ON CONFLICT(id) DO UPDATE SET
             public_key = excluded.public_key,
             fingerprint = excluded.fingerprint,
             last_seen_at = excluded.last_seen_at,
             revoked_at = NULL`,
        )
        .run(deviceId, patientId, publicKey, fingerprint, now, now);
      this.audit(patientId, "device.register", "patient_device", deviceId, { fingerprint });
    });
    transaction();
  }

  getLatestDevice(patientId: string): PatientDevice | undefined {
    const row = this.connection
      .prepare<[string], DeviceRow>(
        `SELECT * FROM patient_devices
          WHERE patient_id = ? AND revoked_at IS NULL
          ORDER BY last_seen_at DESC LIMIT 1`,
      )
      .get(patientId);
    return row
      ? {
          id: row.id,
          patientId: row.patient_id,
          publicKey: row.public_key,
          fingerprint: row.fingerprint,
          createdAt: row.created_at,
        }
      : undefined;
  }

  ownsActiveDevice(patientId: string, deviceId: string) {
    return Boolean(
      this.connection
        .prepare<[string, string], { present: number }>(
          `SELECT 1 AS present FROM patient_devices
            WHERE patient_id = ? AND id = ? AND revoked_at IS NULL`,
        )
        .get(patientId, deviceId),
    );
  }

  insertInboxEntry(entry: InboxEntry, patientId: string) {
    this.connection
      .prepare(
        `INSERT INTO inbox_entries
          (id, patient_id, device_id, envelope_json, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.id,
        patientId,
        entry.deviceId,
        JSON.stringify(entry.envelope),
        entry.createdAt,
        entry.expiresAt,
      );
    this.audit(patientId, "inbox.create", "inbox_entry", entry.id, { deviceId: entry.deviceId });
  }

  listInboxEntries(patientId: string, deviceId: string): InboxEntry[] {
    return this.connection
      .prepare<[string, string, string], InboxRow>(
        `SELECT * FROM inbox_entries
          WHERE patient_id = ? AND device_id = ? AND expires_at > ?
          ORDER BY created_at`,
      )
      .all(patientId, deviceId, isoNow())
      .map((row) => ({
        id: row.id,
        deviceId: row.device_id,
        envelope: JSON.parse(row.envelope_json) as SealedEnvelope,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
      }));
  }

  acknowledgeInboxEntry(patientId: string, deviceId: string, entryId: string) {
    const transaction = this.connection.transaction(() => {
      const result = this.connection
        .prepare("DELETE FROM inbox_entries WHERE id = ? AND patient_id = ? AND device_id = ?")
        .run(entryId, patientId, deviceId);
      if (result.changes === 1) {
        this.audit(patientId, "inbox.acknowledge", "inbox_entry", entryId, { deviceId });
      }
      return result.changes === 1;
    });
    return transaction();
  }

  putPatientEntry(patientId: string, entry: PatientEntry) {
    this.ensurePatient(patientId);
    const aad = `heyjule:patient-entry:v1:${patientId}:${entry.id}`;
    const sealed = encryptAtRest(entry.payload, this.dataKey, aad);
    const now = isoNow();
    const result = this.connection
      .prepare(
        `INSERT INTO patient_entries
          (id, patient_id, occurred_at, kind, ciphertext, nonce, tag, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           occurred_at = excluded.occurred_at,
           kind = excluded.kind,
           ciphertext = excluded.ciphertext,
           nonce = excluded.nonce,
           tag = excluded.tag,
           updated_at = excluded.updated_at
         WHERE patient_entries.patient_id = excluded.patient_id`,
      )
      .run(
        entry.id,
        patientId,
        entry.occurredAt,
        entry.kind,
        sealed.ciphertext,
        sealed.nonce,
        sealed.tag,
        now,
        now,
      );
    if (result.changes !== 1) throw new Error("entry_owner_mismatch");
    this.audit(patientId, "patient_entry.write", "patient_entry", entry.id, { kind: entry.kind });
  }

  listPatientEntries(patientId: string): PatientEntry[] {
    return this.connection
      .prepare<[string], PatientEntryRow>(
        "SELECT * FROM patient_entries WHERE patient_id = ? ORDER BY occurred_at DESC",
      )
      .all(patientId)
      .map((row) => ({
        id: row.id,
        occurredAt: row.occurred_at,
        kind: row.kind,
        payload: decryptAtRest<Record<string, unknown>>(
          { ciphertext: row.ciphertext, nonce: row.nonce, tag: row.tag },
          this.dataKey,
          `heyjule:patient-entry:v1:${patientId}:${row.id}`,
        ),
      }));
  }

  listPatientEntriesForDoctor(doctorId: string, patientId: string): PatientEntry[] | undefined {
    const relationship = this.connection
      .prepare<[string, string], { present: number }>(
        `SELECT 1 AS present FROM care_relationships
          WHERE patient_id = ? AND doctor_id = ? AND status = 'active'`,
      )
      .get(patientId, doctorId);
    if (!relationship) return undefined;
    const entries = this.listPatientEntries(patientId);
    this.audit(doctorId, "patient_timeline.read", "patient", patientId);
    return entries;
  }

  registerDoctorKey(key: DoctorPublicKey) {
    this.connection
      .prepare(
        `INSERT INTO doctor_keys
          (id, doctor_id, public_key, fingerprint, created_at, revoked_at)
         VALUES (?, ?, ?, ?, ?, NULL)`,
      )
      .run(key.id, key.doctorId, key.publicKey, key.fingerprint, key.createdAt);
    this.audit(key.doctorId, "doctor_key.register", "doctor_key", key.id, {
      fingerprint: key.fingerprint,
    });
  }

  createCareRelationship(patientId: string, doctorId: string) {
    const now = isoNow();
    const transaction = this.connection.transaction(() => {
      this.ensurePatient(patientId);
      this.connection
        .prepare(
          `INSERT INTO care_relationships
            (patient_id, doctor_id, status, created_at, revoked_at)
           VALUES (?, ?, 'active', ?, NULL)
           ON CONFLICT(patient_id, doctor_id) DO UPDATE SET
             status = 'active', revoked_at = NULL`,
        )
        .run(patientId, doctorId, now);
      this.audit(patientId, "care_relationship.activate", "doctor", doctorId);
    });
    transaction();
  }

  getDoctorKeyForPatient(patientId: string, doctorId: string): DoctorPublicKey | undefined {
    const row = this.connection
      .prepare<[string, string], DoctorKeyRow>(
        `SELECT k.* FROM doctor_keys k
          JOIN care_relationships r ON r.doctor_id = k.doctor_id
         WHERE r.patient_id = ? AND r.doctor_id = ? AND r.status = 'active'
           AND k.revoked_at IS NULL
         ORDER BY k.created_at DESC LIMIT 1`,
      )
      .get(patientId, doctorId);
    return row
      ? {
          id: row.id,
          doctorId: row.doctor_id,
          publicKey: row.public_key,
          fingerprint: row.fingerprint,
          createdAt: row.created_at,
        }
      : undefined;
  }

  insertEncryptedExport(value: EncryptedDoctorExport) {
    const allowedKey = this.getDoctorKeyForPatient(value.patientId, value.doctorId);
    if (!allowedKey || allowedKey.id !== value.doctorKeyId) return false;
    this.connection
      .prepare(
        `INSERT INTO encrypted_exports
          (id, patient_id, doctor_id, doctor_key_id, envelope_json, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        value.id,
        value.patientId,
        value.doctorId,
        value.doctorKeyId,
        JSON.stringify(value.envelope),
        value.createdAt,
        value.expiresAt,
      );
    this.audit(value.patientId, "doctor_export.create", "encrypted_export", value.id, {
      doctorId: value.doctorId,
      doctorKeyId: value.doctorKeyId,
    });
    return true;
  }

  getEncryptedExport(exportId: string, doctorId: string): EncryptedDoctorExport | undefined {
    const row = this.connection
      .prepare<[string, string, string], ExportRow>(
        `SELECT e.* FROM encrypted_exports e
          JOIN care_relationships r
            ON r.patient_id = e.patient_id AND r.doctor_id = e.doctor_id
         WHERE e.id = ? AND e.doctor_id = ? AND e.expires_at > ?
           AND r.status = 'active'`,
      )
      .get(exportId, doctorId, isoNow());
    if (!row) return undefined;
    this.audit(doctorId, "doctor_export.read", "encrypted_export", exportId);
    return {
      id: row.id,
      patientId: row.patient_id,
      doctorId: row.doctor_id,
      doctorKeyId: row.doctor_key_id,
      envelope: JSON.parse(row.envelope_json) as SealedEnvelope,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    };
  }

  cleanupExpired() {
    const now = isoNow();
    const inbox = this.connection.prepare("DELETE FROM inbox_entries WHERE expires_at <= ?").run(now);
    const exports = this.connection.prepare("DELETE FROM encrypted_exports WHERE expires_at <= ?").run(now);
    if (inbox.changes > 0 || exports.changes > 0) this.connection.pragma("wal_checkpoint(PASSIVE)");
    return { inbox: inbox.changes, exports: exports.changes };
  }
}
