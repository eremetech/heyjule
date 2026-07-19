# heyjule

**Jule turns "something feels off" into a story a doctor can actually use.**

Jule is a private, voice-first assistant for women's hormonal health. It brings a
patient's symptoms, cycle context, and chosen wearable data into one record a
clinician can instantly review. A patient can describe what is happening in
natural language, connect the health signals from wearables they choose, and let
Jule ask follow-up questions as the picture develops.

Before an appointment, Jule turns those scattered moments into a clear,
interactive record, which is shared only with explicit permission. Built for
women's hormonal health first, Jule can later extend to other long-term health
journeys.

## Problem & Challenge

Women's hormonal health data is scattered, and symptoms are often overlooked or
considered in isolation. The same symptom can mean different things depending on
its timing and wider context, so important patterns may be missed. This can
contribute to misdiagnosis or delayed diagnosis, leave patients confused, and
limit the longitudinal data available for research.

## Target Audience

Jule is for women who use wearables, want to track symptoms more easily, and are
looking for a clearer understanding of their body throughout an ongoing health
journey.

Clinicians get a clearer view of a patient's recent history and do not need to
spend time reconstructing it through routine questions during the appointment.

For health insurers, improved diagnostic accuracy can lower costs from incorrect
or unnecessary care.

## Solution & Core Features

Jule is the bridge between what a patient experiences between appointments and
what a clinician needs to see in the room. The patient can speak naturally about
symptoms, choose which wearable data to connect, and let Jule bring both
together in one timeline. Jule can remind the patient to track a symptom and,
when it repeats, carry forward the earlier context instead of asking them to
start from scratch. It then turns this evolving record into a clear interactive
overview for the next appointment, where clinicians can ask questions and
explore the relevant details.

Behind the scenes, Jule structures the information in a format that can also
support women's health research. A patient can voluntarily choose to contribute
de-identified data, helping build the longitudinal data foundation that research
currently lacks. The patient controls the bridge at every step, since the record
stays on their phone and is shared only with explicit permission.

## Unique Selling Proposition (USP)

Unlike symptom trackers that leave the patient to interpret and explain the
data, Jule combines natural voice logging with wearable integration and turns
both into one record a clinician can use. It reduces the burden of remembering,
tracking, and translating health history while keeping ownership with the
patient. The same record can also become a voluntary, de-identified contribution
to women's health research, linking better care today with better evidence
tomorrow.

## Implementation & Technology

heyjule is a **connection layer** between a patient's data and their doctor,
built as a pnpm/Turborepo monorepo with two user-facing surfaces on top of one
shared backend.

### Patient app (`apps/patient-mobile`)
- **Expo / React Native** cross-platform mobile app (iOS, Android, web)
- Voice symptom logging via **`expo-audio`** with real-time metering, live
  waveform, and haptic feedback (**`expo-haptics`**) on capture
- Voice-agent orb visualization built on **`orb-ui`**, recolored to the brand
  palette via a CSS hue-rotate transform
- Text check-in as a fallback to voice
- Journal screen surfacing past logs and reminders
- Share screen for generating a scoped patient→doctor sharing code/QR
- Auth via **`expo-auth-session`** + **`expo-secure-store`**; on-device
  encryption via the shared **`@heyjule/crypto`** package
  (`@noble/curves`, `@noble/ciphers`)

### Doctor dashboard (`apps/doctor-web`)
- **Next.js** web app
- **`better-auth`** for doctor authentication, backed by **`better-sqlite3`**
- QR code generation (**`qrcode`**) for the patient-linking flow
- Renders the interactive report composed by `services/reports`

### Backend services (the connection layer)
- **`services/api`** — core gateway: OAuth-protected patient records,
  patient↔doctor linking (code/QR), access control, and a
  **Model Context Protocol (`@modelcontextprotocol/sdk`)** `new_entry` handoff
  for ChatGPT-originated check-ins
- **`services/wearables`** — ingests and aggregates wearable data from
  connected device providers
- **`services/conversation`** — voice/message symptom logging and reminders
- **`services/reports`** — composes the interactive summary/report for doctors

### Shared packages
- **`packages/shared-types`** — domain models shared across apps and services
- **`packages/api-client`** — typed SDK both apps use to reach `services/api`
- **`packages/crypto`** — end-to-end encryption primitives; server-readable
  patient records are kept distinct from recipient-encrypted transfer objects.
  ChatGPT inbox entries are sealed to a patient device and deleted after
  explicit device acknowledgement; doctor exports are sealed on the patient
  client to a doctor-controlled public key
- **`packages/config`** — shared tsconfig / eslint / prettier config

### How the pieces connect

```
 Wearables ─┐
            ├─► services/wearables ─┐
 Voice/msg ─┘                       │
 (patient-mobile) ─► services/conversation ─► services/api ─► services/reports
                                                   │
                    doctor shares code/QR ◄────────┤
                    doctor-web receives report ◄────┘
```

All access is scoped and revocable by the patient; consent and access-control
rules live in `services/api`. See [`docs/backend-security.md`](docs/backend-security.md)
for the exact guarantees and the production/compliance work that remains, and
[`docs/architecture.md`](docs/architecture.md) for the full system breakdown.

## Results & Impact

Jule's impact is lower costs for insurers through more informed clinical
decisions, and better diagnostic accuracy — turning scattered, hard-to-recall
symptom history into a clear, longitudinal record that improves the quality of
every appointment it's used in.

## Monorepo layout

```
heyjule/
├── apps/
│   ├── patient-mobile/     # Patient mobile app (Expo / React Native)
│   └── doctor-web/         # Doctor dashboard (Next.js web)
├── services/
│   ├── api/                # Core API gateway — the connection layer
│   ├── wearables/           # Wearable data ingestion & aggregation
│   ├── conversation/        # Voice/message symptom logging + reminders
│   └── reports/             # Interactive summary/report generation
├── packages/
│   ├── shared-types/        # Shared domain models & TypeScript types
│   ├── api-client/          # Typed client SDK used by both apps
│   ├── crypto/              # End-to-end encryption primitives
│   └── config/               # Shared tsconfig / eslint / prettier config
├── infra/                   # Infrastructure as code, deployment
└── docs/                    # Architecture & product docs
```

## Getting started

This is a [pnpm](https://pnpm.io) workspace orchestrated with [Turborepo](https://turbo.build).

```bash
pnpm install     # install all workspaces
pnpm dev         # run dev tasks across the repo
pnpm build       # build all workspaces
pnpm lint        # lint all workspaces
```

The doctor and patient surfaces are active prototypes. `services/api` now contains
the production-shaped backend boundary for OAuth-protected patient records, the
ChatGPT MCP `new_entry` handoff, and doctor-recipient encrypted exports. Review
[`docs/backend-security.md`](docs/backend-security.md) before using real health
data; the document separates implemented guarantees from production/compliance
work that remains.

## Requirements

- Node.js (see [`.nvmrc`](.nvmrc))
- pnpm (see `packageManager` in [`package.json`](package.json))
