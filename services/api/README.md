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
- Metadata-only audit events and automatic expiry cleanup.
- Authenticated, five-minute xAI Voice API client-token minting without exposing
  the permanent provider key to the patient app.

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
| `GET` | `/v1/inbox?device_id=…` | patient / `entry:claim` | Download unexpired sealed MCP entries (non-destructive) |
| `DELETE` | `/v1/inbox/:id?device_id=…` | patient / `entry:claim` | Acknowledge durable device storage and delete the server copy |
| `PUT` | `/v1/patient/entries/:id` | patient / `patient:data:write` | Idempotently store an encrypted-at-rest timeline item |
| `GET` | `/v1/patient/entries` | patient / `patient:data:read` | Read the patient's own timeline |
| `POST` | `/v1/voice/token` | patient / `patient:data:write` | Mint a short-lived xAI Voice API client token |
| `GET` | `/v1/doctor/patients/:id/entries` | doctor / `report:data:read` | Read a linked patient's server-readable timeline |
| `POST` | `/v1/doctor/keys` | doctor / `doctor:key:write` | Register a doctor-held export decryption public key |
| `GET` | `/v1/patient/doctors/:id/key` | patient / `report:write` | Resolve the active linked doctor's public key |
| `POST` | `/v1/exports` | patient / `report:write` | Upload a client-encrypted doctor export |
| `GET` | `/v1/exports/:id` | doctor / `report:read` | Download an encrypted export |

## Provision a care relationship

For this pilot backend, relationship activation is an operator command rather
than a public API:

```bash
pnpm --filter @heyjule/api care-link -- patient_subject doctor_subject
```

Production onboarding should call the same database operation from a separately
authenticated consent workflow and record the patient-facing consent receipt.

## Verification

```bash
pnpm --filter @heyjule/crypto test
pnpm --filter @heyjule/api test
pnpm --filter @heyjule/api typecheck
```
