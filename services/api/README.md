# @heyjule/api

The **core API gateway** — the heart of the connection layer.

## Responsibilities

- Auth, patients, doctors, and the **patient↔doctor linking** (code / QR redemption).
- Aggregate data from `wearables`, `conversation`, and `reports` behind one API.
- Enforce consent & access control for what a doctor can see about a patient.

## Consumed by

- `apps/patient-mobile` and `apps/doctor-web` (via `@heyjule/api-client`).

## Coordinates

- `services/wearables`, `services/conversation`, `services/reports`.
