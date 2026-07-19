import { pathToFileURL } from "node:url";
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

function main() {
  const [, , command, patientId, doctorId] = process.argv;
  if (command !== "care-link") throw new Error(`Unknown command: ${command ?? "(missing)"}`);
  careLink(patientId, doctorId);
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) main();
