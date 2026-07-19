# Architecture

heyjule is a **connection layer** between a patient's data and their doctor. Two
user-facing systems sit on one shared backend.

## Systems

| System           | User    | Surface | Package               |
| ---------------- | ------- | ------- | --------------------- |
| Patient app      | Patient | Mobile  | `apps/patient-mobile` |
| Doctor dashboard | Doctor  | Web     | `apps/doctor-web`     |

## Services (the connection layer)

- **`services/api`** — core gateway; auth, patient↔doctor linking (code/QR), access control.
- **`services/wearables`** — ingest & aggregate wearable data from device providers.
- **`services/conversation`** — voice/message symptom logging + reminders.
- **`services/reports`** — build the interactive summary/report for doctors.

## Shared packages

- **`packages/shared-types`** — domain models shared everywhere.
- **`packages/api-client`** — typed SDK both apps use to reach `services/api`.
- **`packages/config`** — shared tsconfig/eslint/prettier.

## Core flows

### 1. Patient onboarding & data capture
1. Patient installs `patient-mobile`, connects wearables → `services/wearables`.
2. Patient logs symptoms by voice/message → `services/conversation`.
3. Reminders nudge the patient to do/track things.

### 2. Linking a doctor
1. Doctor generates a **code / QR** in `doctor-web` (issued by `services/api`).
2. Patient scans/enters it in `patient-mobile`, granting consent.
3. `services/api` establishes the link and access scope.

### 3. Delivering the report
1. `services/reports` composes an interactive summary from wearable + conversation data.
2. `services/api` delivers it to the linked doctor.
3. `doctor-web` renders the interactive report.

## Privacy & consent

Health data is sensitive. The patient controls what a linked doctor can see; access is
scoped and revocable. Consent and access-control rules live in `services/api`.

The API now also distinguishes server-readable patient records from recipient-
encrypted transfer objects. ChatGPT inbox entries are sealed to a patient device
and deleted after explicit device acknowledgement; doctor exports are sealed on
the patient client to a doctor-controlled public key. See
[`backend-security.md`](backend-security.md) for the exact guarantees and limits.
