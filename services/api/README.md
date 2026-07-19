# @heyjule/api

The authoritative server-side connection layer for patient records, the
ChatGPT MCP handoff, consented doctor access, and end-to-end encrypted exports.

## What is implemented

- OAuth 2.1/OIDC access-token verification with issuer, audience, expiry,
  signature, role, and per-operation scope checks.
- A stateless MCP endpoint at `/mcp` exposing `new_entry`.
- Immediate P-256/HKDF/AES-GCM sealing of MCP summaries to the latest registered
  patient device. The database never receives the plaintext summary.
- Reliable two-phase inbox delivery: download ciphertext, persist/decrypt on the
  device, then `DELETE` to acknowledge and remove the server copy.
- AES-256-GCM encryption at rest for normal server-readable patient records.
- Care-relationship checks before doctor timeline reads or key lookup.
- Patient-created, doctor-public-key encrypted report exports. The server stores
  and returns ciphertext but has no doctor private key.
- OpenAI Responses API Structured Outputs over the patient's selected source
  window, with evidence ids, `store: false`, no plaintext report persistence,
  and separate mock/live-data safety gates.
- Metadata-only audit events and automatic encrypted-export expiry cleanup.
- Authenticated, five-minute xAI Voice API client-token minting without exposing
  the permanent provider key to the patient app.
- Authenticated Vercel Chat SDK Web adapter at `/v1/patient/chat`, backed by AI
  SDK streaming and the OpenAI Responses API (`store: false`). Multi-turn state
  uses pseudonymous thread ids and an AES-256-GCM wrapper around Redis, expires
  after two hours, and is deleted when the patient closes or saves.

The security boundary and remaining production work are documented in
[`../../docs/backend-security.md`](../../docs/backend-security.md). Mobile
integration is specified, without modifying the mobile app, in
[`../../docs/mobile-backend-contract.md`](../../docs/mobile-backend-contract.md).

## Run locally

```bash
cp services/api/.env.example services/api/.env.local
# Fill every required value. Use test identities only.
set -a
source services/api/.env.local
set +a
pnpm --filter @heyjule/api dev
```

ChatGPT connects to `https://<public-origin>/mcp`. The authorization server must
implement the OAuth 2.1 MCP requirements, including PKCE, protected-resource
audience binding, and discovery metadata.

## REST contract

| Method | Path | Role / scope | Purpose |
| --- | --- | --- | --- |
| `PUT` | `/v1/devices` | patient / `device:write` | Register or rotate the device encryption public key |
| `GET` | `/v1/inbox?device_id=…` | patient / `entry:claim` | Download pending sealed MCP entries (non-destructive) |
| `DELETE` | `/v1/inbox/:id?device_id=…` | patient / `entry:claim` | Acknowledge durable device storage and delete the server copy |
| `PUT` | `/v1/patient/entries/:id` | patient / `patient:data:write` | Idempotently store an encrypted-at-rest timeline item |
| `GET` | `/v1/patient/entries` | patient / `patient:data:read` | Read the patient's own timeline |
| `PUT` | `/v1/patient/profile` | patient / `patient:profile:write` | Store the encrypted-at-rest patient profile |
| `POST` | `/v1/patient/care-links/claim` | patient / `care:link` | Consume a clinician invite and grant access |
| `GET` | `/v1/patient/care-links` | patient / `care:link` | List active clinician relationships |
| `DELETE` | `/v1/patient/care-links/:doctorId` | patient / `care:link` | Revoke clinician access immediately |
| `POST` | `/v1/patient/reports/generate` | patient / `report:write` | Generate a structured clinical draft from selected linked-patient data |
| `GET` | `/v1/patient/exports` | patient / `report:write` | List the patient's active encrypted exports |
| `POST` | `/v1/voice/token` | patient / `patient:data:write` | Mint a short-lived xAI Voice API client token |
| `POST` | `/v1/patient/chat` | patient / `patient:data:write` | Stream a privacy-gated AI check-in through the Chat SDK Web adapter |
| `DELETE` | `/v1/patient/chat/:conversationId` | patient / `patient:data:write` | Delete the authenticated patient's temporary encrypted chat context |
| `POST` | `/v1/doctor/invites` | doctor / `care:invite` | Create a seven-day single-use patient invite |
| `GET` | `/v1/doctor/invites` | doctor / `care:invite` | List pending invites |
| `DELETE` | `/v1/doctor/invites/:id` | doctor / `care:invite` | Revoke a pending invite |
| `GET` | `/v1/doctor/patients` | doctor / `report:data:read` | List actively linked patient profiles |
| `GET` | `/v1/doctor/patients/:id/entries` | doctor / `report:data:read` | Read a linked patient's server-readable timeline |
| `GET` | `/v1/doctor/patients/:id/exports` | doctor / `report:read` | List a linked patient's active ciphertext exports |
| `POST` | `/v1/doctor/keys` | doctor / `doctor:key:write` | Register a doctor-held export decryption public key |
| `GET` | `/v1/patient/doctors/:id/key` | patient / `report:write` | Resolve the active linked doctor's public key |
| `POST` | `/v1/exports` | patient / `report:write` | Upload a client-encrypted doctor export |
| `GET` | `/v1/exports/:id` | doctor / `report:read` | Download an encrypted export |
| `DELETE` | `/v1/exports/:id` | patient / `report:write` | Revoke and delete an encrypted export |

## Verification

```bash
pnpm --filter @heyjule/crypto test
pnpm --filter @heyjule/api test
pnpm --filter @heyjule/api typecheck
```
