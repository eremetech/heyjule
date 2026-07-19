import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import {
  doctorExportEnvelopeContext,
  generateEncryptionKeyPair,
  openJson,
  sealJson,
} from "./index.ts";

test("seals JSON so only the matching private key and context can open it", () => {
  const doctor = generateEncryptionKeyPair(randomBytes);
  const stranger = generateEncryptionKeyPair(randomBytes);
  const context = doctorExportEnvelopeContext("export_1", "key_1");
  const value = { patient: "patient_1", summary: "sensitive clinical summary" };
  const envelope = sealJson(value, doctor.publicKey, context, randomBytes);

  assert.deepEqual(openJson(envelope, doctor.privateKey, context), value);
  assert.doesNotMatch(JSON.stringify(envelope), /sensitive clinical summary/u);
  assert.throws(() => openJson(envelope, stranger.privateKey, context));
  assert.throws(() => openJson(envelope, doctor.privateKey, `${context}:tampered`));
});
