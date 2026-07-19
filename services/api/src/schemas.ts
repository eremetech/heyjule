import { SEALED_ENVELOPE_ALGORITHM } from "@heyjule/shared-types";
import { z } from "zod";

const id = z.string().min(3).max(128).regex(/^[A-Za-z0-9_-]+$/u);
const base64url = z.string().min(16).max(32_768).regex(/^[A-Za-z0-9_-]+$/u);
const isoDate = z.iso.datetime({ offset: true });

export const sealedEnvelopeSchema = z.object({
  version: z.literal(1),
  algorithm: z.literal(SEALED_ENVELOPE_ALGORITHM),
  ephemeralPublicKey: base64url.max(200),
  salt: base64url.max(64),
  nonce: base64url.max(64),
  ciphertext: base64url.max(2_000_000),
  context: z.string().min(10).max(512),
});

export const registerDeviceSchema = z.object({
  deviceId: id,
  publicKey: base64url.max(200),
});

const patientEntryBase = {
  occurredAt: isoDate,
  dataMode: z.enum(["mock", "live"]),
};

const noteworthySchema = z.object({
  label: z.string().trim().min(1).max(160),
  detail: z.string().trim().max(1_000).optional(),
  level: z.enum(["notable", "serious", "critical"]).optional(),
});

export const patientEntrySchema = z.discriminatedUnion("kind", [
  z.object({
    ...patientEntryBase,
    kind: z.literal("check_in"),
    source: z.enum(["patient_check_in", "in_app_conversation"]),
    payload: z.object({
      title: z.string().trim().min(1).max(160).optional(),
      note: z.string().trim().min(1).max(12_000),
      symptoms: z.array(z.string().trim().min(1).max(100)).max(40),
      severity: z.number().min(0).max(10),
      treatment: z.string().trim().max(1_000).optional(),
      voiceDuration: z.number().nonnegative().max(86_400).optional(),
    }),
  }),
  z.object({
    ...patientEntryBase,
    kind: z.literal("chat_summary"),
    source: z.enum(["chatgpt_app_mcp", "in_app_conversation"]),
    payload: z.object({
      title: z.string().trim().min(1).max(160),
      summary: z.string().trim().min(1).max(12_000),
      noteworthy: z.array(noteworthySchema).max(20),
      sourceInboxId: id.optional(),
    }),
  }),
  z.object({
    ...patientEntryBase,
    kind: z.literal("prom"),
    source: z.literal("patient_reported_outcome"),
    payload: z.object({
      instrument: z.string().trim().min(1).max(160),
      item: z.string().trim().min(1).max(240),
      score: z.number().finite(),
      maxScore: z.number().positive().finite(),
      note: z.string().trim().max(1_000).optional(),
    }),
  }),
  z.object({
    ...patientEntryBase,
    kind: z.literal("wearable"),
    source: z.literal("apple_health"),
    payload: z.object({
      date: z.iso.date(),
      sleepMinutes: z.number().int().nonnegative().max(1_440),
      restingHeartRate: z.number().positive().max(300),
      steps: z.number().int().nonnegative().max(250_000),
      hrvMs: z.number().nonnegative().max(1_000),
    }),
  }),
  z.object({
    ...patientEntryBase,
    kind: z.literal("treatment"),
    source: z.literal("electronic_patient_record"),
    payload: z.object({
      name: z.string().trim().min(1).max(240),
      startedAt: z.iso.date(),
      endedAt: z.iso.date().optional(),
      outcome: z.string().trim().max(2_000).optional(),
    }),
  }),
]);

export const patientProfileSchema = z.object({
  name: z.string().trim().min(1).max(160),
  dateOfBirth: z.iso.date(),
  sex: z.string().trim().min(1).max(80),
});

export const claimCareInviteSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/u),
});

export const registerDoctorKeySchema = z.object({
  id,
  publicKey: base64url.max(200),
});

export const encryptedExportSchema = z.object({
  id,
  doctorId: id,
  doctorKeyId: id,
  envelope: sealedEnvelopeSchema,
  expiresAt: isoDate,
});

export const generateClinicalReportSchema = z.object({
  doctorId: id,
  timeframeDays: z.union([z.literal(7), z.literal(30), z.literal(90)]),
  scope: z.object({
    symptoms: z.boolean(),
    wearables: z.boolean(),
    treatments: z.boolean(),
    conversations: z.boolean(),
    proms: z.boolean(),
  }),
});

export const newEntrySchema = {
  title: z.string().trim().min(1).max(160).default("Chat summary"),
  summary: z.string().trim().min(1).max(12_000),
  occurred_at: isoDate.optional(),
  noteworthy: z
    .array(
      noteworthySchema,
    )
    .max(20)
    .default([]),
};

export { id as idSchema };
