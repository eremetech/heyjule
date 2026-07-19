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

export const patientEntrySchema = z.object({
  occurredAt: isoDate,
  kind: z.enum(["check_in", "chat_summary", "prom", "wearable"]),
  payload: z.record(z.string(), z.unknown()),
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

export const newEntrySchema = {
  title: z.string().trim().min(1).max(160).default("Chat summary"),
  summary: z.string().trim().min(1).max(12_000),
  occurred_at: isoDate.optional(),
  noteworthy: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(160),
        detail: z.string().trim().max(1_000).optional(),
        level: z.enum(["notable", "serious", "critical"]).optional(),
      }),
    )
    .max(20)
    .default([]),
};

export { id as idSchema };
