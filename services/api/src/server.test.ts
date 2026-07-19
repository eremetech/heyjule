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
    "report:write",
  ]),
};
const doctor: Principal = {
  sub: "doctor_test",
  role: "doctor",
  scopes: new Set(["doctor:key:write", "report:data:read", "report:read"]),
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
    allowedOrigins: new Set(),
    trustProxy: false,
    production: false,
    devTokens: undefined,
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
    });
    assert.equal(result.status, "stored");
    if (result.status !== "stored") return;

    const raw = app.database.connection
      .prepare<[string], { envelope_json: string }>(
        "SELECT envelope_json FROM inbox_entries WHERE id = ?",
      )
      .get(result.entry.id);
    assert.ok(raw);
    assert.doesNotMatch(raw.envelope_json, /Hot flashes/u);

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

test("patient records are encrypted at rest but available to the authenticated patient", async () => {
  const app = await setup();
  try {
    const response = await api(app.origin, "/v1/patient/entries/entry_test", {
      method: "PUT",
      token: "patient-token",
      body: {
        occurredAt: new Date().toISOString(),
        kind: "check_in",
        payload: { note: "Sensitive symptom note", severity: 4 },
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
