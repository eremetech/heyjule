# Dokploy / Coolify deployment

The root [`docker-compose.yml`](../docker-compose.yml) deploys two public
services:

- `api` on internal port `8787` — the authoritative health-data and consent API
- `doctor-web` on internal port `3000` — the Next.js dashboard and identity UI

Create one HTTPS domain for each service in Dokploy/Coolify. For example:

- API: `https://jules.agenticsonar.com` → `api:8787`
- Doctor web: `https://doctors.agenticsonar.com` → `doctor-web:3000`

## Required environment

```dotenv
HEYJULE_API_URL=https://jules.agenticsonar.com
BETTER_AUTH_URL=https://doctors.agenticsonar.com

# Generate each value independently; commands are below.
HEYJULE_DATA_KEY=
BETTER_AUTH_SECRET=

# Patient/mobile OAuth provider. Its access tokens must use the API URL as
# audience and include the patient role/scopes documented by services/api.
HEYJULE_OAUTH_ISSUER=https://auth.example.com
HEYJULE_OAUTH_AUDIENCE=https://jules.agenticsonar.com
HEYJULE_OAUTH_JWKS_URL=

# Browser callers only. Native mobile clients do not send Origin.
HEYJULE_ALLOWED_ORIGINS=https://doctors.agenticsonar.com

# Optional voice provider credential.
XAI_API_KEY=

# Required for AI-generated clinical drafts.
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6

# Pilot fixtures only. Real/live entries still require the separate PHI gate.
HEYJULE_ALLOW_MOCK_LLM=true
OPENAI_PHI_ENABLED=false
```

Generate the two required secrets in a trusted terminal or secrets manager:

```bash
openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n'  # HEYJULE_DATA_KEY
openssl rand -base64 48 | tr -d '\n'                    # BETTER_AUTH_SECRET
```

Do not reuse the values. `HEYJULE_DATA_KEY` encrypts server-readable health
records and must be retained for the lifetime of those records. Losing or
changing it makes existing encrypted data unreadable.

The Compose network supplies these internal values automatically:

- `HEYJULE_INTERNAL_API_URL=http://api:8787`
- `HEYJULE_DOCTOR_OAUTH_JWKS_URL=http://doctor-web:3000/api/auth/jwks`
- `HEYJULE_TRUST_PROXY=true`

The public Better Auth URL remains the JWT issuer, while the API fetches its
verification keys over the private Compose network. Patient OAuth remains a
separate explicitly configured issuer.

## Storage and scaling

- `heyjule-api-data` holds encrypted-at-rest patient profiles, timeline data,
  care relationships, invites, audit events, keys, and encrypted exports.
- `doctor-web-identity` holds only Better Auth users, accounts, sessions, and
  JWT signing keys in production.
- `doctor-web-cache` holds the writable Next.js runtime cache.

Back up the first two volumes with encryption. This is a single-node SQLite
pilot deployment, so keep both services at one replica. Migrate the repository
adapters to managed PostgreSQL before horizontal scaling or high availability.

## Data flow

1. A doctor signs in to the Next.js app.
2. Better Auth issues a ten-minute ES256 JWT scoped and audience-bound to the API.
3. The dashboard creates a seven-day, single-use invite through `services/api`.
4. The patient enters that code in the mobile app and explicitly confirms it.
5. The API atomically consumes the invite and activates the care relationship.
6. Patient profile and timeline payloads are encrypted at rest in the API database.
7. Doctor reads are checked against the active relationship on every request.
8. The doctor browser registers a public export key; its private half remains in IndexedDB.
9. The patient selects mock record sources and requests a structured OpenAI draft (`store: false`).
10. The patient app encrypts that draft to the doctor key and uploads only ciphertext.
11. The doctor browser decrypts and renders locally. The patient can revoke the export or relationship.

Verify both public health endpoints after deployment:

```text
https://jules.agenticsonar.com/healthz
https://doctors.agenticsonar.com/api/health
```
