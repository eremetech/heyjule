# heyjule

A connection layer between patients' **wearable + conversational data** and their **doctors**.

Two user-facing systems sit on top of one shared connection layer:

- **Patient side** (mobile app) — aggregates wearable data, lets patients log symptoms by
  voice or message, and reminds them of things to do and track.
- **Doctor side** (web app) — doctors share a code / QR code with a patient and receive an
  interactive summary/report of that patient's data.

## Monorepo layout

```
heyjule/
├── apps/
│   ├── patient-mobile/     # Patient mobile app (Expo / React Native)
│   └── doctor-web/         # Doctor dashboard (Next.js web)
├── services/
│   ├── api/               # Core API gateway — the connection layer
│   ├── wearables/         # Wearable data ingestion & aggregation
│   ├── conversation/      # Voice/message symptom logging + reminders
│   └── reports/           # Interactive summary/report generation
├── packages/
│   ├── shared-types/      # Shared domain models & TypeScript types
│   ├── api-client/        # Typed client SDK used by both apps
│   └── config/            # Shared tsconfig / eslint / prettier config
├── infra/                 # Infrastructure as code, deployment
└── docs/                  # Architecture & product docs
```

## How the pieces connect

```
 Wearables ─┐
            ├─► services/wearables ─┐
 Voice/msg ─┘                       │
 (patient-mobile) ─► services/conversation ─► services/api ─► services/reports
                                                   │
                    doctor shares code/QR ◄────────┤
                    doctor-web receives report ◄────┘
```

## Getting started

This is a [pnpm](https://pnpm.io) workspace orchestrated with [Turborepo](https://turbo.build).

```bash
pnpm install     # install all workspaces
pnpm dev         # run dev tasks across the repo
pnpm build       # build all workspaces
pnpm lint        # lint all workspaces
```

> Structure only — no application code yet. Each workspace has a README describing its scope.

## Requirements

- Node.js (see [`.nvmrc`](.nvmrc))
- pnpm (see `packageManager` in [`package.json`](package.json))
