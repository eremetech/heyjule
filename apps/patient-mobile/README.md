# @heyjule/patient-mobile

Patient-facing **mobile app** (planned stack: Expo / React Native + TypeScript).

## Responsibilities

- Connect to and **aggregate wearable data** (Apple Health, Fitbit, Oura, etc.).
- Let patients **log symptoms** via **voice or text** message.
- **Remind** patients of things to do and track (medication, measurements, check-ins).
- Show the patient's own trends and let them **share a code / QR** with their doctor.

## Talks to

- `services/api` (via `@heyjule/api-client`) for sync and sharing.
- `services/conversation` for voice/message symptom capture.
- `services/wearables` for wearable data ingestion.

## Structure (to be added)

```
src/
  features/       # wearables, symptom-logging, reminders, sharing
  components/
  navigation/
  lib/
```
