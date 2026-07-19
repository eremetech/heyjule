import type { ChatSummaryPayload } from "@heyjule/shared-types";

export type SymptomKind = "Headache" | "Fatigue" | "Nausea" | "Pain" | "Dizziness" | "Other";

export type SymptomLog = {
  id: string;
  createdAt: string;
  note: string;
  symptoms: SymptomKind[];
  severity: number;
  treatment?: string;
  source: "text" | "voice" | "chat_summary";
  voiceDuration?: number;
  remoteEntryId?: string;
  syncStatus?: "pending" | "synced";
  chatSummary?: ChatSummaryPayload;
};

export type ShareScope = {
  symptoms: boolean;
  wearables: boolean;
  treatments: boolean;
  conversations: boolean;
};

export type ShareGrant = {
  id: string;
  code: string;
  expiresAt: string;
  scope: ShareScope;
  status: "active" | "revoked";
};

export type AppRoute = "home" | "checkin" | "health" | "journal" | "share";
