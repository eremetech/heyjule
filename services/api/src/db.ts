import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type {
  CareInvite,
  CareRelationship,
  DoctorExportMetadata,
  DoctorPublicKey,
  EncryptedDoctorExport,
  InboxEntry,
  LinkedPatient,
  PatientEntry,
  PatientProfile,
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
};

type PatientEntryRow = {
  id: string;
  patient_id: string;
  occurred_at: string;
  kind: PatientEntry["kind"];
  source: PatientEntry["source"];
  data_mode: PatientEntry["dataMode"];
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
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_inbox_delivery
        ON inbox_entries(patient_id, device_id, created_at);

      CREATE TABLE IF NOT EXISTS patient_entries (
        id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
        occurred_at TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('check_in', 'chat_summary', 'prom', 'wearable', 'treatment')),
        source TEXT NOT NULL CHECK (source IN ('patient_check_in', 'in_app_conversation', 'chatgpt_app_mcp', 'apple_health', 'electronic_patient_record', 'patient_reported_outcome')),
        data_mode TEXT NOT NULL CHECK (data_mode IN ('mock', 'live')),
        ciphertext TEXT NOT NULL,
        nonce TEXT NOT NULL,
        tag TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_patient_entries_timeline
        ON patient_entries(patient_id, occurred_at);

      CREATE TABLE IF NOT EXISTS patient_profiles (
        patient_id TEXT PRIMARY KEY REFERENCES patients(id) ON DELETE CASCADE,
        ciphertext TEXT NOT NULL,
        nonce TEXT NOT NULL,
        tag TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

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
        doctor_name TEXT,
        status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
        created_at TEXT NOT NULL,
        revoked_at TEXT,
        PRIMARY KEY (patient_id, doctor_id)
      );

      CREATE TABLE IF NOT EXISTS care_invites (
        id TEXT PRIMARY KEY,
        doctor_id TEXT NOT NULL,
        doctor_name TEXT,
        code_hash TEXT NOT NULL UNIQUE,
        ciphertext TEXT NOT NULL,
        nonce TEXT NOT NULL,
        tag TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'claimed', 'revoked', 'expired')),
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        claimed_by TEXT REFERENCES patients(id),
        claimed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_care_invites_doctor
        ON care_invites(doctor_id, status, expires_at);

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

    // Earlier builds expired unopened device-sealed summaries after 15 minutes.
    // Rebuild that table once so pending ciphertext becomes a durable mailbox
    // and is removed only by an authenticated device acknowledgement.
    for (const table of ["care_relationships", "care_invites"]) {
      const columns = this.connection.pragma(`table_info(${table})`) as Array<{ name: string }>;
      if (!columns.some((column) => column.name === "doctor_name")) {
        this.connection.exec(`ALTER TABLE ${table} ADD COLUMN doctor_name TEXT;`);
      }
    }

    const inboxColumns = this.connection.pragma("table_info(inbox_entries)") as Array<{
      name: string;
    }>;
    if (inboxColumns.some((column) => column.name === "expires_at")) {
      this.connection.exec(`
        DROP INDEX IF EXISTS idx_inbox_delivery;
        ALTER TABLE inbox_entries RENAME TO inbox_entries_with_expiry;
        CREATE TABLE inbox_entries (
          id TEXT PRIMARY KEY,
          patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
          device_id TEXT NOT NULL REFERENCES patient_devices(id) ON DELETE CASCADE,
          envelope_json TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        INSERT INTO inbox_entries (id, patient_id, device_id, envelope_json, created_at)
          SELECT id, patient_id, device_id, envelope_json, created_at
          FROM inbox_entries_with_expiry;
        DROP TABLE inbox_entries_with_expiry;
        CREATE INDEX idx_inbox_delivery
          ON inbox_entries(patient_id, device_id, created_at);
      `);
    }

    const patientEntryColumns = this.connection.pragma("table_info(patient_entries)") as Array<{
      name: string;
    }>;
    if (!patientEntryColumns.some((column) => column.name === "source")) {
      this.connection.exec(
        "ALTER TABLE patient_entries ADD COLUMN source TEXT NOT NULL DEFAULT 'patient_check_in'",
      );
      this.connection.exec(`
        UPDATE patient_entries SET source = 'chatgpt_app_mcp' WHERE kind = 'chat_summary';
        UPDATE patient_entries SET source = 'patient_reported_outcome' WHERE kind = 'prom';
        UPDATE patient_entries SET source = 'apple_health' WHERE kind = 'wearable';
      `);
    }
    if (!patientEntryColumns.some((column) => column.name === "data_mode")) {
      this.connection.exec(
        "ALTER TABLE patient_entries ADD COLUMN data_mode TEXT NOT NULL DEFAULT 'live'",
      );
    }

    const patientEntryTable = this.connection
      .prepare<[string], { sql: string }>("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get("patient_entries");
    if (patientEntryTable && !patientEntryTable.sql.includes("'treatment'")) {
      this.connection.exec(`
        DROP INDEX IF EXISTS idx_patient_entries_timeline;
        ALTER TABLE patient_entries RENAME TO patient_entries_before_treatments;
        CREATE TABLE patient_entries (
          id TEXT PRIMARY KEY,
          patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
          occurred_at TEXT NOT NULL,
          kind TEXT NOT NULL CHECK (kind IN ('check_in', 'chat_summary', 'prom', 'wearable', 'treatment')),
          source TEXT NOT NULL CHECK (source IN ('patient_check_in', 'in_app_conversation', 'chatgpt_app_mcp', 'apple_health', 'electronic_patient_record', 'patient_reported_outcome')),
          data_mode TEXT NOT NULL CHECK (data_mode IN ('mock', 'live')),
          ciphertext TEXT NOT NULL,
          nonce TEXT NOT NULL,
          tag TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        INSERT INTO patient_entries
          (id, patient_id, occurred_at, kind, source, data_mode, ciphertext, nonce, tag, created_at, updated_at)
        SELECT id, patient_id, occurred_at, kind, source, data_mode, ciphertext, nonce, tag, created_at, updated_at
          FROM patient_entries_before_treatments;
        DROP TABLE patient_entries_before_treatments;
        CREATE INDEX idx_patient_entries_timeline
          ON patient_entries(patient_id, occurred_at);
      `);
    }
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
          .prepare<[string, string], { present: number }>(
            `SELECT 1 AS present FROM inbox_entries
              WHERE patient_id = ? AND device_id = ? LIMIT 1`,
          )
          .get(patientId, deviceId);
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
          (id, patient_id, device_id, envelope_json, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        entry.id,
        patientId,
        entry.deviceId,
        JSON.stringify(entry.envelope),
        entry.createdAt,
      );
    this.audit(patientId, "inbox.create", "inbox_entry", entry.id, { deviceId: entry.deviceId });
  }

  listInboxEntries(patientId: string, deviceId: string): InboxEntry[] {
    return this.connection
      .prepare<[string, string], InboxRow>(
        `SELECT * FROM inbox_entries
          WHERE patient_id = ? AND device_id = ?
          ORDER BY created_at`,
      )
      .all(patientId, deviceId)
      .map((row) => ({
        id: row.id,
        deviceId: row.device_id,
        envelope: JSON.parse(row.envelope_json) as SealedEnvelope,
        createdAt: row.created_at,
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
          (id, patient_id, occurred_at, kind, source, data_mode, ciphertext, nonce, tag, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           occurred_at = excluded.occurred_at,
           kind = excluded.kind,
           source = excluded.source,
           data_mode = excluded.data_mode,
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
        entry.source,
        entry.dataMode,
        sealed.ciphertext,
        sealed.nonce,
        sealed.tag,
        now,
        now,
      );
    if (result.changes !== 1) throw new Error("entry_owner_mismatch");
    this.audit(patientId, "patient_entry.write", "patient_entry", entry.id, { kind: entry.kind });
  }

  putPatientProfile(patientId: string, profile: PatientProfile) {
    this.ensurePatient(patientId);
    const sealed = encryptAtRest(profile, this.dataKey, `heyjule:patient-profile:v1:${patientId}`);
    const now = isoNow();
    this.connection
      .prepare(
        `INSERT INTO patient_profiles (patient_id, ciphertext, nonce, tag, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(patient_id) DO UPDATE SET
           ciphertext = excluded.ciphertext,
           nonce = excluded.nonce,
           tag = excluded.tag,
           updated_at = excluded.updated_at`,
      )
      .run(patientId, sealed.ciphertext, sealed.nonce, sealed.tag, now);
    this.audit(patientId, "patient_profile.write", "patient", patientId);
  }

  private decryptProfile(row: { patient_id: string; ciphertext: string; nonce: string; tag: string }) {
    return decryptAtRest<PatientProfile>(
      { ciphertext: row.ciphertext, nonce: row.nonce, tag: row.tag },
      this.dataKey,
      `heyjule:patient-profile:v1:${row.patient_id}`,
    );
  }

  getPatientProfile(patientId: string): PatientProfile | undefined {
    const row = this.connection
      .prepare<
        [string],
        { patient_id: string; ciphertext: string; nonce: string; tag: string }
      >("SELECT patient_id, ciphertext, nonce, tag FROM patient_profiles WHERE patient_id = ?")
      .get(patientId);
    return row ? this.decryptProfile(row) : undefined;
  }

  createCareInvite(
    doctorId: string,
    value: {
      id: string;
      code: string;
      codeHash: string;
      createdAt: string;
      expiresAt: string;
      doctorName?: string;
    },
  ) {
    const sealed = encryptAtRest(
      { code: value.code },
      this.dataKey,
      `heyjule:care-invite:v1:${value.id}:${doctorId}`,
    );
    this.connection
      .prepare(
        `INSERT INTO care_invites
          (id, doctor_id, doctor_name, code_hash, ciphertext, nonce, tag, status, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      )
      .run(
        value.id,
        doctorId,
        value.doctorName ?? null,
        value.codeHash,
        sealed.ciphertext,
        sealed.nonce,
        sealed.tag,
        value.createdAt,
        value.expiresAt,
      );
    this.audit(doctorId, "care_invite.create", "care_invite", value.id);
  }

  listCareInvites(doctorId: string): CareInvite[] {
    const now = isoNow();
    this.connection
      .prepare(
        `UPDATE care_invites SET status = 'expired'
          WHERE doctor_id = ? AND status = 'pending' AND expires_at <= ?`,
      )
      .run(doctorId, now);
    const rows = this.connection
      .prepare<
        [string, string],
        { id: string; doctor_id: string; ciphertext: string; nonce: string; tag: string; created_at: string; expires_at: string }
      >(
        `SELECT id, doctor_id, ciphertext, nonce, tag, created_at, expires_at
           FROM care_invites
          WHERE doctor_id = ? AND status = 'pending' AND expires_at > ?
          ORDER BY created_at DESC`,
      )
      .all(doctorId, now);
    return rows.map((row) => ({
      id: row.id,
      code: decryptAtRest<{ code: string }>(
        { ciphertext: row.ciphertext, nonce: row.nonce, tag: row.tag },
        this.dataKey,
        `heyjule:care-invite:v1:${row.id}:${row.doctor_id}`,
      ).code,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    }));
  }

  revokeCareInvite(doctorId: string, inviteId: string) {
    const result = this.connection
      .prepare(
        `UPDATE care_invites SET status = 'revoked'
          WHERE id = ? AND doctor_id = ? AND status = 'pending'`,
      )
      .run(inviteId, doctorId);
    if (result.changes === 1) this.audit(doctorId, "care_invite.revoke", "care_invite", inviteId);
    return result.changes === 1;
  }

  claimCareInvite(patientId: string, codeHash: string) {
    const now = isoNow();
    return this.connection.transaction(() => {
      const invite = this.connection
        .prepare<[string, string], { id: string; doctor_id: string; doctor_name: string | null }>(
          `SELECT id, doctor_id, doctor_name FROM care_invites
            WHERE code_hash = ? AND status = 'pending' AND expires_at > ?`,
        )
        .get(codeHash, now);
      if (!invite) return undefined;
      this.ensurePatient(patientId);
      this.connection
        .prepare(
          `UPDATE care_invites
              SET status = 'claimed', claimed_by = ?, claimed_at = ?
            WHERE id = ? AND status = 'pending'`,
        )
        .run(patientId, now, invite.id);
      this.connection
        .prepare(
          `INSERT INTO care_relationships
            (patient_id, doctor_id, doctor_name, status, created_at, revoked_at)
           VALUES (?, ?, ?, 'active', ?, NULL)
           ON CONFLICT(patient_id, doctor_id) DO UPDATE SET
             status = 'active', revoked_at = NULL,
             doctor_name = COALESCE(excluded.doctor_name, care_relationships.doctor_name)`,
        )
        .run(patientId, invite.doctor_id, invite.doctor_name, now);
      this.audit(patientId, "care_relationship.activate", "doctor", invite.doctor_id, {
        inviteId: invite.id,
      });
      return { doctorId: invite.doctor_id, doctorName: invite.doctor_name ?? undefined, linkedAt: now };
    })();
  }

  listCareRelationships(patientId: string): CareRelationship[] {
    return this.connection
      .prepare<[string], { doctor_id: string; doctor_name: string | null; created_at: string }>(
        `SELECT doctor_id, doctor_name, created_at FROM care_relationships
          WHERE patient_id = ? AND status = 'active'
          ORDER BY created_at DESC`,
      )
      .all(patientId)
      .map((row) => ({
        doctorId: row.doctor_id,
        doctorName: row.doctor_name ?? undefined,
        linkedAt: row.created_at,
      }));
  }

  revokeCareRelationship(patientId: string, doctorId: string) {
    const now = isoNow();
    const result = this.connection
      .prepare(
        `UPDATE care_relationships
            SET status = 'revoked', revoked_at = ?
          WHERE patient_id = ? AND doctor_id = ? AND status = 'active'`,
      )
      .run(now, patientId, doctorId);
    if (result.changes === 1) {
      this.audit(patientId, "care_relationship.revoke", "doctor", doctorId);
    }
    return result.changes === 1;
  }

  listLinkedPatients(doctorId: string): LinkedPatient[] {
    const rows = this.connection
      .prepare<
        [string],
        {
          patient_id: string;
          created_at: string;
          last_entry_at: string | null;
          ciphertext: string | null;
          nonce: string | null;
          tag: string | null;
        }
      >(
        `SELECT r.patient_id, r.created_at,
                MAX(e.occurred_at) AS last_entry_at,
                p.ciphertext, p.nonce, p.tag
           FROM care_relationships r
           LEFT JOIN patient_profiles p ON p.patient_id = r.patient_id
           LEFT JOIN patient_entries e ON e.patient_id = r.patient_id
          WHERE r.doctor_id = ? AND r.status = 'active'
          GROUP BY r.patient_id, r.created_at, p.ciphertext, p.nonce, p.tag
          ORDER BY COALESCE(last_entry_at, r.created_at) DESC`,
      )
      .all(doctorId);
    this.audit(doctorId, "patient_list.read", "doctor", doctorId);
    return rows.map((row) => ({
      id: row.patient_id,
      profile:
        row.ciphertext && row.nonce && row.tag
          ? this.decryptProfile({
              patient_id: row.patient_id,
              ciphertext: row.ciphertext,
              nonce: row.nonce,
              tag: row.tag,
            })
          : null,
      linkedAt: row.created_at,
      lastEntryAt: row.last_entry_at,
    }));
  }

  getLinkedPatient(doctorId: string, patientId: string): LinkedPatient | undefined {
    return this.listLinkedPatients(doctorId).find((patient) => patient.id === patientId);
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
        source: row.source,
        dataMode: row.data_mode,
        payload: decryptAtRest<Record<string, unknown>>(
          { ciphertext: row.ciphertext, nonce: row.nonce, tag: row.tag },
          this.dataKey,
          `heyjule:patient-entry:v1:${patientId}:${row.id}`,
        ),
      })) as PatientEntry[];
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
    const existing = this.connection
      .prepare<[string], Pick<DoctorKeyRow, "doctor_id" | "public_key">>(
        "SELECT doctor_id, public_key FROM doctor_keys WHERE id = ?",
      )
      .get(key.id);
    if (existing) {
      if (existing.doctor_id !== key.doctorId || existing.public_key !== key.publicKey) {
        throw new Error("doctor_key_conflict");
      }
      return false;
    }
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
    return true;
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
    return this.mapEncryptedExport(row);
  }

  listEncryptedExportsForDoctor(
    doctorId: string,
    patientId: string,
  ): EncryptedDoctorExport[] | undefined {
    const relationship = this.connection
      .prepare<[string, string], { present: number }>(
        `SELECT 1 AS present FROM care_relationships
          WHERE patient_id = ? AND doctor_id = ? AND status = 'active'`,
      )
      .get(patientId, doctorId);
    if (!relationship) return undefined;
    const rows = this.connection
      .prepare<[string, string, string], ExportRow>(
        `SELECT * FROM encrypted_exports
          WHERE doctor_id = ? AND patient_id = ? AND expires_at > ?
          ORDER BY created_at DESC`,
      )
      .all(doctorId, patientId, isoNow());
    this.audit(doctorId, "doctor_export.list", "patient", patientId);
    return rows.map((row) => this.mapEncryptedExport(row));
  }

  listEncryptedExportsForPatient(patientId: string): DoctorExportMetadata[] {
    return this.connection
      .prepare<[string, string], ExportRow>(
        `SELECT * FROM encrypted_exports
          WHERE patient_id = ? AND expires_at > ?
          ORDER BY created_at DESC`,
      )
      .all(patientId, isoNow())
      .map((row) => ({
        id: row.id,
        patientId: row.patient_id,
        doctorId: row.doctor_id,
        doctorKeyId: row.doctor_key_id,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
      }));
  }

  deleteEncryptedExport(patientId: string, exportId: string) {
    const result = this.connection
      .prepare("DELETE FROM encrypted_exports WHERE id = ? AND patient_id = ?")
      .run(exportId, patientId);
    if (result.changes === 1) {
      this.audit(patientId, "doctor_export.revoke", "encrypted_export", exportId);
    }
    return result.changes === 1;
  }

  auditClinicalReportGeneration(
    patientId: string,
    responseId: string,
    metadata: { doctorId: string; model: string; entryCount: string },
  ) {
    this.audit(patientId, "clinical_report.generate", "provider_response", responseId, metadata);
  }

  private mapEncryptedExport(row: ExportRow): EncryptedDoctorExport {
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
    const exports = this.connection.prepare("DELETE FROM encrypted_exports WHERE expires_at <= ?").run(now);
    if (exports.changes > 0) this.connection.pragma("wal_checkpoint(PASSIVE)");
    return { exports: exports.changes };
  }
}
