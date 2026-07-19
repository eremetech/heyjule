import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import type { ShareGrant, SymptomLog } from "../types";

const LOGS_KEY = "heyjule.symptom-logs.v1";
const GRANTS_KEY = "heyjule.share-grants.v1";
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
  readGrants: () => readJson<ShareGrant[]>(GRANTS_KEY, []),
  writeGrants: (grants: ShareGrant[]) => writeValue(GRANTS_KEY, JSON.stringify(grants)),
};
