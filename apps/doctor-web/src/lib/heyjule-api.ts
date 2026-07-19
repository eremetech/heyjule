import "server-only";

import type {
  CareInvite,
  DoctorPublicKey,
  EncryptedDoctorExport,
  LinkedPatient,
  PatientEntry,
} from "@heyjule/shared-types";
import { headers } from "next/headers";
import { cache } from "react";
import { auth } from "./auth";

const internalApiUrl = (
  process.env.HEYJULE_INTERNAL_API_URL ??
  process.env.HEYJULE_API_URL ??
  (process.env.NODE_ENV === "production"
    ? "https://api.jules.agenticsonar.com"
    : "http://localhost:8787")
).replace(/\/$/u, "");

export class HeyJuleApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

const accessToken = cache(async () => {
  const result = await auth.api.getToken({ headers: await headers() });
  if (!result?.token) throw new HeyJuleApiError(401, "Doctor API session is unavailable");
  return result.token;
});

async function request<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${internalApiUrl}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${await accessToken()}`,
      "X-Forwarded-Proto": "https",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    throw new HeyJuleApiError(response.status, `HeyJule API request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const heyJuleApi = {
  listPatients: async () => (await request<{ patients: LinkedPatient[] }>("/v1/doctor/patients")).patients,
  getPatientTimeline: (patientId: string) =>
    request<{ patient: LinkedPatient; entries: PatientEntry[] }>(
      `/v1/doctor/patients/${encodeURIComponent(patientId)}/entries`,
    ),
  listInvites: async () => (await request<{ invites: CareInvite[] }>("/v1/doctor/invites")).invites,
  createInvite: () => request<CareInvite>("/v1/doctor/invites", { method: "POST" }),
  revokeInvite: (inviteId: string) =>
    request<void>(`/v1/doctor/invites/${encodeURIComponent(inviteId)}`, { method: "DELETE" }),
  registerDoctorKey: (key: Pick<DoctorPublicKey, "id" | "publicKey">) =>
    request<DoctorPublicKey>("/v1/doctor/keys", {
      method: "POST",
      body: JSON.stringify(key),
    }),
  listPatientExports: async (patientId: string) =>
    (await request<{ exports: EncryptedDoctorExport[] }>(
      `/v1/doctor/patients/${encodeURIComponent(patientId)}/exports`,
    )).exports,
  getEncryptedExport: (exportId: string) =>
    request<EncryptedDoctorExport>(`/v1/exports/${encodeURIComponent(exportId)}`),
};
