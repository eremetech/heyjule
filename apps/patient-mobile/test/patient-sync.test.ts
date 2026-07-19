import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";

import {
  doctorExportEnvelopeContext,
  generateEncryptionKeyPair,
  inboxEnvelopeContext,
  openJson,
  sealJson,
} from "@heyjule/crypto";
import type { ChatSummaryPayload, ClinicalReport, DoctorPublicKey, InboxEntry } from "@heyjule/shared-types";

import { sealClinicalReportForDoctor } from "../src/lib/doctor-export";
import { buildMockPatientEntries } from "../src/lib/mock-patient-data";
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
  };

  const log = decryptInboxLog(entry, device.privateKey);
  assert.equal(log.id, "chat_inbox_test");
  assert.equal(log.severity, 4);
  assert.equal(log.note, payload.summary);
  assert.equal(log.remoteEntryId, entry.id);

  const patientEntry = logToPatientEntry(log);
  assert.equal(patientEntry.kind, "chat_summary");
  assert.equal(patientEntry.source, "chatgpt_app_mcp");
  assert.equal(patientEntry.dataMode, "live");
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
  };
  assert.throws(() => decryptInboxLog(entry, device.privateKey), /context mismatch/u);
});

test("deterministic mock data covers every future source boundary with explicit mock provenance", () => {
  const first = buildMockPatientEntries("2026-07-19T08:00:00.000Z");
  const second = buildMockPatientEntries("2026-07-19T08:00:00.000Z");
  assert.deepEqual(first, second);
  assert.ok(first.length >= 25);
  assert.ok(first.every((entry) => entry.dataMode === "mock"));
  const sources = new Set(first.map((entry) => entry.source));
  assert.deepEqual(
    sources,
    new Set([
      "in_app_conversation",
      "chatgpt_app_mcp",
      "apple_health",
      "electronic_patient_record",
      "patient_reported_outcome",
    ]),
  );
});

test("patient-side report sealing can be opened only by the selected doctor key", () => {
  const doctorKeys = generateEncryptionKeyPair(randomBytes);
  const otherKeys = generateEncryptionKeyPair(randomBytes);
  const doctorKey: DoctorPublicKey = {
    id: "doctor_key_test",
    doctorId: "doctor_test",
    publicKey: doctorKeys.publicKey,
    fingerprint: "test-fingerprint",
    createdAt: "2026-07-19T08:00:00.000Z",
  };
  const report: ClinicalReport = {
    version: 1,
    generatedAt: "2026-07-19T08:00:00.000Z",
    period: {
      from: "2026-06-19T08:00:00.000Z",
      to: "2026-07-19T08:00:00.000Z",
      timeframeDays: 30,
    },
    patient: { name: "Martina Keller", dateOfBirth: "1972-05-30", sex: "female" },
    headline: "Mock clinical draft",
    summary: "Generated from the supplied mock record.",
    findings: [],
    trends: [],
    sections: [],
    sources: [{ source: "apple_health", count: 2 }],
    sourceEntryIds: ["mock_wearable_1", "mock_wearable_2"],
    generation: { provider: "openai", model: "gpt-5.6", responseId: "resp_test" },
    disclaimer: "Clinician verification required.",
  };
  const exportId = "export_test";
  const envelope = sealClinicalReportForDoctor(report, doctorKey, exportId, randomBytes);
  const context = doctorExportEnvelopeContext(exportId, doctorKey.id);
  assert.deepEqual(openJson<ClinicalReport>(envelope, doctorKeys.privateKey, context), report);
  assert.throws(() => openJson(envelope, otherKeys.privateKey, context));
});
