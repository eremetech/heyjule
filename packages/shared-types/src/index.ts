export const SEALED_ENVELOPE_ALGORITHM = "P256-HKDF-SHA256-A256GCM" as const;

/**
 * A versioned end-to-end encrypted payload. The ciphertext includes the
 * authentication tag. `context` is authenticated as AAD and must match the
 * operation and record id expected by the recipient.
 */
export type SealedEnvelope = {
  version: 1;
  algorithm: typeof SEALED_ENVELOPE_ALGORITHM;
  ephemeralPublicKey: string;
  salt: string;
  nonce: string;
  ciphertext: string;
  context: string;
};

export type NoteworthyEntry = {
  label: string;
  detail?: string;
  level?: "notable" | "serious" | "critical";
};

/** The deliberately-minimal payload accepted by the ChatGPT `new_entry` tool. */
export type ChatSummaryPayload = {
  title: string;
  summary: string;
  occurredAt: string;
  noteworthy: NoteworthyEntry[];
  source: "chatgpt";
};

export type DeviceRegistration = {
  deviceId: string;
  publicKey: string;
};

export type InboxEntry = {
  id: string;
  deviceId: string;
  envelope: SealedEnvelope;
  createdAt: string;
};

export const PATIENT_ENTRY_SOURCES = [
  "patient_check_in",
  "in_app_conversation",
  "chatgpt_app_mcp",
  "apple_health",
  "electronic_patient_record",
  "patient_reported_outcome",
] as const;

export type PatientEntrySource = (typeof PATIENT_ENTRY_SOURCES)[number];
export type PatientDataMode = "mock" | "live";

type PatientEntryBase<
  Kind extends string,
  Source extends PatientEntrySource,
  Payload extends Record<string, unknown>,
> = {
  id: string;
  occurredAt: string;
  kind: Kind;
  source: Source;
  dataMode: PatientDataMode;
  payload: Payload;
};

export type CheckInEntry = PatientEntryBase<
  "check_in",
  "patient_check_in" | "in_app_conversation",
  {
    title?: string;
    note: string;
    symptoms: string[];
    severity: number;
    treatment?: string;
    voiceDuration?: number;
  }
>;

export type ChatSummaryEntry = PatientEntryBase<
  "chat_summary",
  "chatgpt_app_mcp" | "in_app_conversation",
  {
    title: string;
    summary: string;
    noteworthy: NoteworthyEntry[];
    sourceInboxId?: string;
  }
>;

export type PromEntry = PatientEntryBase<
  "prom",
  "patient_reported_outcome",
  {
    instrument: string;
    item: string;
    score: number;
    maxScore: number;
    note?: string;
  }
>;

export type WearableEntry = PatientEntryBase<
  "wearable",
  "apple_health",
  {
    date: string;
    sleepMinutes: number;
    restingHeartRate: number;
    steps: number;
    hrvMs: number;
  }
>;

export type TreatmentEntry = PatientEntryBase<
  "treatment",
  "electronic_patient_record",
  {
    name: string;
    startedAt: string;
    endedAt?: string;
    outcome?: string;
  }
>;

export type PatientEntry =
  | CheckInEntry
  | ChatSummaryEntry
  | PromEntry
  | WearableEntry
  | TreatmentEntry;

export type PatientProfile = {
  name: string;
  dateOfBirth: string;
  sex: string;
};

export type LinkedPatient = {
  id: string;
  profile: PatientProfile | null;
  linkedAt: string;
  lastEntryAt: string | null;
};

export type CareInvite = {
  id: string;
  code: string;
  createdAt: string;
  expiresAt: string;
};

export type CareRelationship = {
  doctorId: string;
  doctorName?: string;
  linkedAt: string;
};

export type DoctorPublicKey = {
  id: string;
  doctorId: string;
  publicKey: string;
  fingerprint: string;
  createdAt: string;
};

export type EncryptedDoctorExport = {
  id: string;
  patientId: string;
  doctorId: string;
  doctorKeyId: string;
  envelope: SealedEnvelope;
  createdAt: string;
  expiresAt: string;
};

export type DoctorExportMetadata = Omit<EncryptedDoctorExport, "envelope">;

export type ClinicalReportScope = {
  symptoms: boolean;
  wearables: boolean;
  treatments: boolean;
  conversations: boolean;
  proms: boolean;
};

export type ClinicalReportFinding = {
  title: string;
  detail: string;
  level: "notable" | "attention" | "urgent";
  evidenceEntryIds: string[];
};

export type ClinicalReportTrend = {
  metric: string;
  direction: "improving" | "stable" | "worsening" | "mixed";
  detail: string;
  evidenceEntryIds: string[];
};

export type ClinicalReportSection = {
  key: "symptoms" | "wearables" | "proms" | "treatments" | "conversations";
  summary: string;
  evidenceEntryIds: string[];
};

/**
 * The plaintext report exists only transiently while the patient requests it
 * and while the intended doctor's browser renders it. Persisted exports store
 * this value only inside a `SealedEnvelope` targeted to the doctor's key.
 */
export type ClinicalReport = {
  version: 1;
  generatedAt: string;
  period: { from: string; to: string; timeframeDays: number };
  patient: PatientProfile;
  headline: string;
  summary: string;
  findings: ClinicalReportFinding[];
  trends: ClinicalReportTrend[];
  sections: ClinicalReportSection[];
  sources: Array<{ source: PatientEntrySource; count: number }>;
  sourceEntryIds: string[];
  /** The structured entries the report was generated from, so the viewer can
   * render PROM tables, treatments and wearable summaries instead of prose.
   * Absent in envelopes sealed before this field existed. */
  entries?: PatientEntry[];
  /** Stable identifier of the patient in the HeyJule API. */
  patientId?: string;
  /** Clinician this report was generated for. */
  recipient?: { doctorId: string; doctorName?: string };
  /** Short chart-header facts extracted from the record (e.g. menopause stage, migraine). */
  keyFacts?: Array<{ label: string; value: string }>;
  /** Suggested talking points for the next visit, one short line each. */
  discussionPoints?: string[];
  generation: {
    provider: "openai";
    model: string;
    responseId: string;
  };
  disclaimer: string;
};

export type GenerateClinicalReportRequest = {
  doctorId: string;
  timeframeDays: 7 | 30 | 90;
  scope: ClinicalReportScope;
};
