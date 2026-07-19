import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { createMemoryState } from "@chat-adapter/state-memory";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";

import type { Authenticate, Principal } from "./auth.ts";
import type { ApiConfig } from "./config.ts";
import { createEncryptedChatState } from "./encrypted-chat-state.ts";
import { createPatientChat } from "./patient-chat.ts";

const patient: Principal = {
  sub: "auth0|patient-private-id",
  role: "patient",
  scopes: new Set(["patient:data:write"]),
};

const authenticate: Authenticate = async (header) =>
  header === "Bearer patient-token" ? patient : null;

function config(): ApiConfig {
  return {
    apiUrl: "https://api.heyjule.test",
    port: 0,
    databasePath: ":memory:",
    dataKey: new Uint8Array(32).fill(17),
    oauthIssuer: "https://auth.heyjule.test",
    oauthAudience: "https://api.heyjule.test",
    oauthJwksUrl: "https://auth.heyjule.test/.well-known/jwks.json",
    doctorOauthIssuer: undefined,
    doctorOauthAudience: "https://api.heyjule.test",
    doctorOauthJwksUrl: undefined,
    allowedOrigins: new Set(),
    trustProxy: false,
    production: false,
    devTokens: undefined,
    xaiApiKey: undefined,
    openaiApiKey: "test-only-key",
    openaiModel: "gpt-5.6",
    openaiPhiEnabled: true,
    allowMockLlm: false,
  };
}

function streamResult(text: string) {
  return {
    stream: simulateReadableStream({
      chunks: [
        { type: "text-start" as const, id: "text-1" },
        { type: "text-delta" as const, id: "text-1", delta: text },
        { type: "text-end" as const, id: "text-1" },
        {
          type: "finish" as const,
          finishReason: { unified: "stop" as const, raw: undefined },
          logprobs: undefined,
          usage: {
            inputTokens: { total: 8, noCache: 8, cacheRead: undefined, cacheWrite: undefined },
            outputTokens: { total: 7, text: 7, reasoning: undefined },
          },
        },
      ],
    }),
  };
}

function request(conversationId: string, messageId: string, text: string, token = "patient-token") {
  return new Request("https://api.heyjule.test/v1/patient/chat", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: conversationId,
      messages: [{ id: messageId, role: "user", parts: [{ type: "text", text }] }],
    }),
  });
}

test("patient chat authenticates, streams the model, encrypts history, and deletes it", async () => {
  const value = config();
  const rawState = createMemoryState();
  const encryptedState = createEncryptedChatState(rawState, value.dataKey);
  const model = new MockLanguageModelV3({
    doStream: async () => streamResult("How long has that been happening?"),
  });
  const patientChat = createPatientChat({
    config: value,
    authenticate,
    state: encryptedState,
    model,
  });

  try {
    const anonymous = await patientChat.chat.webhooks.web(
      request("checkin_test", "message_anon", "Private symptom", "bad-token"),
    );
    assert.equal(anonymous.status, 401);
    assert.equal(model.doStreamCalls.length, 0);

    const first = await patientChat.chat.webhooks.web(
      request("checkin_test", "message_1", "A private symptom began today."),
    );
    assert.equal(first.status, 200);
    assert.match(await first.text(), /How long has that been happening/u);
    assert.equal(model.doStreamCalls.length, 1);
    assert.match(JSON.stringify(model.doStreamCalls[0]!.prompt), /A private symptom began today/u);
    assert.match(JSON.stringify(model.doStreamCalls[0]!.prompt), /warm, calm check-in companion/u);

    const second = await patientChat.chat.webhooks.web(
      request("checkin_test", "message_2", "It started about four hours ago."),
    );
    assert.equal(second.status, 200);
    await second.text();
    assert.equal(model.doStreamCalls.length, 2);
    const secondPrompt = JSON.stringify(model.doStreamCalls[1]!.prompt);
    assert.match(secondPrompt, /A private symptom began today/u);
    assert.match(secondPrompt, /How long has that been happening/u);
    assert.match(secondPrompt, /It started about four hours ago/u);

    const userHash = createHmac("sha256", value.dataKey)
      .update(patient.sub)
      .digest("base64url")
      .slice(0, 32);
    const historyKey = `msg-history:web:patient_${userHash}:checkin_test`;
    const encryptedHistory = await rawState.getList(historyKey);
    assert.ok(encryptedHistory.length >= 4);
    assert.doesNotMatch(JSON.stringify(encryptedHistory), /private symptom|four hours/iu);

    await patientChat.deleteHistory(patient.sub, "checkin_test");
    assert.deepEqual(await rawState.getList(historyKey), []);
  } finally {
    await patientChat.chat.shutdown();
  }
});
