import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const dbPath =
  process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "heyjule.db");

function createConnection() {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const conn = new Database(dbPath);
  conn.pragma("journal_mode = WAL");
  conn.pragma("foreign_keys = ON");
  migrate(conn);
  return conn;
}

function migrate(conn: Database.Database) {
  conn.exec(`
    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      date_of_birth TEXT NOT NULL,
      sex TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS patient_links (
      id TEXT PRIMARY KEY,
      doctor_id TEXT NOT NULL,
      patient_id TEXT REFERENCES patients(id),
      code TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'revoked')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      claimed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_links_doctor ON patient_links(doctor_id, status);

    CREATE TABLE IF NOT EXISTS symptom_events (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL REFERENCES patients(id),
      occurred_at TEXT NOT NULL,
      source TEXT NOT NULL CHECK (source IN ('voice', 'message', 'chat_summary')),
      title TEXT NOT NULL,
      detail TEXT NOT NULL,
      severity TEXT NOT NULL CHECK (severity IN ('mild', 'moderate', 'severe'))
    );
    CREATE INDEX IF NOT EXISTS idx_symptoms_patient ON symptom_events(patient_id, occurred_at);

    CREATE TABLE IF NOT EXISTS wearable_days (
      patient_id TEXT NOT NULL REFERENCES patients(id),
      date TEXT NOT NULL,
      sleep_minutes INTEGER,
      resting_hr INTEGER,
      steps INTEGER,
      hrv_ms INTEGER,
      PRIMARY KEY (patient_id, date)
    );

    CREATE TABLE IF NOT EXISTS briefs (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL REFERENCES patients(id),
      generated_at TEXT NOT NULL DEFAULT (datetime('now')),
      headline TEXT NOT NULL,
      summary TEXT NOT NULL
    );

    /* Expiring capability links embedded in the EPR PDF. */
    CREATE TABLE IF NOT EXISTS report_links (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      patient_id TEXT NOT NULL REFERENCES patients(id),
      doctor_name TEXT NOT NULL,
      reason TEXT NOT NULL,
      timeframe_days INTEGER NOT NULL DEFAULT 90,
      expires_at TEXT NOT NULL,
      revoked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    /* One QR handshake per sign-in attempt: desktop shows it, phone approves it. */
    CREATE TABLE IF NOT EXISTS qr_channels (
      id TEXT PRIMARY KEY,
      report_link_id TEXT NOT NULL REFERENCES report_links(id),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'consumed')),
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    /* Short-lived viewer sessions bound to one report link. The cookie carries
     * no Max-Age, so it dies with the browser; this row caps server-side TTL. */
    CREATE TABLE IF NOT EXISTS viewer_sessions (
      token_hash TEXT PRIMARY KEY,
      report_link_id TEXT NOT NULL REFERENCES report_links(id),
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    /* Patient-reported outcome measures, one row per instrument item per date.
     * note: optional context the patient (or a sync) attached to that entry. */
    CREATE TABLE IF NOT EXISTS prom_scores (
      patient_id TEXT NOT NULL REFERENCES patients(id),
      instrument TEXT NOT NULL,
      item TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      score REAL NOT NULL,
      max_score REAL NOT NULL,
      note TEXT,
      PRIMARY KEY (patient_id, instrument, item, recorded_at)
    );

    /* source: where the record was imported from (e.g. the practice EPR). */
    CREATE TABLE IF NOT EXISTS treatments (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL REFERENCES patients(id),
      name TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      outcome TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'EPR'
    );
  `);
}

/* Reuse the connection across Next.js dev hot-reloads. */
const globalForDb = globalThis as unknown as { __heyjuleDb?: Database.Database };
export const db = globalForDb.__heyjuleDb ?? createConnection();
globalForDb.__heyjuleDb = db;

export type Patient = {
  id: string;
  name: string;
  date_of_birth: string;
  sex: string;
};

export type PatientLink = {
  id: string;
  doctor_id: string;
  patient_id: string | null;
  code: string;
  status: "pending" | "active" | "revoked";
  created_at: string;
  claimed_at: string | null;
};

export type SymptomEvent = {
  id: string;
  patient_id: string;
  occurred_at: string;
  source: "voice" | "message" | "chat_summary";
  title: string;
  detail: string;
  severity: "mild" | "moderate" | "severe";
};

export type WearableDay = {
  patient_id: string;
  date: string;
  sleep_minutes: number | null;
  resting_hr: number | null;
  steps: number | null;
  hrv_ms: number | null;
};

export type Brief = {
  id: string;
  patient_id: string;
  generated_at: string;
  headline: string;
  summary: string;
};

/*
 * Access control: every patient-data read goes through patient_links and is
 * scoped to the requesting doctor with an active, consented link. There is no
 * unscoped read path — a patient id from the URL is never trusted on its own.
 */

export function listLinkedPatients(doctorId: string) {
  return db
    .prepare<[string], Patient & { claimed_at: string; last_symptom_at: string | null }>(
      `SELECT p.id, p.name, p.date_of_birth, p.sex, l.claimed_at,
              (SELECT MAX(occurred_at) FROM symptom_events s WHERE s.patient_id = p.id) AS last_symptom_at
         FROM patient_links l
         JOIN patients p ON p.id = l.patient_id
        WHERE l.doctor_id = ? AND l.status = 'active'
        ORDER BY p.name`
    )
    .all(doctorId);
}

export function getLinkedPatient(doctorId: string, patientId: string) {
  return db
    .prepare<[string, string], Patient & { claimed_at: string }>(
      `SELECT p.id, p.name, p.date_of_birth, p.sex, l.claimed_at
         FROM patient_links l
         JOIN patients p ON p.id = l.patient_id
        WHERE l.doctor_id = ? AND l.patient_id = ? AND l.status = 'active'`
    )
    .get(doctorId, patientId);
}

export function listPendingInvites(doctorId: string) {
  return db
    .prepare<[string], PatientLink>(
      `SELECT * FROM patient_links
        WHERE doctor_id = ? AND status = 'pending'
        ORDER BY created_at DESC`
    )
    .all(doctorId);
}

export function createInvite(doctorId: string, id: string, code: string) {
  db.prepare(
    `INSERT INTO patient_links (id, doctor_id, code) VALUES (?, ?, ?)`
  ).run(id, doctorId, code);
}

export function revokeInvite(doctorId: string, inviteId: string) {
  db.prepare(
    `UPDATE patient_links SET status = 'revoked'
      WHERE id = ? AND doctor_id = ? AND status = 'pending'`
  ).run(inviteId, doctorId);
}

export function getBrief(patientId: string) {
  return db
    .prepare<[string], Brief>(
      `SELECT * FROM briefs WHERE patient_id = ? ORDER BY generated_at DESC LIMIT 1`
    )
    .get(patientId);
}

export function listSymptoms(patientId: string) {
  return db
    .prepare<[string], SymptomEvent>(
      `SELECT * FROM symptom_events WHERE patient_id = ? ORDER BY occurred_at DESC`
    )
    .all(patientId);
}

export type ReportLink = {
  id: string;
  token: string;
  patient_id: string;
  doctor_name: string;
  reason: string;
  timeframe_days: number;
  expires_at: string;
  revoked: number;
  created_at: string;
};

export type QrChannel = {
  id: string;
  report_link_id: string;
  status: "pending" | "approved" | "consumed";
  expires_at: string;
};

export type PromScore = {
  instrument: string;
  item: string;
  recorded_at: string;
  score: number;
  max_score: number;
  note: string | null;
};

export type Treatment = {
  id: string;
  name: string;
  started_at: string;
  ended_at: string | null;
  outcome: string;
  source: string;
};

export function getReportLink(token: string) {
  return db
    .prepare<[string], ReportLink>(
      `SELECT * FROM report_links
        WHERE token = ? AND revoked = 0 AND expires_at > datetime('now')`
    )
    .get(token);
}

export function getReportLinkById(id: string) {
  return db
    .prepare<[string], ReportLink>(
      `SELECT * FROM report_links
        WHERE id = ? AND revoked = 0 AND expires_at > datetime('now')`
    )
    .get(id);
}

export function createQrChannel(id: string, reportLinkId: string, ttlSeconds: number) {
  db.prepare(
    `INSERT INTO qr_channels (id, report_link_id, expires_at)
     VALUES (?, ?, datetime('now', ?))`
  ).run(id, reportLinkId, `+${ttlSeconds} seconds`);
}

export function getQrChannel(id: string) {
  return db
    .prepare<[string], QrChannel>(
      `SELECT * FROM qr_channels WHERE id = ? AND expires_at > datetime('now')`
    )
    .get(id);
}

export function approveQrChannel(id: string) {
  const res = db
    .prepare(
      `UPDATE qr_channels SET status = 'approved'
        WHERE id = ? AND status = 'pending' AND expires_at > datetime('now')`
    )
    .run(id);
  return res.changes === 1;
}

export function consumeQrChannel(id: string) {
  const res = db
    .prepare(
      `UPDATE qr_channels SET status = 'consumed'
        WHERE id = ? AND status = 'approved' AND expires_at > datetime('now')`
    )
    .run(id);
  return res.changes === 1;
}

export function createViewerSession(tokenHash: string, reportLinkId: string, ttlSeconds: number) {
  db.prepare(
    `INSERT INTO viewer_sessions (token_hash, report_link_id, expires_at)
     VALUES (?, ?, datetime('now', ?))`
  ).run(tokenHash, reportLinkId, `+${ttlSeconds} seconds`);
}

export function getViewerSession(tokenHash: string) {
  return db
    .prepare<[string], { report_link_id: string }>(
      `SELECT report_link_id FROM viewer_sessions
        WHERE token_hash = ? AND expires_at > datetime('now')`
    )
    .get(tokenHash);
}

export function listPromScores(patientId: string) {
  return db
    .prepare<[string], PromScore>(
      `SELECT instrument, item, recorded_at, score, max_score, note
         FROM prom_scores WHERE patient_id = ?
        ORDER BY instrument, item, recorded_at`
    )
    .all(patientId);
}

export function listTreatments(patientId: string) {
  return db
    .prepare<[string], Treatment>(
      `SELECT id, name, started_at, ended_at, outcome, source
         FROM treatments WHERE patient_id = ?
        ORDER BY started_at DESC`
    )
    .all(patientId);
}

export function getPatientById(patientId: string) {
  return db
    .prepare<[string], Patient>(`SELECT * FROM patients WHERE id = ?`)
    .get(patientId);
}

export function listWearableDays(patientId: string, days = 14) {
  return db
    .prepare<[string, number], WearableDay>(
      `SELECT * FROM wearable_days WHERE patient_id = ?
        ORDER BY date DESC LIMIT ?`
    )
    .all(patientId, days)
    .reverse();
}
