import * as Crypto from "expo-crypto";
import type {
  CareRelationship,
  ClinicalReportScope,
  DoctorExportMetadata,
} from "@heyjule/shared-types";
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
import { sealClinicalReportForDoctor } from "../lib/doctor-export";
import { createHeyJuleApi } from "../lib/heyjule-api";
import {
  buildMockPatientEntries,
  MOCK_PATIENT_DATASET_VERSION,
  MOCK_PATIENT_PROFILE,
} from "../lib/mock-patient-data";
import { decryptInboxLog, logToPatientEntry } from "../lib/patient-sync";
import { secureJournal } from "../lib/secure-journal";
import type { SymptomLog } from "../types";

type HealthStoreValue = {
  hydrated: boolean;
  logs: SymptomLog[];
  careLinks: CareRelationship[];
  doctorExports: DoctorExportMetadata[];
  backendStatus: "offline" | "syncing" | "synced" | "error";
  syncNow: () => Promise<void>;
  claimCareInvite: (code: string) => Promise<{ doctorId: string; linkedAt: string }>;
  revokeCareRelationship: (doctorId: string) => Promise<void>;
  createDoctorExport: (
    doctorId: string,
    timeframeDays: 7 | 30 | 90,
    scope: ClinicalReportScope,
    durationDays: number,
  ) => Promise<DoctorExportMetadata>;
  revokeDoctorExport: (exportId: string) => Promise<void>;
  addLog: (entry: Omit<SymptomLog, "id" | "createdAt">) => Promise<void>;
};

const HealthStoreContext = createContext<HealthStoreValue | null>(null);

function makeId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`;
}

async function ensureMockPatientData(api: ReturnType<typeof createHeyJuleApi>) {
  if (!appConfig.mockDataEnabled) return;
  const previous = await secureJournal.readMockSeed();
  if (previous?.version === MOCK_PATIENT_DATASET_VERSION && previous.completed) return;
  const anchorIso = previous?.anchorIso ?? new Date().toISOString();
  await secureJournal.writeMockSeed({
    version: MOCK_PATIENT_DATASET_VERSION,
    anchorIso,
    completed: false,
  });
  await api.putPatientProfile(MOCK_PATIENT_PROFILE);
  for (const entry of buildMockPatientEntries(anchorIso)) await api.putPatientEntry(entry);
  await secureJournal.writeMockSeed({
    version: MOCK_PATIENT_DATASET_VERSION,
    anchorIso,
    completed: true,
  });
}

export function HealthStoreProvider({ children }: PropsWithChildren) {
  const auth = useAuth();
  const [hydrated, setHydrated] = useState(false);
  const [logs, setLogs] = useState<SymptomLog[]>([]);
  const [careLinks, setCareLinks] = useState<CareRelationship[]>([]);
  const [doctorExports, setDoctorExports] = useState<DoctorExportMetadata[]>([]);
  const [backendStatus, setBackendStatus] = useState<HealthStoreValue["backendStatus"]>("offline");
  const logsRef = useRef<SymptomLog[]>([]);
  const syncingRef = useRef(false);
  const api = useMemo(() => createHeyJuleApi(auth.getAccessToken), [auth.getAccessToken]);

  const persistLogs = useCallback(async (next: SymptomLog[]) => {
    await secureJournal.writeLogs(next);
    logsRef.current = next;
    setLogs(next);
  }, []);

  useEffect(() => {
    secureJournal.readLogs()
      .then((nextLogs) => {
        logsRef.current = nextLogs;
        setLogs(nextLogs);
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
      await ensureMockPatientData(api);
      const [relationships, exports] = await Promise.all([
        api.listCareRelationships(),
        api.listEncryptedExports(),
      ]);
      setCareLinks(relationships);
      setDoctorExports(exports);
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

  const claimCareInvite = useCallback(
    async (code: string) => {
      const relationship = await api.claimCareInvite(code.trim().toUpperCase());
      setCareLinks((current) => [relationship, ...current.filter((item) => item.doctorId !== relationship.doctorId)]);
      return relationship;
    },
    [api],
  );

  const revokeCareRelationship = useCallback(async (doctorId: string) => {
    await api.revokeCareRelationship(doctorId);
    setCareLinks((current) => current.filter((item) => item.doctorId !== doctorId));
  }, [api]);

  const createDoctorExport = useCallback(async (
    doctorId: string,
    timeframeDays: 7 | 30 | 90,
    scope: ClinicalReportScope,
    durationDays: number,
  ) => {
    const { report, doctorKey } = await api.generateClinicalReport({
      doctorId,
      timeframeDays,
      scope,
    });
    const exportId = makeId("export");
    const envelope = sealClinicalReportForDoctor(
      report,
      doctorKey,
      exportId,
      Crypto.getRandomBytes,
    );
    const receipt = await api.createEncryptedExport({
      id: exportId,
      doctorId,
      doctorKeyId: doctorKey.id,
      envelope,
      expiresAt: new Date(Date.now() + durationDays * 86_400_000).toISOString(),
    });
    const updated = await api.listEncryptedExports();
    setDoctorExports(updated);
    const metadata = updated.find((item) => item.id === receipt.id);
    if (!metadata) throw new Error("Created export was not returned by the API");
    return metadata;
  }, [api]);

  const revokeDoctorExport = useCallback(async (exportId: string) => {
    await api.revokeEncryptedExport(exportId);
    setDoctorExports((current) => current.filter((item) => item.id !== exportId));
  }, [api]);

  const value = useMemo(
    () => ({ hydrated, logs, careLinks, doctorExports, backendStatus, syncNow, addLog, claimCareInvite, revokeCareRelationship, createDoctorExport, revokeDoctorExport }),
    [addLog, backendStatus, careLinks, claimCareInvite, createDoctorExport, doctorExports, hydrated, logs, revokeCareRelationship, revokeDoctorExport, syncNow],
  );

  return <HealthStoreContext.Provider value={value}>{children}</HealthStoreContext.Provider>;
}

export function useHealthStore() {
  const store = useContext(HealthStoreContext);
  if (!store) throw new Error("useHealthStore must be used inside HealthStoreProvider");
  return store;
}
