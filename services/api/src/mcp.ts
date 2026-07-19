import { randomBytes, randomUUID } from "node:crypto";
import { inboxEnvelopeContext, sealJson } from "@heyjule/crypto";
import type { ChatSummaryPayload, InboxEntry } from "@heyjule/shared-types";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Principal } from "./auth.ts";
import type { ApiDatabase } from "./db.ts";
import { newEntrySchema } from "./schemas.ts";

export const ENTRY_WRITE_SCOPE = "entry:write";
export type NewEntryInput = {
  title?: string;
  summary: string;
  occurred_at?: string;
  noteworthy?: Array<{
    label: string;
    detail?: string;
    level?: "notable" | "serious" | "critical";
  }>;
};

export function storeNewEntry(
  database: ApiDatabase,
  patientId: string,
  input: Required<Pick<NewEntryInput, "summary">> & Omit<NewEntryInput, "summary">,
  now = new Date(),
) {
  const device = database.getLatestDevice(patientId);
  if (!device) return { status: "device_required" as const };

  const id = `inbox_${randomUUID()}`;
  const createdAt = now.toISOString();
  const payload: ChatSummaryPayload = {
    title: input.title?.trim() || "Chat summary",
    summary: input.summary.trim(),
    occurredAt: input.occurred_at ?? createdAt,
    noteworthy: input.noteworthy ?? [],
    source: "chatgpt",
  };
  const envelope = sealJson(
    payload,
    device.publicKey,
    inboxEnvelopeContext(id, device.id),
    randomBytes,
  );
  const entry: InboxEntry = { id, deviceId: device.id, envelope, createdAt };
  database.insertInboxEntry(entry, patientId);
  return { status: "stored" as const, entry };
}

function oauthChallenge(resourceMetadataUrl: string, errorDescription: string) {
  const challenge = `Bearer resource_metadata="${resourceMetadataUrl}", error="insufficient_scope", error_description="${errorDescription}"`;
  return {
    content: [{ type: "text" as const, text: errorDescription }],
    _meta: { "mcp/www_authenticate": [challenge] },
    isError: true,
  };
}

export function createMcpServer(options: {
  database: ApiDatabase;
  principal: Principal | null;
  resourceMetadataUrl: string;
}) {
  const server = new McpServer({ name: "heyjule", version: "0.1.0" });

  server.registerTool(
    "new_entry",
    {
      title: "Send a summary to HeyJule",
      description:
        "After the patient explicitly asks, send a concise health-chat summary to their HeyJule device. Send only the minimum useful summary and noteworthy items, never the full transcript. The sealed entry remains available until the device securely saves and acknowledges it.",
      inputSchema: newEntrySchema,
      outputSchema: {
        status: z.literal("stored"),
        receipt_id: z.string(),
      },
      annotations: {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      _meta: {
        securitySchemes: [{ type: "oauth2", scopes: [ENTRY_WRITE_SCOPE] }],
        "openai/toolInvocation/invoking": "Sealing summary for your device…",
        "openai/toolInvocation/invoked": "Summary is ready in HeyJule",
      },
    },
    async (args) => {
      const principal = options.principal;
      if (
        !principal ||
        principal.role !== "patient" ||
        !principal.scopes.has(ENTRY_WRITE_SCOPE)
      ) {
        return oauthChallenge(
          options.resourceMetadataUrl,
          "Connect your HeyJule patient account to send this summary.",
        );
      }

      const result = storeNewEntry(options.database, principal.sub, args);
      if (result.status === "device_required") {
        return {
          content: [
            {
              type: "text" as const,
              text: "Open HeyJule on your phone once to register this device, then try again.",
            },
          ],
          isError: true,
        };
      }

      // Never echo the summary back in tool output: it is already present in
      // the conversation, and duplication only expands the disclosure surface.
      const structuredContent = {
        status: "stored" as const,
        receipt_id: result.entry.id,
      };
      return {
        content: [
          {
            type: "text" as const,
            text: "The summary was sealed for your HeyJule device and will be delivered the next time it syncs.",
          },
        ],
        structuredContent,
      };
    },
  );

  return server;
}
