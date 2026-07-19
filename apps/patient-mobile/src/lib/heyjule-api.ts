import type { DeviceRegistration, InboxEntry, PatientEntry } from "@heyjule/shared-types";

import { appConfig } from "./app-config";

type AccessTokenProvider = (forceRefresh?: boolean) => Promise<string | null>;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function createHeyJuleApi(getAccessToken: AccessTokenProvider) {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!appConfig.apiUrl) throw new ApiError(0, "HeyJule API is not configured");
    const accessToken = await getAccessToken();
    if (!accessToken) throw new ApiError(401, "Authentication required");
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
      throw new ApiError(response.status, `HeyJule API request failed (${response.status})`);
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
        body: JSON.stringify({ occurredAt: entry.occurredAt, kind: entry.kind, payload: entry.payload }),
      }),
  };
}

export type HeyJuleApi = ReturnType<typeof createHeyJuleApi>;
