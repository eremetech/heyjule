import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import test from "node:test";
import {
  doctorExportEnvelopeContext,
  generateEncryptionKeyPair,
  inboxEnvelopeContext,
  openJson,
  sealJson,
} from "@heyjule/crypto";
import type { ChatSummaryPayload, EncryptedDoctorExport } from "@heyjule/shared-types";
import type { Authenticate, Principal } from "./auth.ts";
import type { ApiConfig } from "./config.ts";
import { ApiDatabase } from "./db.ts";
import { storeNewEntry } from "./mcp.ts";
import { createApiServer } from "./server.ts";

const patient: Principal = {
  sub: "patient_test",
  role: "patient",
  scopes: new Set([
    "device:write",
    "entry:write",
    "entry:claim",
    "patient:data:write",
    "patient:data:read",
    "patient:profile:write",
    "care:link",
    "report:write",
  ]),
};
const doctor: Principal = {
  sub: "doctor_test",
  role: "doctor",
  scopes: new Set(["care:invite", "doctor:key:write", "report:data:read", "report:read"]),
};

const authenticate: Authenticate = async (header) => {
  if (header === "Bearer patient-token") return patient;
  if (header === "Bearer doctor-token") return doctor;
  return null;
};

function testConfig(): ApiConfig {
  return {
    apiUrl: "https://api.heyjule.test",
    port: 0,
    databasePath: ":memory:",
    dataKey: new Uint8Array(32).fill(7),
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
    openaiApiKey: undefined,
    openaiModel: "gpt-5.6",
    openaiPhiEnabled: false,
    allowMockLlm: false,
  };
}

async function setup() {
  const config = testConfig();
  const database = new ApiDatabase(":memory:", config.dataKey);
  const app = createApiServer({ config, database, authenticate });
  await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const address = app.server.address() as AddressInfo;
  return {
    ...app,
    origin: `http://127.0.0.1:${address.port}`,
    async close() {
      await new Promise<void>((resolve, reject) =>
        app.server.close((error) => (error ? reject(error) : resolve())),
      );
      database.close();
    },
  };
}

async function api(
  origin: string,
  path: string,
  options: { method?: string; token?: string; body?: unknown; headers?: HeadersInit } = {},
) {
  return fetch(`${origin}${path}`, {
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...options.headers,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

test("MCP summaries are device-sealed, acknowledged only after pickup, and never stored as plaintext", async () => {
  const app = await setup();
  try {
    const deviceKeys = generateEncryptionKeyPair(randomBytes);
    const registered = await api(app.origin, "/v1/devices", {
      method: "PUT",
      token: "patient-token",
      body: { deviceId: "device_test", publicKey: deviceKeys.publicKey },
    });
    assert.equal(registered.status, 200);

    const result = storeNewEntry(app.database, patient.sub, {
      title: "Appointment preparation",
      summary: "Hot flashes increased after the dose change.",
      noteworthy: [{ label: "Dose change", level: "serious" }],
    }, new Date("2020-01-01T00:00:00.000Z"));
    assert.equal(result.status, "stored");
    if (result.status !== "stored") return;

    const raw = app.database.connection
      .prepare<[string], { envelope_json: string }>(
        "SELECT envelope_json FROM inbox_entries WHERE id = ?",
      )
      .get(result.entry.id);
    assert.ok(raw);
    assert.doesNotMatch(raw.envelope_json, /Hot flashes/u);

    // Pending inbox ciphertext has no time-based expiry. Even an entry created
    // years ago survives scheduled cleanup until its device acknowledges it.
    app.database.cleanupExpired();

    const inboxResponse = await api(app.origin, "/v1/inbox?device_id=device_test", {
      token: "patient-token",
    });
    assert.equal(inboxResponse.status, 200);
    const inbox = (await inboxResponse.json()) as { entries: typeof result.entry[] };
    assert.equal(inbox.entries.length, 1);

    const payload = openJson<ChatSummaryPayload>(
      inbox.entries[0]!.envelope,
      deviceKeys.privateKey,
      inboxEnvelopeContext(result.entry.id, "device_test"),
    );
    assert.equal(payload.summary, "Hot flashes increased after the dose change.");

    // A GET is not destructive: the device must first persist locally, then ACK.
    const beforeAck = await api(app.origin, "/v1/inbox?device_id=device_test", {
      token: "patient-token",
    });
    assert.equal(((await beforeAck.json()) as { entries: unknown[] }).entries.length, 1);

    const acknowledged = await api(
      app.origin,
      `/v1/inbox/${result.entry.id}?device_id=device_test`,
      { method: "DELETE", token: "patient-token" },
    );
    assert.equal(acknowledged.status, 204);
    const afterAck = await api(app.origin, "/v1/inbox?device_id=device_test", {
      token: "patient-token",
    });
    assert.equal(((await afterAck.json()) as { entries: unknown[] }).entries.length, 0);
  } finally {
    await app.close();
  }
});

test("the authenticated session endpoint binds a mobile journal to its patient account", async () => {
  const app = await setup();
  try {
    const response = await api(app.origin, "/v1/session", { token: "patient-token" });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { subject: patient.sub, role: "patient" });

    const anonymous = await api(app.origin, "/v1/session");
    assert.equal(anonymous.status, 401);
  } finally {
    await app.close();
  }
});

test("the patient chat route bridges authenticated AI SDK streams and deletes temporary context", async () => {
  const app = await setup();
  const body = {
    id: "checkin_route_test",
    messages: [
      {
        id: "message_route_test",
        role: "user",
        parts: [{ type: "text", text: "I feel more tired today." }],
      },
    ],
  };
  try {
    const anonymous = await api(app.origin, "/v1/patient/chat", { body });
    assert.equal(anonymous.status, 401);

    const response = await api(app.origin, "/v1/patient/chat", {
      token: "patient-token",
      body,
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-vercel-ai-ui-message-stream"), "v1");
    assert.match(await response.text(), /Text check-ins are not configured yet/u);

    const deleted = await api(app.origin, "/v1/patient/chat/checkin_route_test", {
      method: "DELETE",
      token: "patient-token",
    });
    assert.equal(deleted.status, 204);
  } finally {
    await app.close();
  }
});

test("voice tokens are short-lived, patient-authenticated, and keep the xAI key server-side", async () => {
  const config = { ...testConfig(), xaiApiKey: "xai-server-secret" };
  const database = new ApiDatabase(":memory:", config.dataKey);
  const providerRequests: Array<{ input: string; init?: RequestInit }> = [];
  const app = createApiServer({
    config,
    database,
    authenticate,
    fetch: async (input, init) => {
      providerRequests.push({ input: String(input), init });
      return Response.json({ value: "xai-client-secret-test", expires_at: 1_800_000_000 });
    },
  });
  await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const address = app.server.address() as AddressInfo;
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    const anonymous = await api(origin, "/v1/voice/token", { method: "POST" });
    assert.equal(anonymous.status, 401);
    assert.equal(providerRequests.length, 0);

    const response = await api(origin, "/v1/voice/token", {
      method: "POST",
      token: "patient-token",
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      token: "xai-client-secret-test",
      expiresAt: 1_800_000_000,
    });
    assert.equal(providerRequests.length, 1);
    assert.equal(providerRequests[0]?.input, "https://api.x.ai/v1/realtime/client_secrets");
    assert.equal(
      new Headers(providerRequests[0]?.init?.headers).get("Authorization"),
      "Bearer xai-server-secret",
    );
    assert.deepEqual(JSON.parse(String(providerRequests[0]?.init?.body)), {
      expires_after: { seconds: 300 },
    });
  } finally {
    await new Promise<void>((resolve, reject) =>
      app.server.close((error) => (error ? reject(error) : resolve())),
    );
    database.close();
  }
});

test("patient records are encrypted at rest but available to the authenticated patient", async () => {
  const app = await setup();
  try {
    const response = await api(app.origin, "/v1/patient/entries/entry_test", {
      method: "PUT",
      token: "patient-token",
      body: {
        occurredAt: new Date().toISOString(),
        kind: "check_in",
        source: "patient_check_in",
        dataMode: "live",
        payload: { note: "Sensitive symptom note", symptoms: ["headache"], severity: 4 },
      },
    });
    assert.equal(response.status, 200);

    const raw = app.database.connection
      .prepare<[], { ciphertext: string }>("SELECT ciphertext FROM patient_entries LIMIT 1")
      .get();
    assert.ok(raw);
    assert.doesNotMatch(raw.ciphertext, /Sensitive symptom note/u);

    const read = await api(app.origin, "/v1/patient/entries", { token: "patient-token" });
    assert.equal(read.status, 200);
    const body = (await read.json()) as { entries: Array<{ payload: { note: string } }> };
    assert.equal(body.entries[0]?.payload.note, "Sensitive symptom note");

    const deniedDoctorRead = await api(
      app.origin,
      `/v1/doctor/patients/${patient.sub}/entries`,
      { token: "doctor-token" },
    );
    assert.equal(deniedDoctorRead.status, 404);

    app.database.createCareRelationship(patient.sub, doctor.sub);
    const doctorRead = await api(
      app.origin,
      `/v1/doctor/patients/${patient.sub}/entries`,
      { token: "doctor-token" },
    );
    assert.equal(doctorRead.status, 200);
    const doctorBody = (await doctorRead.json()) as {
      entries: Array<{ payload: { note: string } }>;
    };
    assert.equal(doctorBody.entries[0]?.payload.note, "Sensitive symptom note");
  } finally {
    await app.close();
  }
});

test("doctor invites create a consented relationship and expose only linked patient data", async () => {
  const app = await setup();
  try {
    const profileResponse = await api(app.origin, "/v1/patient/profile", {
      method: "PUT",
      token: "patient-token",
      body: { name: "Alex Patient", dateOfBirth: "1985-06-12", sex: "female" },
    });
    assert.equal(profileResponse.status, 200);

    const rawProfile = app.database.connection
      .prepare<[], { ciphertext: string }>("SELECT ciphertext FROM patient_profiles LIMIT 1")
      .get();
    assert.ok(rawProfile);
    assert.doesNotMatch(rawProfile.ciphertext, /Alex Patient/u);

    const inviteResponse = await api(app.origin, "/v1/doctor/invites", {
      token: "doctor-token",
      body: {},
    });
    assert.equal(inviteResponse.status, 201);
    const invite = (await inviteResponse.json()) as { id: string; code: string };
    assert.match(invite.code, /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/u);

    const rawInvite = app.database.connection
      .prepare<[], { code_hash: string; ciphertext: string }>(
        "SELECT code_hash, ciphertext FROM care_invites LIMIT 1",
      )
      .get();
    assert.ok(rawInvite);
    assert.notEqual(rawInvite.code_hash, invite.code);
    assert.doesNotMatch(rawInvite.ciphertext, new RegExp(invite.code, "u"));

    const claimed = await api(app.origin, "/v1/patient/care-links/claim", {
      token: "patient-token",
      body: { code: invite.code },
    });
    assert.equal(claimed.status, 201);
    assert.equal((await claimed.json() as { doctorId: string }).doctorId, doctor.sub);

    const replay = await api(app.origin, "/v1/patient/care-links/claim", {
      token: "patient-token",
      body: { code: invite.code },
    });
    assert.equal(replay.status, 404);

    const patientsResponse = await api(app.origin, "/v1/doctor/patients", {
      token: "doctor-token",
    });
    assert.equal(patientsResponse.status, 200);
    const patients = (await patientsResponse.json()) as {
      patients: Array<{ id: string; profile: { name: string } }>;
    };
    assert.equal(patients.patients[0]?.id, patient.sub);
    assert.equal(patients.patients[0]?.profile.name, "Alex Patient");

    const relationships = await api(app.origin, "/v1/patient/care-links", {
      token: "patient-token",
    });
    assert.equal(relationships.status, 200);
    assert.equal(
      ((await relationships.json()) as { relationships: Array<{ doctorId: string }> })
        .relationships[0]?.doctorId,
      doctor.sub,
    );

    const revoked = await api(app.origin, `/v1/patient/care-links/${doctor.sub}`, {
      method: "DELETE",
      token: "patient-token",
    });
    assert.equal(revoked.status, 204);
    const deniedAfterRevocation = await api(app.origin, "/v1/doctor/patients", {
      token: "doctor-token",
    });
    assert.deepEqual(await deniedAfterRevocation.json(), { patients: [] });
  } finally {
    await app.close();
  }
});

test("doctor exports remain ciphertext to the backend and open only with the doctor's private key", async () => {
  const app = await setup();
  try {
    const doctorKeys = generateEncryptionKeyPair(randomBytes);
    const strangerKeys = generateEncryptionKeyPair(randomBytes);
    const keyResponse = await api(app.origin, "/v1/doctor/keys", {
      token: "doctor-token",
      body: { id: "doctor_key_test", publicKey: doctorKeys.publicKey },
    });
    assert.equal(keyResponse.status, 201);
    app.database.createCareRelationship(patient.sub, doctor.sub);

    const publicKeyResponse = await api(
      app.origin,
      `/v1/patient/doctors/${doctor.sub}/key`,
      { token: "patient-token" },
    );
    assert.equal(publicKeyResponse.status, 200);
    const doctorKey = (await publicKeyResponse.json()) as { id: string; publicKey: string };

    const exportId = "export_test";
    const context = doctorExportEnvelopeContext(exportId, doctorKey.id);
    const envelope = sealJson(
      { summary: "Only the intended doctor should read this report." },
      doctorKey.publicKey,
      context,
      randomBytes,
    );
    const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
    const created = await api(app.origin, "/v1/exports", {
      token: "patient-token",
      body: {
        id: exportId,
        doctorId: doctor.sub,
        doctorKeyId: doctorKey.id,
        envelope,
        expiresAt,
      },
    });
    assert.equal(created.status, 201);

    const raw = app.database.connection
      .prepare<[], { envelope_json: string }>("SELECT envelope_json FROM encrypted_exports LIMIT 1")
      .get();
    assert.ok(raw);
    assert.doesNotMatch(raw.envelope_json, /Only the intended doctor/u);

    const downloaded = await api(app.origin, `/v1/exports/${exportId}`, {
      token: "doctor-token",
    });
    assert.equal(downloaded.status, 200);
    const encrypted = (await downloaded.json()) as EncryptedDoctorExport;
    const report = openJson<{ summary: string }>(encrypted.envelope, doctorKeys.privateKey, context);
    assert.equal(report.summary, "Only the intended doctor should read this report.");
    assert.throws(() => openJson(encrypted.envelope, strangerKeys.privateKey, context));
  } finally {
    await app.close();
  }
});

test("mock patient data is reviewed by OpenAI, encrypted by the patient, and rendered from a doctor-only export", async () => {
  const config = {
    ...testConfig(),
    openaiApiKey: "openai-server-secret",
    openaiModel: "gpt-5.6",
    allowMockLlm: true,
  };
  const database = new ApiDatabase(":memory:", config.dataKey);
  const providerRequests: Array<{ input: string; init?: RequestInit }> = [];
  const providerReport = {
    headline: "Symptoms improved overall, with a recent resting-heart-rate rise to review.",
    summary: "The supplied mock record shows improving sleep and PROM scores alongside two recent higher resting-heart-rate measurements.",
    findings: [
      {
        title: "Recent resting-heart-rate rise",
        detail: "The two most recent wearable entries are above the preceding value.",
        level: "attention",
        evidenceEntryIds: ["mock_wearable_1", "mock_wearable_2", "invented_entry"],
      },
    ],
    trends: [
      {
        metric: "Sleep duration",
        direction: "improving",
        detail: "Sleep duration increased across the supplied wearable entries.",
        evidenceEntryIds: ["mock_wearable_1", "mock_wearable_2"],
      },
    ],
    sections: [
      {
        key: "wearables",
        summary: "Wearable measurements show longer sleep with a recent heart-rate increase.",
        evidenceEntryIds: ["mock_wearable_1", "mock_wearable_2"],
      },
      {
        key: "conversations",
        summary: "The patient reported fewer night sweats.",
        evidenceEntryIds: ["mock_conversation_1"],
      },
    ],
  };
  const app = createApiServer({
    config,
    database,
    authenticate,
    fetch: async (input, init) => {
      providerRequests.push({ input: String(input), init });
      return Response.json({
        id: "resp_mock_clinical_report",
        object: "response",
        created_at: 1_784_443_200,
        status: "completed",
        error: null,
        incomplete_details: null,
        instructions: null,
        max_output_tokens: 4_000,
        model: "gpt-5.6",
        output: [
          {
            id: "msg_mock_clinical_report",
            type: "message",
            status: "completed",
            role: "assistant",
            content: [
              {
                type: "output_text",
                text: JSON.stringify(providerReport),
                annotations: [],
              },
            ],
          },
        ],
        parallel_tool_calls: true,
        previous_response_id: null,
        reasoning: { effort: null, summary: null },
        store: false,
        temperature: 1,
        text: { format: { type: "json_schema" } },
        tool_choice: "auto",
        tools: [],
        top_p: 1,
        truncation: "disabled",
        usage: {
          input_tokens: 100,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens: 100,
          output_tokens_details: { reasoning_tokens: 0 },
          total_tokens: 200,
        },
      });
    },
  });
  await new Promise<void>((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const address = app.server.address() as AddressInfo;
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    const doctorKeys = generateEncryptionKeyPair(randomBytes);
    assert.equal((await api(origin, "/v1/doctor/keys", {
      token: "doctor-token",
      body: { id: "doctor_key_mock_flow", publicKey: doctorKeys.publicKey },
    })).status, 201);
    database.createCareRelationship(patient.sub, doctor.sub);

    assert.equal((await api(origin, "/v1/patient/profile", {
      method: "PUT",
      token: "patient-token",
      body: { name: "Martina Keller", dateOfBirth: "1972-05-30", sex: "female" },
    })).status, 200);

    const entries = [
      {
        id: "mock_conversation_1",
        occurredAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
        kind: "check_in",
        source: "in_app_conversation",
        dataMode: "mock",
        payload: {
          title: "Fewer night sweats",
          note: "One episode this week instead of nightly episodes.",
          symptoms: ["night sweats"],
          severity: 2,
        },
      },
      {
        id: "mock_wearable_1",
        occurredAt: new Date(Date.now() - 86_400_000).toISOString(),
        kind: "wearable",
        source: "apple_health",
        dataMode: "mock",
        payload: {
          date: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10),
          sleepMinutes: 470,
          restingHeartRate: 64,
          steps: 7_400,
          hrvMs: 43,
        },
      },
      {
        id: "mock_wearable_2",
        occurredAt: new Date().toISOString(),
        kind: "wearable",
        source: "apple_health",
        dataMode: "mock",
        payload: {
          date: new Date().toISOString().slice(0, 10),
          sleepMinutes: 490,
          restingHeartRate: 72,
          steps: 8_100,
          hrvMs: 40,
        },
      },
    ] as const;
    for (const entry of entries) {
      const stored = await api(origin, `/v1/patient/entries/${entry.id}`, {
        method: "PUT",
        token: "patient-token",
        body: entry,
      });
      assert.equal(stored.status, 200);
    }

    const generatedResponse = await api(origin, "/v1/patient/reports/generate", {
      token: "patient-token",
      body: {
        doctorId: doctor.sub,
        timeframeDays: 30,
        scope: {
          symptoms: true,
          wearables: true,
          treatments: true,
          conversations: true,
          proms: true,
        },
      },
    });
    assert.equal(generatedResponse.status, 201);
    const generated = (await generatedResponse.json()) as {
      report: {
        headline: string;
        patient: { name: string };
        sourceEntryIds: string[];
        findings: Array<{ evidenceEntryIds: string[] }>;
        generation: { responseId: string };
      };
      doctorKey: { id: string; publicKey: string };
    };
    assert.equal(generated.report.headline, providerReport.headline);
    assert.equal(generated.report.patient.name, "Martina Keller");
    assert.equal(generated.report.generation.responseId, "resp_mock_clinical_report");
    assert.deepEqual(generated.report.findings[0]?.evidenceEntryIds, [
      "mock_wearable_1",
      "mock_wearable_2",
    ]);
    assert.equal(providerRequests.length, 1);
    assert.equal(providerRequests[0]?.input, "https://api.openai.com/v1/responses");
    const providerHeaders = new Headers(providerRequests[0]?.init?.headers);
    assert.equal(providerHeaders.get("Authorization"), "Bearer openai-server-secret");
    const providerBody = JSON.parse(String(providerRequests[0]?.init?.body)) as {
      store: boolean;
      text: { format: { type: string; strict: boolean } };
      input: Array<{ role: string; content: string }>;
    };
    assert.equal(providerBody.store, false);
    assert.equal(providerBody.text.format.type, "json_schema");
    assert.equal(providerBody.text.format.strict, true);
    assert.doesNotMatch(JSON.stringify(providerBody), /Martina Keller|patient_test/u);
    assert.match(JSON.stringify(providerBody), /mock_wearable_2/u);

    const exportId = "mock_full_flow_export";
    const context = doctorExportEnvelopeContext(exportId, generated.doctorKey.id);
    const envelope = sealJson(generated.report, generated.doctorKey.publicKey, context, randomBytes);
    const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
    assert.equal((await api(origin, "/v1/exports", {
      token: "patient-token",
      body: {
        id: exportId,
        doctorId: doctor.sub,
        doctorKeyId: generated.doctorKey.id,
        envelope,
        expiresAt,
      },
    })).status, 201);

    const listed = await api(origin, `/v1/doctor/patients/${patient.sub}/exports`, {
      token: "doctor-token",
    });
    assert.equal(listed.status, 200);
    const encrypted = ((await listed.json()) as { exports: EncryptedDoctorExport[] }).exports[0]!;
    const opened = openJson<typeof generated.report>(encrypted.envelope, doctorKeys.privateKey, context);
    assert.equal(opened.headline, providerReport.headline);
    const storedCiphertext = database.connection
      .prepare<[string], { envelope_json: string }>(
        "SELECT envelope_json FROM encrypted_exports WHERE id = ?",
      )
      .get(exportId);
    assert.ok(storedCiphertext);
    assert.doesNotMatch(storedCiphertext.envelope_json, /Symptoms improved overall/u);
  } finally {
    await new Promise<void>((resolve, reject) =>
      app.server.close((error) => (error ? reject(error) : resolve())),
    );
    database.close();
  }
});

test("the MCP endpoint exposes new_entry and enforces OAuth at runtime", async () => {
  const app = await setup();
  try {
    const deviceKeys = generateEncryptionKeyPair(randomBytes);
    const registered = await api(app.origin, "/v1/devices", {
      method: "PUT",
      token: "patient-token",
      body: { deviceId: "device_mcp", publicKey: deviceKeys.publicKey },
    });
    assert.equal(registered.status, 200);

    const listed = await api(app.origin, "/mcp", {
      body: { jsonrpc: "2.0", id: 0, method: "tools/list", params: {} },
      headers: { Accept: "application/json, text/event-stream" },
    });
    assert.equal(listed.status, 200);
    const listedBody = (await listed.json()) as {
      result: { tools: Array<{ name: string; _meta?: Record<string, unknown> }> };
    };
    const listedTool = listedBody.result.tools.find((tool) => tool.name === "new_entry");
    assert.ok(listedTool);
    assert.ok(listedTool._meta?.securitySchemes);

    const request = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "new_entry",
        arguments: { summary: "A summary that must not be accepted anonymously." },
      },
    };
    const response = await api(app.origin, "/mcp", {
      body: request,
      headers: { Accept: "application/json, text/event-stream" },
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      result: { isError: boolean; _meta: Record<string, unknown> };
    };
    assert.equal(body.result.isError, true);
    assert.ok(body.result._meta["mcp/www_authenticate"]);

    const authorized = await api(app.origin, "/mcp", {
      token: "patient-token",
      body: {
        ...request,
        id: 2,
        params: {
          ...request.params,
          arguments: { summary: "Authenticated MCP summary." },
        },
      },
      headers: { Accept: "application/json, text/event-stream" },
    });
    assert.equal(authorized.status, 200);
    const authorizedBody = (await authorized.json()) as {
      result: {
        isError?: boolean;
        structuredContent: { status: string; receipt_id: string };
      };
    };
    assert.notEqual(authorizedBody.result.isError, true);
    assert.equal(authorizedBody.result.structuredContent.status, "stored");

    const inboxResponse = await api(app.origin, "/v1/inbox?device_id=device_mcp", {
      token: "patient-token",
    });
    const inbox = (await inboxResponse.json()) as {
      entries: Array<{ id: string; envelope: EncryptedDoctorExport["envelope"] }>;
    };
    assert.equal(inbox.entries.length, 1);
    const entry = inbox.entries[0]!;
    const payload = openJson<ChatSummaryPayload>(
      entry.envelope,
      deviceKeys.privateKey,
      inboxEnvelopeContext(entry.id, "device_mcp"),
    );
    assert.equal(payload.summary, "Authenticated MCP summary.");
  } finally {
    await app.close();
  }
});
