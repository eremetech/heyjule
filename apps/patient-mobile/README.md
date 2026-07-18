# @heyjule/patient-mobile

Patient-facing mobile app — **UI only for now** (no backend, all data mocked on device).
Built with Expo SDK 57 / React Native + TypeScript.

## Design language

Inspired by perk.com: cool concrete-gray surfaces, near-black ink, one flat lime accent,
off-black panels, pills, big tight Hanken Grotesk + IBM Plex Mono for values. Flat and
crisp — no beige, no gradients. Tokens live in [`src/theme.ts`](src/theme.ts).

## What's implemented (per the scope/MVP doc)

- **The Stream** — the only screen. Entries render as coded record cards (symptom,
  severity dots, category pill, verbatim utterance, context metadata with provenance
  on tap). Cycle phase tints the background as you scroll through time.
- **No chat** — capture is two buttons: **Voice** (hold to speak, live mock
  transcription, release to log) and **Text** (background blurs, a centered block +
  keyboard pops with haptic feedback on popup and submit). Extraction follow-ups appear
  as a **speech bubble from the top of the buttons**.
- **Proactive questions** — anchored inline at the anomaly's day, observation + source
  first, question second, never a verdict. Answer or dismiss.
- **The Margin** — ~24 px sparkline down the right edge aligned to scroll, tap to cycle
  RHR / skin temp / sleep, lime glows at anomalies, tap a glow to jump.
- **DAY / MONTH toggle** (pinch fallback) — month view compresses to phase bands,
  severity-sized markers, anomaly diamonds, and a widened signal trace.
- **Inflow shelf** (pull down / tap top handle) — 14 sources, 4 live with readings and
  a breathing sync dot; tap to pause, long-press for per-source research consent;
  "everything below this stays on this device" at the boundary.
- **Outflow sheet** (pull up / tap bottom handle) — Show my code / Scan theirs, scope
  controls (range, per-source, validity) that **frame the QR before it exists**, active
  shares with live expiry countdown and one-tap revoke.

## Run

```bash
pnpm install          # from repo root
pnpm --filter @heyjule/patient-mobile dev   # expo start (press w for web, or scan with Expo Go)
```

## Structure

```
App.tsx                 # composition: stream, gestures, capture state
src/theme.ts            # colors, phase tints, fonts
src/data/mock.ts        # 35-day demo user, extraction + follow-up mocks
src/lib/haptics.ts      # web-safe haptics wrappers
src/components/         # EntryCard, ProactiveCard, Margin, CaptureBar,
                        # TextCapture, VoiceCapture, InflowShelf, OutflowSheet,
                        # CompressedView, QRCode
```
