import { inboxEnvelopeContext, openJson } from "@heyjule/crypto";
import type { ChatSummaryPayload, InboxEntry, PatientEntry } from "@heyjule/shared-types";

import type { SymptomLog } from "../types";

function assertChatSummary(value: unknown): asserts value is ChatSummaryPayload {
  if (!value || typeof value !== "object") throw new Error("Invalid chat summary");
  const payload = value as Partial<ChatSummaryPayload>;
  if (
    typeof payload.title !== "string" ||
    typeof payload.summary !== "string" ||
    typeof payload.occurredAt !== "string" ||
    payload.source !== "chatgpt" ||
    !Array.isArray(payload.noteworthy)
  ) {
    throw new Error("Invalid chat summary");
  }
}

function summarySeverity(payload: ChatSummaryPayload) {
  if (payload.noteworthy.some((item) => item.level === "critical")) return 5;
  if (payload.noteworthy.some((item) => item.level === "serious")) return 4;
  if (payload.noteworthy.some((item) => item.level === "notable")) return 2;
  return 1;
}

export function decryptInboxLog(entry: InboxEntry, privateKey: string): SymptomLog {
  const payload = openJson<unknown>(
    entry.envelope,
    privateKey,
    inboxEnvelopeContext(entry.id, entry.deviceId),
  );
  assertChatSummary(payload);
  return {
    id: `chat_${entry.id}`,
    createdAt: payload.occurredAt,
    note: payload.summary,
    symptoms: ["Other"],
    severity: summarySeverity(payload),
    source: "chat_summary",
    remoteEntryId: entry.id,
    syncStatus: "pending",
    chatSummary: payload,
  };
}

export function logToPatientEntry(log: SymptomLog): PatientEntry {
  if (log.chatSummary) {
    return {
      id: log.id,
      occurredAt: log.createdAt,
      kind: "chat_summary",
      source: "chatgpt_app_mcp",
      dataMode: "live",
      payload: {
        title: log.chatSummary.title,
        summary: log.chatSummary.summary,
        noteworthy: log.chatSummary.noteworthy,
        sourceInboxId: log.remoteEntryId,
      },
    };
  }
  return {
    id: log.id,
    occurredAt: log.createdAt,
    kind: "check_in",
    source: log.source === "voice" ? "in_app_conversation" : "patient_check_in",
    dataMode: "live",
    payload: {
      note: log.note,
      symptoms: log.symptoms,
      severity: log.severity,
      ...(log.treatment ? { treatment: log.treatment } : {}),
      ...(log.voiceDuration === undefined ? {} : { voiceDuration: log.voiceDuration }),
    },
  };
}
