# @heyjule/doctor-web

Doctor-facing web app: sign in, link patients via invite codes, and read each
patient's brief — a summary of their symptom history (voice logs, messages,
ChatGPT-conversation summaries) plus 14 days of wearable data. The report also
has an optional OpenAI-powered, report-grounded chat assistant.

Next.js (App Router) with its own backend: route handlers + server actions,
[Better Auth](https://better-auth.com) for email/password sessions, and SQLite
(`better-sqlite3`) for storage. OpenAI is only required for report chat.

## Setup

```bash
cp .env.example .env.local        # then set BETTER_AUTH_SECRET (openssl rand -base64 32)
                                     # and OPENAI_API_KEY to test the real chatbot
pnpm db:migrate                   # creates the Better Auth tables in ./data/heyjule.db
pnpm seed                         # demo doctor + 2 linked patients with data
pnpm dev                          # http://localhost:3000
```

Demo sign-in after seeding: `demo.doctor@heyjule.dev` / `jule-demo-password`.

## QR report flow (the frictionless path)

The seed also prints a **report link** (`/r/<token>`) — the expiring,
patient-scoped URL that would be embedded in the EPR PDF. Opening it shows a
QR gate ("Sign in to view <patient>'s data"); scanning the QR (or opening the
`/approve/<channel>` URL it encodes) simulates the phone-side approval, and the
desktop tab signs itself in. The viewer session is a browser-session cookie
bound to that one report link, capped at 30 minutes server-side. Design and
production plan: [`docs/frictionless-signin.md`](../../docs/frictionless-signin.md).

On localhost your phone can't reach the QR URL — open the encoded
`/approve/…` link in a second tab instead, or run `next dev -H 0.0.0.0` and use
your LAN IP. In development, the QR gate includes an **Open mock phone
approval** shortcut that opens the matching `/approve/…` page in a second tab.

The report opens with a **noteworthy strip** (computed deviation flags — see
`src/lib/insights.ts`), a collapsed one-line summary, PROM sections rendered
per instrument (MRS, ISI, … — fully data-driven), treatments labeled with
their EPR import source, and wearable tiles. PROM history sparklines and the
wearable tiles click through to full-page interactive charts
(`/r/<token>/prom/<item>` and `/r/<token>/wearables`) with crosshair tooltips,
symptom/patient-note markers, and treatment-start lines.

## Report chat

The collapsible chat dock uses Vercel AI SDK 6 and the direct OpenAI Responses
provider. It streams answers from `POST /api/report-chat`. The browser sends the
report token plus the visible text conversation; the route re-authorizes the
QR viewer session for that exact report and loads report data from SQLite. It
does not accept report context from the browser and does not persist chats.

The model payload excludes dedicated name, date-of-birth, database-ID, and
report-token fields; known name/DOB variants are also redacted from free text.
It contains the report's age/sex demographics, flags, brief,
PROMs, treatments, wearables, and symptoms. Requests are text-only, size- and
length-limited, best-effort rate-limited, same-origin checked, and sent with
OpenAI `store: false`. AI-generated Markdown is rendered with AI Elements.

`store: false` is not equivalent to Zero Data Retention. In production the
route stays disabled until `OPENAI_PHI_ENABLED=true`; only set that after the
OpenAI project and deployment have been approved for the intended health-data
workflow, including any required BAA and retention configuration. See OpenAI's
[data controls](https://developers.openai.com/api/docs/guides/your-data) and
have the final data flow reviewed by your privacy/security owner.

## Security model

- **Session auth** — Better Auth email/password (12-char minimum), 7-day
  httpOnly session cookies, secure cookies when served over https, built-in
  rate limiting on auth endpoints.
- **Middleware** redirects unauthenticated requests optimistically; the real
  check is `requireDoctor()` in every protected layout, page, and server action.
- **Scoped reads** — all patient data resolves through `patient_links` with an
  `active` (consented) link for the requesting doctor. A patient id in the URL
  is never trusted on its own; an unlinked doctor gets a 404.
- **Scoped report chat** — every request re-validates the short-lived viewer
  session against the report link, builds model context server-side, strips
  direct identifiers, and never stores the conversation in the application DB.
- **Consent flow** — the doctor generates a one-off invite code; the patient
  claims it in the mobile app to activate the link. Codes are revocable while
  pending, and links are revocable by the patient (`status = 'revoked'`).
- **Headers** — nosniff, frame denial, strict referrer policy, and (in
  production) HSTS + a restrictive Content-Security-Policy.

> Open sign-up is on for development. Gate doctor registration (invite-only or
> verified-identity onboarding) before any real deployment, and move the domain
> tables behind `services/api` when the shared connection layer lands.

## Layout

```
src/
├── app/
│   ├── (auth)/            # sign-in, sign-up
│   ├── (app)/             # authed shell: dashboard, patient briefs, actions
│   └── api/auth/[...all]/ # Better Auth handler
├── components/            # sparkline, sign-out
├── lib/                   # auth config, auth client, db + scoped queries, session gate
└── middleware.ts
scripts/seed.ts            # demo data
```
