import type {
  CareRelationship,
  ClinicalReport,
  DeviceRegistration,
  DoctorExportMetadata,
  DoctorPublicKey,
  EncryptedDoctorExport,
  GenerateClinicalReportRequest,
  InboxEntry,
  PatientEntry,
  PatientProfile,
} from "@heyjule/shared-types";

import { appConfig } from "./app-config";

type AccessTokenProvider = (forceRefresh?: boolean) => Promise<string | null>;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function createHeyJuleApi(getAccessToken: AccessTokenProvider) {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!appConfig.apiUrl) throw new ApiError(0, "api_not_configured", "HeyJule API is not configured");
    const accessToken = await getAccessToken();
    if (!accessToken) throw new ApiError(401, "authentication_required", "Authentication required");
    const perform = (token: string) => fetch(`${appConfig.apiUrl}${path}`, {
        ...init,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...init.headers,
        },
      });
    let response = await perform(accessToken);
    if (response.status === 401) {
      const refreshedToken = await getAccessToken(true);
      if (refreshedToken && refreshedToken !== accessToken) response = await perform(refreshedToken);
    }
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: unknown } | null;
      const code = typeof body?.error === "string" ? body.error : "api_request_failed";
      throw new ApiError(response.status, code, `HeyJule API request failed: ${code}`);
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }

  return {
    getSession: () => request<{ subject: string; role: "patient" | "doctor" | "service" }>("/v1/session"),
    getVoiceToken: () => request<{ token: string; expiresAt: number }>("/v1/voice/token", { method: "POST" }),
    registerDevice: (device: DeviceRegistration) =>
      request<{ deviceId: string; fingerprint: string }>("/v1/devices", {
        method: "PUT",
        body: JSON.stringify(device),
      }),
    listInbox: async (deviceId: string) => {
      const result = await request<{ entries: InboxEntry[] }>(
        `/v1/inbox?device_id=${encodeURIComponent(deviceId)}`,
      );
      return result.entries;
    },
    acknowledgeInbox: (entryId: string, deviceId: string) =>
      request<void>(
        `/v1/inbox/${encodeURIComponent(entryId)}?device_id=${encodeURIComponent(deviceId)}`,
        { method: "DELETE" },
      ),
    putPatientEntry: (entry: PatientEntry) =>
      request<{ id: string; stored: true }>(`/v1/patient/entries/${encodeURIComponent(entry.id)}`, {
        method: "PUT",
        body: JSON.stringify({
          occurredAt: entry.occurredAt,
          kind: entry.kind,
          source: entry.source,
          dataMode: entry.dataMode,
          payload: entry.payload,
        }),
      }),
    putPatientProfile: (profile: PatientProfile) =>
      request<{ stored: true }>("/v1/patient/profile", {
        method: "PUT",
        body: JSON.stringify(profile),
      }),
    claimCareInvite: (code: string) =>
      request<{ doctorId: string; linkedAt: string }>("/v1/patient/care-links/claim", {
        method: "POST",
        body: JSON.stringify({ code }),
      }),
    listCareRelationships: async () =>
      (await request<{ relationships: CareRelationship[] }>("/v1/patient/care-links")).relationships,
    revokeCareRelationship: (doctorId: string) =>
      request<void>(`/v1/patient/care-links/${encodeURIComponent(doctorId)}`, { method: "DELETE" }),
    getDoctorPublicKey: (doctorId: string) =>
      request<DoctorPublicKey>(`/v1/patient/doctors/${encodeURIComponent(doctorId)}/key`),
    generateClinicalReport: (value: GenerateClinicalReportRequest) =>
      request<{ report: ClinicalReport; doctorKey: DoctorPublicKey }>(
        "/v1/patient/reports/generate",
        { method: "POST", body: JSON.stringify(value) },
      ),
    createEncryptedExport: (
      value: Pick<EncryptedDoctorExport, "id" | "doctorId" | "doctorKeyId" | "envelope" | "expiresAt">,
    ) => request<{ id: string; createdAt: string; expiresAt: string }>("/v1/exports", {
      method: "POST",
      body: JSON.stringify(value),
    }),
    listEncryptedExports: async () =>
      (await request<{ exports: DoctorExportMetadata[] }>("/v1/patient/exports")).exports,
    revokeEncryptedExport: (exportId: string) =>
      request<void>(`/v1/exports/${encodeURIComponent(exportId)}`, { method: "DELETE" }),
  };
}

export type HeyJuleApi = ReturnType<typeof createHeyJuleApi>;
