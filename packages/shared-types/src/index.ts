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
  expiresAt: string;
};

export type PatientEntry = {
  id: string;
  occurredAt: string;
  kind: "check_in" | "chat_summary" | "prom" | "wearable";
  payload: Record<string, unknown>;
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
