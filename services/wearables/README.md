# @heyjule/wearables

**Wearable data ingestion & aggregation.**

## Responsibilities

- Integrate with wearable providers (Apple Health, Fitbit, Oura, Garmin, ...).
- Normalize heterogeneous device data into shared domain models (`@heyjule/shared-types`).
- Aggregate raw signals into the trends surfaced to patients and doctors.

## Feeds

- `services/api`, which exposes aggregated data to the apps and to `services/reports`.
