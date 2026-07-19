import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";

import { generateEncryptionKeyPair, inboxEnvelopeContext, sealJson } from "@heyjule/crypto";
import type { ChatSummaryPayload, InboxEntry } from "@heyjule/shared-types";

import { decryptInboxLog, logToPatientEntry } from "../src/lib/patient-sync";

test("decrypts a device-sealed inbox summary and maps it to an idempotent patient entry", () => {
  const device = generateEncryptionKeyPair(randomBytes);
  const payload: ChatSummaryPayload = {
    title: "Appointment preparation",
    summary: "Symptoms increased after a dose change.",
    occurredAt: "2026-07-19T12:00:00.000Z",
    noteworthy: [{ label: "Dose change", level: "serious" }],
    source: "chatgpt",
  };
  const entry: InboxEntry = {
    id: "inbox_test",
    deviceId: "device_test",
    envelope: sealJson(
      payload,
      device.publicKey,
      inboxEnvelopeContext("inbox_test", "device_test"),
      randomBytes,
    ),
    createdAt: "2026-07-19T12:01:00.000Z",
    expiresAt: "2026-07-19T12:16:00.000Z",
  };

  const log = decryptInboxLog(entry, device.privateKey);
  assert.equal(log.id, "chat_inbox_test");
  assert.equal(log.severity, 4);
  assert.equal(log.note, payload.summary);
  assert.equal(log.remoteEntryId, entry.id);

  const patientEntry = logToPatientEntry(log);
  assert.equal(patientEntry.kind, "chat_summary");
  assert.equal(patientEntry.payload.sourceInboxId, entry.id);
  assert.deepEqual(patientEntry.payload.noteworthy, payload.noteworthy);
});

test("rejects an inbox envelope bound to another device context", () => {
  const device = generateEncryptionKeyPair(randomBytes);
  const entry: InboxEntry = {
    id: "inbox_test",
    deviceId: "device_expected",
    envelope: sealJson(
      { title: "x" },
      device.publicKey,
      inboxEnvelopeContext("inbox_test", "device_other"),
      randomBytes,
    ),
    createdAt: "2026-07-19T12:01:00.000Z",
    expiresAt: "2026-07-19T12:16:00.000Z",
  };
  assert.throws(() => decryptInboxLog(entry, device.privateKey), /context mismatch/u);
});
