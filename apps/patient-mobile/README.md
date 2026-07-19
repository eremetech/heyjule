# heyjule patient app

Expo / React Native app for private daily symptom check-ins and patient-controlled doctor sharing.

## What is implemented

- Reference-matched home and conversational check-in screens.
- Continuously morphing SVG orb with idle, listening, thinking, and saved states.
- Real microphone permission, recording, duration, and live audio metering through `expo-audio`.
- Text check-in with contextual follow-up prompts.
- Review and save flow for notes, symptom tags, severity, and treatments.
- Progress overview with symptom intensity, frequent symptoms, and wearable summary cards.
- Scoped sharing UI for symptoms, wearables, treatments, and conversation transcripts.
- Time-limited access grants, native sharing sheet, and revocation UI.
- Reduced-motion support, native haptics, and screen-reader labels on primary actions.

Native symptom logs and access grants are stored with `expo-secure-store`. The web build intentionally uses memory-only storage instead of putting health data into unencrypted browser storage.

## Run it

This app targets **Expo SDK 54**, which matches the App Store / Play Store build of Expo Go on physical devices (as of mid-2026, store Expo Go has not tracked newer SDKs).

From the repository root:

```bash
pnpm install
pnpm --filter @heyjule/patient-mobile dev
```

Scan the QR code in the App Store Expo Go app, or press `i` for iOS Simulator, `a` for Android, or `w` for the web preview.

If you deliberately move to SDK 55+, use a [development build](https://docs.expo.dev/develop/development-builds/introduction/) or `npx eas-cli@latest go` — store Expo Go will not load those projects.

Quality checks:

```bash
pnpm --filter @heyjule/patient-mobile lint
pnpm --filter @heyjule/patient-mobile typecheck
pnpm --filter @heyjule/patient-mobile build
```

## Production integration boundaries

The product experience is implemented; the following server-backed integrations still need credentials and API contracts:

- `src/lib/conversation-client.ts` is the boundary for ElevenLabs Conversational AI. The app should request a short-lived signed conversation URL from `services/conversation`; never put an ElevenLabs API secret in `EXPO_PUBLIC_*` or the mobile bundle.
- Completed voice recordings currently stay local. Upload/transcription should go through the signed conversation session and explicit retention rules.
- Share grants are currently created on-device to exercise the consent and revocation UI. `services/api` must issue the real opaque token, enforce scope and expiry, and back the `/r/[token]` doctor route before links are externally usable.
- Wearable summary cards are presentation data until HealthKit / Health Connect and `services/wearables` are connected.
- ChatGPT import needs an explicit export/import flow and patient review before any conversation is included in a doctor report.

This app is a health journal and communication tool, not a diagnostic or emergency service. Urgent-care guidance and clinical safety escalation should be designed before a production release.
