# Frictionless doctor sign-in

How a doctor gets from a link in the electronic patient record (EPR) to a
patient's report with zero typing, and how the session stays safe.

## The flow (implemented as a working mock in `apps/doctor-web`)

```
EPR PDF ──contains──► https://…/r/<token>        (expiring, patient-scoped link)
                            │
                            ▼
                  "Sign in to view <patient>'s data" + QR code
                            │                         │
              desktop polls the channel        doctor scans QR with phone
                            │                         │
                            ◄──── phone approves ─────┘
                            ▼
        tab receives a session cookie (no Max-Age → dies with the tab)
                            ▼
                     patient report renders
```

Three separable credentials make this safe:

| Thing | What it proves | Lifetime |
| --- | --- | --- |
| Report link token (`/r/<token>`) | *This patient consented to share this data* — a capability, not an identity | Days–weeks; revocable; set when the PDF is generated |
| QR handshake channel | *A person with the doctor's phone is standing at this screen right now* | 3 minutes, single use |
| Viewer session | *This tab may render the report* | Browser-session cookie + 30-min server TTL, bound to one report link |

The mock wires all three for real (SQLite tables `report_links`, `qr_channels`,
`viewer_sessions`); only the phone side is simulated by a plain approval page.
That page is exactly the seam where a production identity check plugs in.

## What should do the approving? Three options

### Option A — Passkeys (recommended starting point)

WebAuthn already ships the cross-device story natively: the browser shows its
own QR ("hybrid" / cross-device authentication), the doctor's phone confirms
with Face ID / fingerprint, and proximity is *proven* over Bluetooth — a photo
of the QR sent to a victim can't be approved remotely, which kills the
QR-phishing attack class. No companion app to build or distribute.

- Flow: link → page shows one button ("Continue with passkey") → browser QR →
  Face ID on phone → session. After the first use on a given computer, the
  passkey can be remembered → next time it's literally one click.
- One-time setup: the doctor enrolls a passkey once (from an invite email at
  practice onboarding). That's the whole account.
- Better Auth has a first-party plugin (`@better-auth/passkey`), so it slots
  into the existing auth stack.
- Trade-offs: the QR/hand-off UI belongs to the browser, not us (slightly less
  branded than the mockup); old browsers on clinic machines may lack support —
  needs a fallback (email magic link).

### Option B — Companion-app QR approval (the mock's shape)

Our own QR + the HeyJule doctor app holding the credential — the WhatsApp
Web / banking-app pattern, and what the current mock implements.

- Full control of the UX (the in-page QR exactly as in the mockup) and works in
  any browser.
- Requires building, distributing, and securing a doctor mobile app first.
- Proximity is *not* proven: a scanned-from-a-photo QR approves just the same
  (quishing). Mitigations are mandatory: 3-minute single-use channels (done),
  biometric confirmation in-app, the approval screen naming patient + doctor
  (done), and ideally number-matching (desktop shows 2 digits, app asks which).

### Option C — Email magic link (fallback only)

Click link in EPR → enter practice email → tap link on phone. No app, no
passkey, but two context switches — fails the "super fast" bar. Keep as the
fallback for unsupported browsers, not the main path.

## Recommendation

1. **Now:** ship the mock's channel flow as the demo; it is production-shaped.
2. **First real version: passkeys.** Least to build, phishing-resistant,
   proximity-proven, and the "remember this computer" upgrade makes repeat
   sign-ins one click. Keep the in-page QR screen as the *pre-auth* state and
   trigger the WebAuthn ceremony from it.
3. **Later, when the doctor app exists:** add companion-app approval behind the
   same `qr_channels` API — the desktop side doesn't change at all.

## Session policy (applies to every option)

- Cookie is set **without Max-Age** → the browser drops it when the tab/browser
  closes. Note: "reopen last session" browser settings can resurrect session
  cookies, so the short **server-side TTL (30 min, sliding)** is the real
  guarantee — both are implemented.
- Session is **bound to one report link** → one patient; opening another
  patient's link re-runs the handshake.
- Handshake channels are **single-use** and expire in 3 minutes; replay returns
  `consumed` (verified in the mock).
- Report links are capabilities: **expiry + revocation + audit** belong on
  them. Log every view (who approved, when, from where) — required for health
  data anyway.

## Open questions

- **Patient name on the pre-auth screen.** The mockup shows "Sign in to view
  Mr. XYZ's data" before any authentication; anyone with the link sees the
  name. Consider initials ("M. K.") or "your patient's data" pre-auth.
- **Link lifetime.** PDFs live long in EPR archives. Short expiry (days) is
  safer but means regenerating; a middle path is a long-lived link that always
  demands the phone approval (identity), which the current design already does.
- Where report links get minted: `services/reports` should issue them when it
  generates the PDF; the seed script stands in for that today.
