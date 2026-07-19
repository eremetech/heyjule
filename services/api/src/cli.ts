import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { doctorExportEnvelopeContext, sealJson } from "@heyjule/crypto";
import { generateClinicalReport } from "./clinical-report.ts";
import { loadConfig } from "./config.ts";
import { ApiDatabase } from "./db.ts";

function careLink(patientId: string | undefined, doctorId: string | undefined) {
  if (!patientId || !doctorId) {
    throw new Error("Usage: pnpm --filter @heyjule/api care-link -- <patient-id> <doctor-id>");
  }
  const config = loadConfig();
  const database = new ApiDatabase(config.databasePath, config.dataKey);
  try {
    database.createCareRelationship(patientId, doctorId);
  } finally {
    database.close();
  }
  console.log(`Activated care relationship ${patientId} -> ${doctorId}`);
}

/**
 * Generates a clinical report from a patient's stored entries and seals it to
 * the doctor's registered key, exactly like the patient-app flow: same
 * provider call as /v1/patient/reports/generate, same envelope as /v1/exports.
 */
async function seedReport(
  patientId: string | undefined,
  doctorId: string | undefined,
  timeframeArg: string | undefined,
) {
  if (!patientId || !doctorId) {
    throw new Error(
      "Usage: pnpm --filter @heyjule/api seed-report -- <patient-id> <doctor-id> [timeframe-days]",
    );
  }
  const timeframeDays = Number(timeframeArg ?? "90");
  if (![7, 30, 90].includes(timeframeDays)) throw new Error("timeframe-days must be 7, 30 or 90");
  const config = loadConfig();
  if (!config.openaiApiKey) throw new Error("OPENAI_API_KEY is required to generate the report");
  const database = new ApiDatabase(config.databasePath, config.dataKey);
  try {
    const doctorKey = database.getDoctorKeyForPatient(patientId, doctorId);
    if (!doctorKey) {
      throw new Error("No active care relationship with a registered doctor key for that pair");
    }
    const profile = database.getPatientProfile(patientId);
    if (!profile) throw new Error(`Patient ${patientId} has no profile`);
    const report = await generateClinicalReport({
      apiKey: config.openaiApiKey,
      model: config.openaiModel,
      patient: profile,
      patientId,
      recipient: {
        doctorId,
        doctorName: database
          .listCareRelationships(patientId)
          .find((link) => link.doctorId === doctorId)?.doctorName,
      },
      entries: database.listPatientEntries(patientId),
      timeframeDays: timeframeDays as 7 | 30 | 90,
      scope: { symptoms: true, wearables: true, proms: true, treatments: true, conversations: true },
      fetch,
    });
    const exportId = `export_${Date.now().toString(36)}_${randomBytes(5).toString("hex")}`;
    const envelope = sealJson(
      report,
      doctorKey.publicKey,
      doctorExportEnvelopeContext(exportId, doctorKey.id),
      (length) => new Uint8Array(randomBytes(length)),
    );
    const now = new Date();
    const inserted = database.insertEncryptedExport({
      id: exportId,
      patientId,
      doctorId,
      doctorKeyId: doctorKey.id,
      envelope,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 7 * 86_400_000).toISOString(),
    });
    if (!inserted) throw new Error("Export rejected: care relationship is not active");
    console.log(
      `Sealed report ${exportId}: ${report.sourceEntryIds.length} entries over ${timeframeDays}d for doctor ${doctorId}`,
    );
  } finally {
    database.close();
  }
}

async function main() {
  const [, , command, ...args] = process.argv;
  if (command === "care-link") return careLink(args[0], args[1]);
  if (command === "seed-report") return seedReport(args[0], args[1], args[2]);
  throw new Error(`Unknown command: ${command ?? "(missing)"}`);
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
