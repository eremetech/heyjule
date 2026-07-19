import { openai, type OpenAILanguageModelResponsesOptions } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  streamText,
  type UIMessage,
  validateUIMessages,
} from "ai";
import { takeReportChatRequest } from "@/lib/chat-rate-limit";
import { getReportLink } from "@/lib/db";
import {
  getAuthorizedViewerSessionHash,
} from "@/lib/report-auth";
import {
  buildReportChatContext,
  reportChatInstructions,
} from "@/lib/report-chat";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BODY_BYTES = 32_000;
const MAX_MESSAGES = 20;
const MAX_QUESTION_CHARS = 1_500;
const MAX_CONVERSATION_CHARS = 16_000;
const REPORT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,256}$/;

function textResponse(message: string, status: number, headers?: HeadersInit) {
  return new Response(message, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      "Content-Type": "text/plain; charset=utf-8",
      ...headers,
    },
  });
}

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function textFromMessage(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return textResponse("Invalid request origin.", 403);

  const declaredSize = Number(request.headers.get("content-length") ?? 0);
  if (declaredSize > MAX_BODY_BYTES) {
    return textResponse("Chat request is too large.", 413);
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return textResponse("Chat request is too large.", 413);
  }

  let body: { reportToken?: unknown; messages?: unknown };
  try {
    body = JSON.parse(rawBody) as typeof body;
  } catch {
    return textResponse("Invalid chat request.", 400);
  }

  if (
    typeof body.reportToken !== "string" ||
    !REPORT_TOKEN_PATTERN.test(body.reportToken)
  ) {
    return textResponse("Invalid report session.", 400);
  }

  const link = getReportLink(body.reportToken);
  if (!link) return textResponse("This report link is no longer available.", 401);

  const viewerSessionHash = await getAuthorizedViewerSessionHash(link);
  if (!viewerSessionHash) {
    return textResponse("Your report session expired. Sign in again to continue.", 401);
  }

  const limit = takeReportChatRequest(viewerSessionHash);
  if (!limit.allowed) {
    return textResponse("Too many questions. Please wait a few minutes and try again.", 429, {
      "Retry-After": String(limit.retryAfterSeconds),
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    return textResponse(
      "Report chat is not configured. Add OPENAI_API_KEY to the doctor web environment.",
      503
    );
  }

  if (
    process.env.NODE_ENV === "production" &&
    process.env.OPENAI_PHI_ENABLED !== "true"
  ) {
    return textResponse(
      "Report chat is disabled for clinical data until its privacy configuration is approved.",
      503
    );
  }

  let validatedMessages: UIMessage[];
  try {
    validatedMessages = await validateUIMessages<UIMessage>({
      messages: body.messages,
    });
  } catch {
    return textResponse("Invalid chat messages.", 400);
  }

  if (validatedMessages.length < 1 || validatedMessages.length > MAX_MESSAGES) {
    return textResponse("This chat is too long. Clear it and start a new question.", 400);
  }

  if (
    validatedMessages.some(
      (message) =>
        (message.role !== "user" && message.role !== "assistant") ||
        message.parts.some(
          (part) => part.type !== "text" && part.type !== "step-start"
        )
    )
  ) {
    return textResponse("Only text report questions are supported.", 400);
  }

  const sanitizedMessages: UIMessage[] = validatedMessages.map((message) => ({
    id: message.id,
    role: message.role,
    parts: message.parts.flatMap((part) =>
      part.type === "text" ? [{ type: "text" as const, text: part.text }] : []
    ),
  }));
  const lastMessage = sanitizedMessages.at(-1);
  const lastQuestion = lastMessage ? textFromMessage(lastMessage) : "";
  const conversationLength = sanitizedMessages.reduce(
    (sum, message) => sum + textFromMessage(message).length,
    0
  );

  if (
    lastMessage?.role !== "user" ||
    !lastQuestion ||
    lastQuestion.length > MAX_QUESTION_CHARS ||
    conversationLength > MAX_CONVERSATION_CHARS
  ) {
    return textResponse("The question or conversation is too long.", 400);
  }

  const reportContext = buildReportChatContext(link);
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-5.6-terra";
  const result = streamText({
    model: openai(model),
    system: reportChatInstructions(reportContext),
    messages: await convertToModelMessages(sanitizedMessages),
    maxOutputTokens: 700,
    abortSignal: request.signal,
    providerOptions: {
      openai: {
        store: false,
        reasoningEffort: "low",
        safetyIdentifier: `viewer_${viewerSessionHash}`,
      } satisfies OpenAILanguageModelResponsesOptions,
    },
  });

  return result.toUIMessageStreamResponse({
    headers: {
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    },
    onError: () =>
      "The report assistant could not complete that answer. Please try again.",
  });
}
