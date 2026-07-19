# Patient mobile ↔ backend contract

This document is the handoff for the mobile implementation. No files under
`apps/patient-mobile` were changed as part of the backend work.

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
ciphertext for 15 minutes.

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

The export must be assembled and encrypted on the patient device. If the API
assembles it, the API necessarily sees the plaintext.

1. Resolve the public key for the doctor in the active patient-consented care
   relationship:

```http
GET /v1/patient/doctors/<doctorId>/key
Authorization: Bearer <patient access token with report:write>
```

2. Generate a random `exportId`.
3. Build the minimum report payload authorized by the patient's chosen scope.
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
