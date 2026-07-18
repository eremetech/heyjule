# @heyjule/conversation

**Conversational symptom logging + reminders.**

## Responsibilities

- Capture symptoms from the patient via **voice or text** (speech-to-text + LLM parsing).
- Structure free-form input into logged symptom events (`@heyjule/shared-types`).
- Drive **reminders** for things the patient should do or track.

## Feeds

- `services/api`, which folds conversational data into what the doctor's report shows.
