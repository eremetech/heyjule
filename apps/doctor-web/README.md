# @heyjule/doctor-web

Doctor-facing **web app** (planned stack: Next.js + TypeScript).

## Responsibilities

- Let doctors **generate and share a code / QR code** with a patient to establish a link.
- Receive and display an **interactive summary/report** of the connected patient's
  wearable + conversational data.
- Manage connected patients and review trends over time.

## Talks to

- `services/api` (via `@heyjule/api-client`) for patient linking and data access.
- `services/reports` for the interactive summary/report payloads.

## Structure (to be added)

```
src/
  app/            # Next.js app router
  features/       # patient-linking, report-viewer, patients-list
  components/
  lib/
```
