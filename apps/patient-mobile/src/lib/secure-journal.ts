import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import type { SymptomLog } from "../types";

const LOGS_KEY = "heyjule.symptom-logs.v1";
const OWNER_KEY = "heyjule.journal-owner.v1";
const MOCK_SEED_KEY = "heyjule.mock-seed.v1";
const volatileWebStore = new Map<string, string>();

async function readValue(key: string) {
  if (Platform.OS === "web") return volatileWebStore.get(key) ?? null;
  return SecureStore.getItemAsync(key);
}

async function writeValue(key: string, value: string) {
  if (Platform.OS === "web") {
    volatileWebStore.set(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const stored = await readValue(key);
    return stored ? (JSON.parse(stored) as T) : fallback;
  } catch {
    return fallback;
  }
}

export const secureJournal = {
  readLogs: () => readJson<SymptomLog[]>(LOGS_KEY, []),
  writeLogs: (logs: SymptomLog[]) => writeValue(LOGS_KEY, JSON.stringify(logs)),
  claimOwner: async (subject: string) => {
    const owner = await readValue(OWNER_KEY);
    if (owner && owner !== subject) return false;
    if (!owner) await writeValue(OWNER_KEY, subject);
    return true;
  },
  readMockSeed: () =>
    readJson<{ version: string; anchorIso: string; completed: boolean } | null>(MOCK_SEED_KEY, null),
  writeMockSeed: (value: { version: string; anchorIso: string; completed: boolean }) =>
    writeValue(MOCK_SEED_KEY, JSON.stringify(value)),
};
