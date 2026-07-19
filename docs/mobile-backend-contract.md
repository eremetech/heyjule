# Patient mobile ↔ backend contract

The patient app implements device registration, sealed inbox pickup, local
durability, typed patient-entry sync, acknowledgement ordering, structured
report generation, patient-side encryption, export listing, and revocation.

## Dependencies and shared code

- Wire types: `@heyjule/shared-types`
- P-256 sealed-envelope helpers: `@heyjule/crypto`
- API origin: an Expo public configuration value containing only the HTTPS API
  origin; never put client secrets, enrollment secrets, or server data keys in
  the mobile bundle.
- Authorization: OAuth authorization-code flow with PKCE. Store refresh/access
  credentials using platform secure storage; use short-lived access tokens.

Required patient scopes are `device:write entry:claim patient:data:write
patient:data:read report:write`. ChatGPT separately receives `entry:write` after
the patient links the same account.

Before syncing a local journal, call authenticated `GET /v1/session` and bind
that journal to the returned patient `subject`. Refuse to upload if a later
session has a different subject; this prevents one person's offline records
from being copied into another account after an account switch.

## 1. Create and register the device encryption key

On first authenticated launch:

1. Generate 32 cryptographically random bytes and call
   `generateEncryptionKeyPair` from `@heyjule/crypto`.
2. Store only `privateKey` in iOS Keychain / Android Keystore-backed secure
   storage, configured as this-device-only where supported. Never put it in
   AsyncStorage, logs, analytics, crash reports, or cloud backup.
3. Persist a random, stable `deviceId` in secure storage.
4. Register the public half:

```http
PUT /v1/devices
Authorization: Bearer <patient access token>
Content-Type: application/json

{
  "deviceId": "device_<random id>",
  "publicKey": "<base64url uncompressed P-256 public key>"
}
```

Re-registering the same device id rotates its public key. Do not rotate while
unacknowledged inbox items exist unless the old private key is retained until
those items are processed.

## 2. Receive a ChatGPT `new_entry`

The MCP server seals each summary to the latest registered device and keeps the
ciphertext until that device durably saves and acknowledges it.

1. Download without deleting:

```http
GET /v1/inbox?device_id=<deviceId>
Authorization: Bearer <patient access token with entry:claim>
```

2. For each item, derive its authenticated context exactly as:

```ts
inboxEnvelopeContext(entry.id, entry.deviceId)
```

3. Decrypt with `openJson<ChatSummaryPayload>(entry.envelope, privateKey,
   context)`. Any context mismatch or authentication failure is a hard failure;
   do not display, persist, or acknowledge the item.
4. Map the summary into the local health timeline and save it durably first.
   Deduplicate by the remote inbox entry id.
5. Idempotently sync the resulting record to the server:

```http
PUT /v1/patient/entries/<stable local record id>
Authorization: Bearer <patient access token with patient:data:write>
Content-Type: application/json

{
  "occurredAt": "2026-07-19T12:00:00.000Z",
  "kind": "chat_summary",
  "source": "chatgpt_app_mcp",
  "dataMode": "live",
  "payload": {
    "title": "…",
    "summary": "…",
    "noteworthy": [],
    "sourceInboxId": "inbox_…"
  }
}
```

6. Only after steps 4 and 5 succeed, acknowledge deletion:

```http
DELETE /v1/inbox/<entryId>?device_id=<deviceId>
Authorization: Bearer <patient access token with entry:claim>
```

This ordering intentionally permits duplicate delivery after a crash but never
silent loss. The stable record id/source inbox id makes retries idempotent.

## 3. Create a doctor-only export

The structured draft is generated transiently by the API/LLM, but the export
envelope must be assembled and encrypted on the patient device. The API sees
the selected source data and draft during generation, then persists only the
doctor-targeted ciphertext.

1. Resolve the public key for the doctor in the active patient-consented care
   relationship:

```http
GET /v1/patient/doctors/<doctorId>/key
Authorization: Bearer <patient access token with report:write>
```

2. Generate a random `exportId`.
3. Ask the API for a structured report using the selected doctor, timeframe,
   and source scope:

```http
POST /v1/patient/reports/generate
Authorization: Bearer <patient access token with report:write>
Content-Type: application/json

{
  "doctorId": "doctor OAuth subject",
  "timeframeDays": 30,
  "scope": {
    "symptoms": true,
    "wearables": true,
    "treatments": true,
    "conversations": true,
    "proms": true
  }
}
```

The API and configured LLM necessarily see the selected source plaintext while
generating this draft. HeyJule does not persist the plaintext report, and the
OpenAI request sets `store: false`. Live entries are refused unless the separate
provider privacy/PHI gate is enabled.

4. Call `doctorExportEnvelopeContext(exportId, doctorKey.id)` and then
   `sealJson(report, doctorKey.publicKey, context, secureRandomBytes)`.
5. Upload the returned envelope:

```http
POST /v1/exports
Authorization: Bearer <patient access token with report:write>
Content-Type: application/json

{
  "id": "export_…",
  "doctorId": "doctor OAuth subject",
  "doctorKeyId": "doctor_key_…",
  "envelope": { "version": 1, "algorithm": "P256-HKDF-SHA256-A256GCM", "…": "…" },
  "expiresAt": "<future ISO timestamp, at most 30 days>"
}
```

The doctor client downloads the ciphertext from `/v1/exports/:id` and decrypts
locally using the private key matching `doctorKeyId`.

The patient lists active exports with `GET /v1/patient/exports` and deletes an
individual export with `DELETE /v1/exports/:id`. Revoking the care relationship
also immediately prevents doctor reads and downloads.

## Failure and recovery rules

- Network failure before inbox acknowledgement: retry; do not create a second
  local timeline item.
- Private key missing/corrupt: do not acknowledge. Offer a clear recovery path;
  a newly registered key cannot decrypt envelopes made for an old key.
- Doctor key lost: existing exports are intentionally unrecoverable. Key
  rotation applies only to new exports unless the patient explicitly re-exports.
- Logout/account switch: remove cached plaintext and access tokens. Decide with
  product/legal whether the device private key is deleted or retained for later
  reauthentication.
- Never send decrypted summaries/exports to analytics, session replay, remote
  logging, push notification bodies, or crash-report breadcrumbs.
