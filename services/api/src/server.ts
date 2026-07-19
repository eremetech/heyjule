import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  assertValidPublicKey,
  doctorExportEnvelopeContext,
  fingerprintPublicKey,
} from "@heyjule/crypto";
import type {
  DoctorPublicKey,
  EncryptedDoctorExport,
  PatientEntry,
} from "@heyjule/shared-types";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ZodError } from "zod";
import { createAuthenticator, hasAccess, type Authenticate, type Principal } from "./auth.ts";
import { generateClinicalReport, selectReportEntries } from "./clinical-report.ts";
import { loadConfig, type ApiConfig } from "./config.ts";
import { ApiDatabase } from "./db.ts";
import { createMcpServer } from "./mcp.ts";
import {
  encryptedExportSchema,
  generateClinicalReportSchema,
  claimCareInviteSchema,
  idSchema,
  patientEntrySchema,
  patientProfileSchema,
  registerDeviceSchema,
  registerDoctorKeySchema,
} from "./schemas.ts";

const MAX_BODY_BYTES = 2_200_000;
const MCP_METHODS = new Set(["POST", "GET", "DELETE", "OPTIONS"]);
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 120;
const INVITE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function careInviteCode() {
  return [...randomBytes(6)].map((value) => INVITE_ALPHABET[value & 31]).join("");
}

function careInviteHash(code: string, key: Uint8Array) {
  return createHmac("sha256", key).update(code).digest("base64url");
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message = code,
  ) {
    super(message);
  }
}

type AppOptions = {
  config: ApiConfig;
  database?: ApiDatabase;
  authenticate?: Authenticate;
  fetch?: typeof fetch;
};

function setSecurityHeaders(response: ServerResponse) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
}

function json(response: ServerResponse, status: number, value: unknown) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(value));
}

function empty(response: ServerResponse, status: number) {
  response.statusCode = status;
  response.end();
}

function text(response: ServerResponse, status: number, value: string) {
  response.statusCode = status;
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  response.end(value);
}

async function readJson(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > MAX_BODY_BYTES) throw new HttpError(413, "body_too_large");
    chunks.push(buffer);
  }
  if (length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new HttpError(400, "invalid_json");
  }
}

function matchPath(pathname: string, pattern: RegExp) {
  return pathname.match(pattern)?.groups ?? null;
}

function requireAccess(principal: Principal | null, role: Principal["role"], scope: string) {
  if (!principal) throw new HttpError(401, "authentication_required");
  if (!hasAccess(principal, role, scope)) throw new HttpError(403, "insufficient_scope");
  return principal;
}

function validatePublicKey(publicKey: string) {
  try {
    assertValidPublicKey(publicKey);
  } catch {
    throw new HttpError(400, "invalid_public_key");
  }
}

function configureRestCors(
  request: IncomingMessage,
  response: ServerResponse,
  allowedOrigins: ReadonlySet<string>,
) {
  const origin = request.headers.origin;
  if (!origin) return;
  if (!allowedOrigins.has(origin)) throw new HttpError(403, "origin_not_allowed");
  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  response.setHeader("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE, OPTIONS");
  response.setHeader("Vary", "Origin");
}

function assertProductionHttps(request: IncomingMessage, config: ApiConfig) {
  if (!config.production) return;
  if ("encrypted" in request.socket && request.socket.encrypted === true) return;
  const forwarded = request.headers["x-forwarded-proto"];
  const protocol = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (!config.trustProxy || protocol !== "https") throw new HttpError(400, "https_required");
}

function createRateLimiter(trustProxy: boolean) {
  const buckets = new Map<string, { start: number; count: number }>();
  return (request: IncomingMessage) => {
    const forwarded = trustProxy ? request.headers["x-forwarded-for"] : undefined;
    const remote =
      (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim() ||
      request.socket.remoteAddress ||
      "unknown";
    const now = Date.now();
    const bucket = buckets.get(remote);
    if (!bucket || now - bucket.start >= RATE_WINDOW_MS) {
      buckets.set(remote, { start: now, count: 1 });
      return;
    }
    bucket.count++;
    if (bucket.count > RATE_MAX) throw new HttpError(429, "rate_limited");
    if (buckets.size > 10_000) {
      for (const [key, value] of buckets) {
        if (now - value.start >= RATE_WINDOW_MS) buckets.delete(key);
      }
    }
  };
}

export function createApiServer(options: AppOptions) {
  const { config } = options;
  const database = options.database ?? new ApiDatabase(config.databasePath, config.dataKey);
  const authenticate =
    options.authenticate ??
    createAuthenticator({
      issuer: config.oauthIssuer,
      audience: config.oauthAudience,
      jwksUrl: config.oauthJwksUrl,
      additionalIssuers:
        config.doctorOauthIssuer && config.doctorOauthJwksUrl
          ? [
              {
                issuer: config.doctorOauthIssuer,
                audience: config.doctorOauthAudience,
                jwksUrl: config.doctorOauthJwksUrl,
              },
            ]
          : undefined,
      devTokens: config.devTokens,
    });
  const rateLimit = createRateLimiter(config.trustProxy);
  const fetchFromProvider = options.fetch ?? fetch;
  const resourceMetadataUrl = `${config.apiUrl}/.well-known/oauth-protected-resource`;

  const server = createServer(async (request, response) => {
    setSecurityHeaders(response);
    try {
      if (!request.url || !request.method) throw new HttpError(400, "invalid_request");
      rateLimit(request);
      assertProductionHttps(request, config);
      const url = new URL(request.url, config.apiUrl);

      if (url.pathname === "/healthz" && request.method === "GET") {
        return json(response, 200, { status: "ok" });
      }

      if (url.pathname === "/.well-known/oauth-protected-resource" && request.method === "GET") {
        return json(response, 200, {
          resource: config.apiUrl,
          authorization_servers: [config.oauthIssuer],
          scopes_supported: [
            "device:write",
            "entry:write",
            "entry:claim",
            "patient:data:write",
            "patient:data:read",
            "patient:profile:write",
            "care:link",
            "care:invite",
            "doctor:key:write",
            "report:data:read",
            "report:write",
            "report:read",
          ],
          resource_documentation: `${config.apiUrl}/docs/security`,
        });
      }

      if (url.pathname === "/docs/security" && request.method === "GET") {
        return text(
          response,
          200,
          [
            "HeyJule MCP security",
            "",
            "The new_entry tool requires a patient OAuth token with entry:write.",
            "Summaries are sealed to a registered patient device public key and retained until that device acknowledges durable storage.",
            "The API stores ciphertext until the device acknowledges durable local storage.",
            "Do not send full chat transcripts or use this tool without the patient's explicit request.",
          ].join("\n"),
        );
      }

      if (url.pathname === "/mcp" && MCP_METHODS.has(request.method)) {
        response.setHeader("Access-Control-Allow-Origin", "*");
        response.setHeader("Access-Control-Allow-Headers", "authorization, content-type, mcp-session-id");
        response.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
        if (request.method === "OPTIONS") return empty(response, 204);

        const principal = await authenticate(request.headers.authorization);
        const mcpServer = createMcpServer({ database, principal, resourceMetadataUrl });
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        });
        response.on("close", () => {
          void transport.close();
          void mcpServer.close();
        });
        await mcpServer.connect(transport);
        await transport.handleRequest(request, response);
        return;
      }

      configureRestCors(request, response, config.allowedOrigins);
      if (request.method === "OPTIONS") return empty(response, 204);
      const principal = await authenticate(request.headers.authorization);

      if (url.pathname === "/v1/session" && request.method === "GET") {
        if (!principal) throw new HttpError(401, "authentication_required");
        return json(response, 200, { subject: principal.sub, role: principal.role });
      }

      if (url.pathname === "/v1/voice/token" && request.method === "POST") {
        requireAccess(principal, "patient", "patient:data:write");
        if (!config.xaiApiKey) throw new HttpError(503, "voice_not_configured");

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);
        let providerResponse: Response;
        try {
          providerResponse = await fetchFromProvider(
            "https://api.x.ai/v1/realtime/client_secrets",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${config.xaiApiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ expires_after: { seconds: 300 } }),
              signal: controller.signal,
            },
          );
        } catch {
          throw new HttpError(502, "voice_provider_unavailable");
        } finally {
          clearTimeout(timeout);
        }
        if (!providerResponse.ok) throw new HttpError(502, "voice_provider_rejected");
        let providerBody: {
          value?: unknown;
          expires_at?: unknown;
          client_secret?: { value?: unknown; expires_at?: unknown };
        };
        try {
          providerBody = (await providerResponse.json()) as typeof providerBody;
        } catch {
          throw new HttpError(502, "voice_provider_invalid_response");
        }
        const token = providerBody.value ?? providerBody.client_secret?.value;
        const expiresAt = providerBody.expires_at ?? providerBody.client_secret?.expires_at;
        if (typeof token !== "string" || !token) {
          throw new HttpError(502, "voice_provider_invalid_response");
        }
        return json(response, 200, {
          token,
          expiresAt: typeof expiresAt === "number" ? expiresAt : Math.floor(Date.now() / 1000) + 300,
        });
      }

      if (url.pathname === "/v1/devices" && request.method === "PUT") {
        const patient = requireAccess(principal, "patient", "device:write");
        const body = registerDeviceSchema.parse(await readJson(request));
        validatePublicKey(body.publicKey);
        const fingerprint = fingerprintPublicKey(body.publicKey);
        database.upsertDevice(patient.sub, body.deviceId, body.publicKey, fingerprint);
        return json(response, 200, { deviceId: body.deviceId, fingerprint });
      }

      if (url.pathname === "/v1/inbox" && request.method === "GET") {
        const patient = requireAccess(principal, "patient", "entry:claim");
        const deviceId = idSchema.parse(url.searchParams.get("device_id"));
        if (!database.ownsActiveDevice(patient.sub, deviceId)) {
          throw new HttpError(404, "device_not_found");
        }
        return json(response, 200, { entries: database.listInboxEntries(patient.sub, deviceId) });
      }

      const inboxPath = matchPath(url.pathname, /^\/v1\/inbox\/(?<id>[A-Za-z0-9_-]+)$/u);
      if (inboxPath && request.method === "DELETE") {
        const patient = requireAccess(principal, "patient", "entry:claim");
        const deviceId = idSchema.parse(url.searchParams.get("device_id"));
        const entryId = idSchema.parse(inboxPath.id);
        const deleted = database.acknowledgeInboxEntry(patient.sub, deviceId, entryId);
        if (!deleted) throw new HttpError(404, "entry_not_found");
        return empty(response, 204);
      }

      const patientEntryPath = matchPath(
        url.pathname,
        /^\/v1\/patient\/entries\/(?<id>[A-Za-z0-9_-]+)$/u,
      );
      if (patientEntryPath && request.method === "PUT") {
        const patient = requireAccess(principal, "patient", "patient:data:write");
        const body = patientEntrySchema.parse(await readJson(request));
        const entry: PatientEntry = { id: idSchema.parse(patientEntryPath.id), ...body };
        database.putPatientEntry(patient.sub, entry);
        return json(response, 200, { id: entry.id, stored: true });
      }

      if (url.pathname === "/v1/patient/entries" && request.method === "GET") {
        const patient = requireAccess(principal, "patient", "patient:data:read");
        return json(response, 200, { entries: database.listPatientEntries(patient.sub) });
      }

      if (url.pathname === "/v1/patient/profile" && request.method === "PUT") {
        const patient = requireAccess(principal, "patient", "patient:profile:write");
        const profile = patientProfileSchema.parse(await readJson(request));
        database.putPatientProfile(patient.sub, profile);
        return json(response, 200, { stored: true });
      }

      if (url.pathname === "/v1/patient/care-links/claim" && request.method === "POST") {
        const patient = requireAccess(principal, "patient", "care:link");
        const body = claimCareInviteSchema.parse(await readJson(request));
        const relationship = database.claimCareInvite(
          patient.sub,
          careInviteHash(body.code, config.dataKey),
        );
        if (!relationship) throw new HttpError(404, "invite_not_found");
        return json(response, 201, relationship);
      }

      if (url.pathname === "/v1/patient/care-links" && request.method === "GET") {
        const patient = requireAccess(principal, "patient", "care:link");
        return json(response, 200, { relationships: database.listCareRelationships(patient.sub) });
      }

      if (url.pathname === "/v1/patient/reports/generate" && request.method === "POST") {
        const patient = requireAccess(principal, "patient", "report:write");
        const body = generateClinicalReportSchema.parse(await readJson(request));
        if (!config.openaiApiKey) throw new HttpError(503, "report_provider_not_configured");
        const doctorKey = database.getDoctorKeyForPatient(patient.sub, body.doctorId);
        if (!doctorKey) throw new HttpError(404, "doctor_key_not_found");
        const profile = database.getPatientProfile(patient.sub);
        if (!profile) throw new HttpError(409, "patient_profile_required");
        const entries = database.listPatientEntries(patient.sub);
        const now = new Date();
        const selectedEntries = selectReportEntries(entries, body.timeframeDays, body.scope, now);
        if (selectedEntries.length === 0) throw new HttpError(422, "report_has_no_entries");
        const mockOnly = selectedEntries.every((entry) => entry.dataMode === "mock");
        if (mockOnly && !config.allowMockLlm) {
          throw new HttpError(503, "mock_llm_not_enabled");
        }
        if (!mockOnly && !config.openaiPhiEnabled) {
          throw new HttpError(503, "openai_phi_not_enabled");
        }
        let report: Awaited<ReturnType<typeof generateClinicalReport>>;
        try {
          report = await generateClinicalReport({
            apiKey: config.openaiApiKey,
            model: config.openaiModel,
            patient: profile,
            entries,
            timeframeDays: body.timeframeDays,
            scope: body.scope,
            fetch: fetchFromProvider,
            now,
          });
        } catch (error) {
          if (error instanceof Error && error.message === "report_has_no_entries") {
            throw new HttpError(422, "report_has_no_entries");
          }
          throw new HttpError(502, "report_provider_failed");
        }
        database.auditClinicalReportGeneration(patient.sub, report.generation.responseId, {
          doctorId: body.doctorId,
          model: report.generation.model,
          entryCount: String(report.sourceEntryIds.length),
        });
        return json(response, 201, { report, doctorKey });
      }

      if (url.pathname === "/v1/patient/exports" && request.method === "GET") {
        const patient = requireAccess(principal, "patient", "report:write");
        return json(response, 200, { exports: database.listEncryptedExportsForPatient(patient.sub) });
      }

      const patientCareLinkPath = matchPath(
        url.pathname,
        /^\/v1\/patient\/care-links\/(?<doctorId>[A-Za-z0-9_-]+)$/u,
      );
      if (patientCareLinkPath && request.method === "DELETE") {
        const patient = requireAccess(principal, "patient", "care:link");
        const revoked = database.revokeCareRelationship(
          patient.sub,
          idSchema.parse(patientCareLinkPath.doctorId),
        );
        if (!revoked) throw new HttpError(404, "care_relationship_not_found");
        return empty(response, 204);
      }

      if (url.pathname === "/v1/doctor/invites" && request.method === "POST") {
        const doctor = requireAccess(principal, "doctor", "care:invite");
        const code = careInviteCode();
        const createdAt = new Date();
        const invite = {
          id: `invite_${randomUUID().replaceAll("-", "")}`,
          code,
          createdAt: createdAt.toISOString(),
          expiresAt: new Date(createdAt.getTime() + 7 * 86_400_000).toISOString(),
        };
        database.createCareInvite(doctor.sub, {
          ...invite,
          codeHash: careInviteHash(code, config.dataKey),
        });
        return json(response, 201, invite);
      }

      if (url.pathname === "/v1/doctor/invites" && request.method === "GET") {
        const doctor = requireAccess(principal, "doctor", "care:invite");
        return json(response, 200, { invites: database.listCareInvites(doctor.sub) });
      }

      const doctorInvitePath = matchPath(
        url.pathname,
        /^\/v1\/doctor\/invites\/(?<id>[A-Za-z0-9_-]+)$/u,
      );
      if (doctorInvitePath && request.method === "DELETE") {
        const doctor = requireAccess(principal, "doctor", "care:invite");
        const deleted = database.revokeCareInvite(doctor.sub, idSchema.parse(doctorInvitePath.id));
        if (!deleted) throw new HttpError(404, "invite_not_found");
        return empty(response, 204);
      }

      if (url.pathname === "/v1/doctor/patients" && request.method === "GET") {
        const doctor = requireAccess(principal, "doctor", "report:data:read");
        return json(response, 200, { patients: database.listLinkedPatients(doctor.sub) });
      }

      const doctorPatientPath = matchPath(
        url.pathname,
        /^\/v1\/doctor\/patients\/(?<patientId>[A-Za-z0-9_-]+)\/entries$/u,
      );
      if (doctorPatientPath && request.method === "GET") {
        const doctor = requireAccess(principal, "doctor", "report:data:read");
        const patientId = idSchema.parse(doctorPatientPath.patientId);
        const entries = database.listPatientEntriesForDoctor(doctor.sub, patientId);
        if (!entries) throw new HttpError(404, "patient_not_linked");
        const patient = database.getLinkedPatient(doctor.sub, patientId);
        return json(response, 200, { patient, entries });
      }

      if (url.pathname === "/v1/doctor/keys" && request.method === "POST") {
        const doctor = requireAccess(principal, "doctor", "doctor:key:write");
        const body = registerDoctorKeySchema.parse(await readJson(request));
        validatePublicKey(body.publicKey);
        const key: DoctorPublicKey = {
          id: body.id,
          doctorId: doctor.sub,
          publicKey: body.publicKey,
          fingerprint: fingerprintPublicKey(body.publicKey),
          createdAt: new Date().toISOString(),
        };
        const inserted = database.registerDoctorKey(key);
        return json(response, inserted ? 201 : 200, key);
      }

      const doctorKeyPath = matchPath(
        url.pathname,
        /^\/v1\/patient\/doctors\/(?<doctorId>[A-Za-z0-9_-]+)\/key$/u,
      );
      if (doctorKeyPath && request.method === "GET") {
        const patient = requireAccess(principal, "patient", "report:write");
        const doctorId = idSchema.parse(doctorKeyPath.doctorId);
        const key = database.getDoctorKeyForPatient(patient.sub, doctorId);
        if (!key) throw new HttpError(404, "doctor_key_not_found");
        return json(response, 200, key);
      }

      if (url.pathname === "/v1/exports" && request.method === "POST") {
        const patient = requireAccess(principal, "patient", "report:write");
        const body = encryptedExportSchema.parse(await readJson(request));
        const expectedContext = doctorExportEnvelopeContext(body.id, body.doctorKeyId);
        if (body.envelope.context !== expectedContext) {
          throw new HttpError(400, "export_context_mismatch");
        }
        const expiry = new Date(body.expiresAt).getTime();
        if (expiry <= Date.now() || expiry > Date.now() + 30 * 86_400_000) {
          throw new HttpError(400, "invalid_export_expiry");
        }
        const value: EncryptedDoctorExport = {
          id: body.id,
          patientId: patient.sub,
          doctorId: body.doctorId,
          doctorKeyId: body.doctorKeyId,
          envelope: body.envelope,
          createdAt: new Date().toISOString(),
          expiresAt: body.expiresAt,
        };
        if (!database.insertEncryptedExport(value)) {
          throw new HttpError(403, "care_relationship_required");
        }
        return json(response, 201, {
          id: value.id,
          createdAt: value.createdAt,
          expiresAt: value.expiresAt,
        });
      }

      const doctorPatientExportsPath = matchPath(
        url.pathname,
        /^\/v1\/doctor\/patients\/(?<patientId>[A-Za-z0-9_-]+)\/exports$/u,
      );
      if (doctorPatientExportsPath && request.method === "GET") {
        const doctor = requireAccess(principal, "doctor", "report:read");
        const patientId = idSchema.parse(doctorPatientExportsPath.patientId);
        const exports = database.listEncryptedExportsForDoctor(doctor.sub, patientId);
        if (!exports) throw new HttpError(404, "patient_not_linked");
        return json(response, 200, { exports });
      }

      const exportPath = matchPath(url.pathname, /^\/v1\/exports\/(?<id>[A-Za-z0-9_-]+)$/u);
      if (exportPath && request.method === "GET") {
        const doctor = requireAccess(principal, "doctor", "report:read");
        const value = database.getEncryptedExport(idSchema.parse(exportPath.id), doctor.sub);
        if (!value) throw new HttpError(404, "export_not_found");
        return json(response, 200, value);
      }

      if (exportPath && request.method === "DELETE") {
        const patient = requireAccess(principal, "patient", "report:write");
        const deleted = database.deleteEncryptedExport(patient.sub, idSchema.parse(exportPath.id));
        if (!deleted) throw new HttpError(404, "export_not_found");
        return empty(response, 204);
      }

      throw new HttpError(404, "not_found");
    } catch (error) {
      if (response.headersSent) {
        response.end();
        return;
      }
      if (error instanceof HttpError) {
        return json(response, error.status, { error: error.code });
      }
      if (error instanceof ZodError) {
        return json(response, 400, {
          error: "validation_failed",
          fields: error.issues.map((issue) => issue.path.join(".")).filter(Boolean),
        });
      }
      if (error instanceof Error && error.message === "device_owner_mismatch") {
        return json(response, 409, { error: "device_owner_mismatch" });
      }
      if (error instanceof Error && error.message === "device_has_pending_entries") {
        return json(response, 409, { error: "device_has_pending_entries" });
      }
      if (error instanceof Error && error.message === "entry_owner_mismatch") {
        return json(response, 409, { error: "entry_owner_mismatch" });
      }
      if (error instanceof Error && error.message === "doctor_key_conflict") {
        return json(response, 409, { error: "doctor_key_conflict" });
      }
      // Never serialize thrown objects: DB/crypto errors can contain sensitive
      // details. Production logging should emit only this request id.
      const requestId = randomUUID();
      console.error(`heyjule-api request failed: ${requestId}`);
      return json(response, 500, { error: "internal_error", requestId });
    }
  });

  const cleanup = setInterval(() => database.cleanupExpired(), 60_000);
  cleanup.unref();
  server.on("close", () => clearInterval(cleanup));
  return { server, database };
}

async function main() {
  const config = loadConfig();
  const { server } = createApiServer({ config });
  server.listen(config.port, "0.0.0.0", () => {
    console.log(`HeyJule API listening on http://0.0.0.0:${config.port}`);
  });
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  void main();
}
