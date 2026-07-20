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

## Try it out

There are three ways in, from zero-install to full native.

### 1. Hosted demo — nothing to install

| Surface | URL |
|---|---|
| Landing gate | https://web.agenticsonar.com |
| Patient app (web preview, iPhone-framed) | https://app.jules.agenticsonar.com |
| Clinician dashboard | https://jules.agenticsonar.com |

Patient sign-in is passwordless: enter your email, receive a **6-digit code**,
type it in. The web preview runs the labeled mock-data pilot fixture and skips
native-only features (voice check-ins, Apple Health) — that's what the
native app below is for.

### 2. Run the iPhone app — recommended, all features

**Prerequisites** (macOS only):

- Xcode 16+ with the iOS simulators installed (`xcode-select --install` first if fresh)
- CocoaPods — `brew install cocoapods`
- Node 20+ and corepack — `corepack enable` activates the pinned pnpm 9.12 automatically

**Install & run:**

```bash
git clone https://github.com/eremetech/heyjule.git
cd heyjule
corepack enable
pnpm install                # installs every workspace (react is pinned to 19.1.0 repo-wide)

cd apps/patient-mobile
cp .env.example .env        # points the app at the hosted backend; mock-data pilot mode on
pnpm ios                    # compiles the dev client and boots it in the iOS simulator
```

The first build takes a few minutes (CocoaPods + Xcode compile); after that,
Metro hot-reloads JS changes instantly.

**On a physical iPhone** (best experience — real microphone for voice
check-ins, and the emailed sign-in link opens straight into the app):

```bash
pnpm exec expo run:ios --device    # pick your iPhone from the list
```

Xcode will ask you to select a signing team the first time — a free Apple ID
works. Your phone and Mac must be on the same network for Metro.

**Sign in:** enter your email → either tap the emailed link on that iPhone
(one tap, via the `heyjule://` deep link) or choose *"Can't open the link?
Email me a code"* and type the 6-digit code.

**Voice check-in:** tap the orb on the home screen and just talk — Jule asks
follow-ups and files the check-in. On the simulator the Mac's microphone is used.

### 3. Patient app in a local browser

```bash
cd apps/patient-mobile
pnpm web                    # Expo web dev server on http://localhost:8081
```

Same code as the hosted preview, hot-reloading locally.

### Link a patient to a doctor (the full demo loop)

1. Sign up as a clinician at https://jules.agenticsonar.com and keep the portal
   open once — that registers the browser's local encryption key for reports.
2. On the dashboard, create a **new invite code**.
3. In the patient app, open **Share** and enter that code, then confirm the link.
4. Generate a clinical report in the app — it is encrypted **to that doctor's
   browser key** before upload; the dashboard decrypts and renders it locally
   with the interactive trend charts.

### Running the whole backend yourself (optional)

Each service documents its environment in a `.env.example` next to its code
(`services/api`, `apps/doctor-web`, root). Local dev servers:

```bash
pnpm --filter @heyjule/api dev         # core API on :8787
pnpm --filter @heyjule/doctor-web dev  # clinician dashboard on :3000
```

Production runs from [`docker-compose.yml`](docker-compose.yml) behind a
reverse proxy (five services: doctor-web, api, patient-web, website, redis).
`BETTER_AUTH_SECRET` and `HEYJULE_DATA_KEY` are required; generate them with
`openssl rand -base64 32` and
`node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.

`services/api` contains the production-shaped backend boundary for
OAuth-protected patient records, the ChatGPT MCP `new_entry` handoff, and
doctor-recipient encrypted exports. Review
[`docs/backend-security.md`](docs/backend-security.md) before using real health
data; the document separates implemented guarantees from production/compliance
work that remains.

## Workspace commands

This is a [pnpm](https://pnpm.io) workspace orchestrated with [Turborepo](https://turbo.build).

```bash
pnpm install     # install all workspaces
pnpm dev         # run dev tasks across the repo
pnpm build       # build all workspaces
pnpm lint        # lint all workspaces
```

## Requirements

- Node.js 20+ (see [`.nvmrc`](.nvmrc))
- pnpm 9.12 via corepack (see `packageManager` in [`package.json`](package.json))
- Xcode 16+ and CocoaPods for the iOS app
