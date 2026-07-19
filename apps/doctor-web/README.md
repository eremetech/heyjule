# @heyjule/doctor-web

Doctor-facing Next.js app for creating patient invite codes, reading the
consented patient timeline, and opening patient-encrypted AI clinical drafts.

## Production data boundary

The dashboard does not read health data from its local SQLite database. Its
database contains only Better Auth users, accounts, sessions, and JWT signing
keys. Patient profiles, entries, invite state, care relationships, encrypted
exports, and audit events live behind `services/api`.

After validating the browser session, the server obtains a short-lived ES256
JWT from Better Auth and calls the API over the private deployment network. The
token is bound to `HEYJULE_API_URL`; the API validates issuer, audience,
signature, doctor role, and operation scope before checking the active care
relationship.

On first authenticated use, the browser creates a P-256 export key, keeps the
private key in IndexedDB, and registers only the public key through the API.
Encrypted reports are downloaded by the authenticated Next.js server but are
opened only in the browser. Clearing browser storage intentionally makes reports
for that key unrecoverable; production still needs managed, non-extractable or
hardware-backed keys and a reviewed recovery/rotation policy.

## Local setup

Run `services/api` first, then configure:

```dotenv
BETTER_AUTH_SECRET=<openssl rand -base64 48>
BETTER_AUTH_URL=http://localhost:3000
DATABASE_PATH=./data/identity.db
HEYJULE_API_URL=http://localhost:8787
HEYJULE_INTERNAL_API_URL=http://localhost:8787
```

The API must include this app as its optional doctor issuer:

```dotenv
HEYJULE_DOCTOR_OAUTH_ISSUER=http://localhost:3000
HEYJULE_DOCTOR_OAUTH_AUDIENCE=http://localhost:8787
HEYJULE_DOCTOR_OAUTH_JWKS_URL=http://localhost:3000/api/auth/jwks
```

Then run:

```bash
pnpm --filter @heyjule/doctor-web dev
```

The identity schema is created idempotently on first boot. The real care-link
flow is:

1. Doctor creates an invite in the dashboard.
2. Patient opens **Share with your doctor → Link clinician**, enters the six-character code, and confirms.
3. The API consumes the single-use invite and activates the relationship.
4. Synchronized patient entries appear in the doctor's timeline.
5. Patient chooses the report window and sources. The API asks the configured
   LLM for a structured draft, and the patient app seals it to the browser key.
6. The doctor opens the encrypted report; decryption and report rendering happen
   locally in the browser.
7. Patient export or relationship revocation immediately removes API access.

## Legacy visual report prototype

The earlier `/r/*` QR report prototype and its mock tables are disabled by
default and are not created in the production Compose deployment. For isolated
UI development only, set `HEYJULE_ENABLE_LEGACY_REPORTS=true`, run `db:migrate`
and `seed`, and never mix that mock database with real patient data.

Open doctor registration remains suitable only for development. Production
onboarding must be restricted to verified clinicians before real health data is
used.
