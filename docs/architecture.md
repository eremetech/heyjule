# Architecture

heyjule is a **connection layer** between a patient's data and their doctor. Two
user-facing systems sit on one shared backend.

## Systems

| System           | User    | Surface | Package               |
| ---------------- | ------- | ------- | --------------------- |
| Patient app      | Patient | Mobile  | `apps/patient-mobile` |
| Doctor dashboard | Doctor  | Web     | `apps/doctor-web`     |

## Services (the connection layer)

- **`services/api`** — implemented authoritative gateway for auth, patient data,
  patient↔doctor linking, structured LLM report generation, audit metadata, and
  encrypted-export storage.
- Wearable and conversation adapters are future ingestion boundaries. During
  the pilot, deterministic fixtures use the same typed entry and report flow;
  their replacement points are documented directly in
  `apps/patient-mobile/src/lib/mock-patient-data.ts`.

## Shared packages

- **`packages/shared-types`** — domain models shared everywhere.
- **`packages/api-client`** — typed SDK both apps use to reach `services/api`.
- **`packages/config`** — shared tsconfig/eslint/prettier.

## Core flows

### 1. Patient onboarding & data capture
1. The patient app binds its secure local journal to the authenticated patient subject.
2. A patient text check-in streams through Vercel Chat SDK and AI SDK to the
   privacy-gated OpenAI Responses API. Short-lived multi-turn context is stored
   under a pseudonymous thread id, encrypted before Redis, and deleted on
   close/save; only the reviewed note becomes a timeline entry.
3. In pilot mode it uploads deterministic mock conversations, ChatGPT MCP
   summaries, Apple Health-shaped measurements, PROMs, and ePA-shaped treatments.
4. Every entry carries a typed source and a `mock`/`live` provenance marker and
   is encrypted at rest by `services/api`.

### 2. Linking a doctor
1. Doctor generates a **code / QR** in `doctor-web` (issued by `services/api`).
2. Patient scans/enters it in `patient-mobile`, granting consent.
3. `services/api` establishes the link and access scope.

Invite codes are single-use, expire after seven days, are stored only as a
keyed SHA-256 lookup digest plus an encrypted-at-rest display copy, and can be revoked
before claim. The patient can revoke an active relationship at any time.

### 3. Generating and delivering the report
1. The patient chooses a linked doctor, timeframe, source scope, and expiry.
2. `services/api` verifies the care relationship, selects the matching records,
   and asks OpenAI Responses API Structured Outputs for a clinician-facing draft
   with evidence entry ids. Provider storage is disabled with `store: false`.
3. The plaintext draft returns only to the authenticated patient client; it is
   not written to the HeyJule database.
4. The patient client seals the report to the doctor browser's P-256 public key
   and uploads only the envelope.
5. The doctor dashboard downloads ciphertext and decrypts it locally with the
   private key stored in that browser's IndexedDB.

## Privacy & consent

Health data is sensitive. The patient controls what a linked doctor can see; access is
scoped and revocable. Consent and access-control rules live in `services/api`.

The API now also distinguishes server-readable patient records from recipient-
encrypted transfer objects. ChatGPT inbox entries are sealed to a patient device
and deleted after explicit device acknowledgement; doctor exports are sealed on
the patient client to a doctor-controlled public key. See
[`backend-security.md`](backend-security.md) for the exact guarantees and limits.

The doctor web database is an identity store only in production. Better Auth
keeps users, accounts, sessions, and JWT signing keys there; every health-data
read goes through `services/api` with a short-lived, audience-bound doctor JWT.
