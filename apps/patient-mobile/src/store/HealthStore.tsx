import * as Crypto from "expo-crypto";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";

import { useAuth } from "../auth/AuthProvider";
import { appConfig } from "../lib/app-config";
import { getOrCreateDeviceIdentity } from "../lib/device-identity";
import { createHeyJuleApi } from "../lib/heyjule-api";
import { decryptInboxLog, logToPatientEntry } from "../lib/patient-sync";
import { secureJournal } from "../lib/secure-journal";
import type { ShareGrant, ShareScope, SymptomLog } from "../types";

type HealthStoreValue = {
  hydrated: boolean;
  logs: SymptomLog[];
  grants: ShareGrant[];
  backendStatus: "offline" | "syncing" | "synced" | "error";
  syncNow: () => Promise<void>;
  addLog: (entry: Omit<SymptomLog, "id" | "createdAt">) => Promise<void>;
  createGrant: (scope: ShareScope, durationDays: number) => Promise<ShareGrant>;
  revokeGrant: (id: string) => Promise<void>;
};

const HealthStoreContext = createContext<HealthStoreValue | null>(null);

function makeId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`;
}

async function makeCode() {
  const bytes = await Crypto.getRandomBytesAsync(6);
  return [0, 2, 4]
    .map((index) => ((((bytes[index] ?? 0) << 8) | (bytes[index + 1] ?? 0)) % 900) + 100)
    .join("-");
}

export function HealthStoreProvider({ children }: PropsWithChildren) {
  const auth = useAuth();
  const [hydrated, setHydrated] = useState(false);
  const [logs, setLogs] = useState<SymptomLog[]>([]);
  const [grants, setGrants] = useState<ShareGrant[]>([]);
  const [backendStatus, setBackendStatus] = useState<HealthStoreValue["backendStatus"]>("offline");
  const logsRef = useRef<SymptomLog[]>([]);
  const grantsRef = useRef<ShareGrant[]>([]);
  const syncingRef = useRef(false);
  const api = useMemo(() => createHeyJuleApi(auth.getAccessToken), [auth.getAccessToken]);

  const persistLogs = useCallback(async (next: SymptomLog[]) => {
    await secureJournal.writeLogs(next);
    logsRef.current = next;
    setLogs(next);
  }, []);

  const persistGrants = useCallback(async (next: ShareGrant[]) => {
    await secureJournal.writeGrants(next);
    grantsRef.current = next;
    setGrants(next);
  }, []);

  useEffect(() => {
    Promise.all([secureJournal.readLogs(), secureJournal.readGrants()])
      .then(([nextLogs, nextGrants]) => {
        logsRef.current = nextLogs;
        grantsRef.current = nextGrants;
        setLogs(nextLogs);
        setGrants(nextGrants);
      })
      .finally(() => setHydrated(true));
  }, []);

  const syncLog = useCallback(async (log: SymptomLog) => {
    await api.putPatientEntry(logToPatientEntry(log));
    const current = logsRef.current;
    const next = current.map((item) =>
      item.id === log.id ? { ...item, syncStatus: "synced" as const } : item,
    );
    await persistLogs(next);
  }, [api, persistLogs]);

  const syncNow = useCallback(async () => {
    if (
      syncingRef.current ||
      !hydrated ||
      !auth.signedIn ||
      !appConfig.apiUrl
    ) return;
    syncingRef.current = true;
    setBackendStatus("syncing");
    let hadEntryError = false;
    try {
      const session = await api.getSession();
      if (session.role !== "patient" || !(await secureJournal.claimOwner(session.subject))) {
        setBackendStatus("error");
        return;
      }
      const device = await getOrCreateDeviceIdentity();
      if (!device) {
        setBackendStatus("offline");
        return;
      }
      await api.registerDevice({ deviceId: device.deviceId, publicKey: device.publicKey });

      for (const log of logsRef.current.filter((item) => item.syncStatus !== "synced")) {
        try {
          await syncLog(log);
        } catch {
          hadEntryError = true;
        }
      }

      const inbox = await api.listInbox(device.deviceId);
      for (const entry of inbox) {
        try {
          let local = logsRef.current.find((item) => item.remoteEntryId === entry.id);
          if (!local) {
            local = decryptInboxLog(entry, device.privateKey);
            await persistLogs([local, ...logsRef.current]);
          }
          if (local.syncStatus !== "synced") await syncLog(local);
          await api.acknowledgeInbox(entry.id, device.deviceId);
        } catch {
          // Never acknowledge an item that failed decryption or durable persistence.
          hadEntryError = true;
        }
      }
      setBackendStatus(hadEntryError ? "error" : "synced");
    } catch {
      setBackendStatus("error");
    } finally {
      syncingRef.current = false;
    }
  }, [api, auth.signedIn, hydrated, persistLogs, syncLog]);

  useEffect(() => {
    if (!hydrated || !auth.signedIn) {
      setBackendStatus("offline");
      return;
    }
    void syncNow();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void syncNow();
    });
    const interval = setInterval(() => void syncNow(), 60_000);
    return () => {
      subscription.remove();
      clearInterval(interval);
    };
  }, [auth.signedIn, hydrated, syncNow]);

  const addLog = useCallback(async (entry: Omit<SymptomLog, "id" | "createdAt">) => {
    const log: SymptomLog = {
      ...entry,
      id: makeId("log"),
      createdAt: new Date().toISOString(),
      syncStatus: "pending",
    };
    await persistLogs([log, ...logsRef.current]);
    void syncNow();
  }, [persistLogs, syncNow]);

  const createGrant = useCallback(async (scope: ShareScope, durationDays: number) => {
    const expiresAt = new Date(Date.now() + durationDays * 86_400_000).toISOString();
    const grant: ShareGrant = {
      id: makeId("grant"),
      code: await makeCode(),
      expiresAt,
      scope,
      status: "active",
    };
    const next = [grant, ...grantsRef.current];
    await persistGrants(next);
    return grant;
  }, [persistGrants]);

  const revokeGrant = useCallback(async (id: string) => {
    const next = grantsRef.current.map((grant) =>
      grant.id === id ? { ...grant, status: "revoked" as const } : grant,
    );
    await persistGrants(next);
  }, [persistGrants]);

  const value = useMemo(
    () => ({ hydrated, logs, grants, backendStatus, syncNow, addLog, createGrant, revokeGrant }),
    [addLog, backendStatus, createGrant, grants, hydrated, logs, revokeGrant, syncNow],
  );

  return <HealthStoreContext.Provider value={value}>{children}</HealthStoreContext.Provider>;
}

export function useHealthStore() {
  const store = useContext(HealthStoreContext);
  if (!store) throw new Error("useHealthStore must be used inside HealthStoreProvider");
  return store;
}
