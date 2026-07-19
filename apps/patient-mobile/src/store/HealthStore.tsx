import * as Crypto from "expo-crypto";
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { secureJournal } from "../lib/secure-journal";
import type { ShareGrant, ShareScope, SymptomLog } from "../types";

type HealthStoreValue = {
  hydrated: boolean;
  logs: SymptomLog[];
  grants: ShareGrant[];
  addLog: (entry: Omit<SymptomLog, "id" | "createdAt">) => Promise<void>;
  createGrant: (scope: ShareScope, durationDays: number) => Promise<ShareGrant>;
  revokeGrant: (id: string) => Promise<void>;
};

const HealthStoreContext = createContext<HealthStoreValue | null>(null);

function makeId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function makeCode() {
  const bytes = await Crypto.getRandomBytesAsync(6);
  return [0, 2, 4]
    .map((index) => ((((bytes[index] ?? 0) << 8) | (bytes[index + 1] ?? 0)) % 900) + 100)
    .join("-");
}

export function HealthStoreProvider({ children }: PropsWithChildren) {
  const [hydrated, setHydrated] = useState(false);
  const [logs, setLogs] = useState<SymptomLog[]>([]);
  const [grants, setGrants] = useState<ShareGrant[]>([]);

  useEffect(() => {
    Promise.all([secureJournal.readLogs(), secureJournal.readGrants()])
      .then(([nextLogs, nextGrants]) => {
        setLogs(nextLogs);
        setGrants(nextGrants);
      })
      .finally(() => setHydrated(true));
  }, []);

  const addLog = useCallback(async (entry: Omit<SymptomLog, "id" | "createdAt">) => {
    const log: SymptomLog = {
      ...entry,
      id: makeId("log"),
      createdAt: new Date().toISOString(),
    };
    const next = [log, ...logs];
    await secureJournal.writeLogs(next);
    setLogs(next);
  }, [logs]);

  const createGrant = useCallback(async (scope: ShareScope, durationDays: number) => {
    const expiresAt = new Date(Date.now() + durationDays * 86_400_000).toISOString();
    const grant: ShareGrant = {
      id: makeId("grant"),
      code: await makeCode(),
      expiresAt,
      scope,
      status: "active",
    };
    const next = [grant, ...grants];
    await secureJournal.writeGrants(next);
    setGrants(next);
    return grant;
  }, [grants]);

  const revokeGrant = useCallback(async (id: string) => {
    const next = grants.map((grant) => (grant.id === id ? { ...grant, status: "revoked" as const } : grant));
    await secureJournal.writeGrants(next);
    setGrants(next);
  }, [grants]);

  const value = useMemo(
    () => ({ hydrated, logs, grants, addLog, createGrant, revokeGrant }),
    [addLog, createGrant, grants, hydrated, logs, revokeGrant],
  );

  return <HealthStoreContext.Provider value={value}>{children}</HealthStoreContext.Provider>;
}

export function useHealthStore() {
  const store = useContext(HealthStoreContext);
  if (!store) throw new Error("useHealthStore must be used inside HealthStoreProvider");
  return store;
}
