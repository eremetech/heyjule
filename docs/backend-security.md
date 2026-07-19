# Backend security and privacy boundary

Status: production-shaped implementation, not a compliance certification.

## Short answer

Temporarily holding a chat summary can be appropriate if the patient requested
the transfer, the purpose and retention are explicit, access is authenticated,
the payload is minimized, and deletion is enforced. A TTL alone is not enough.
HeyJule therefore stores the MCP summary only after sealing it to a patient
device public key and deletes it after the device confirms durable storage.

A doctor-only export is also possible: the patient device encrypts the finished
report to a doctor-controlled public key before upload. The backend stores only
ciphertext and cannot decrypt that export. This does **not** mean HeyJule or
OpenAI never sees any patient data in every stage of the product.

## Three different confidentiality guarantees

| Data path | Stored form | Who can read plaintext? | Important limitation |
| --- | --- | --- | --- |
| ChatGPT conversation | Controlled by the selected ChatGPT product/workspace policy | Patient and OpenAI processing systems according to that policy | HeyJule cannot make the existing ChatGPT conversation zero-knowledge |
| Mobile AI check-in context | AES-256-GCM before Redis; maximum 40 messages; two-hour TTL plus client-requested close/save deletion | Authorized HeyJule process and the configured OpenAI processing systems | HeyJule decrypts context in memory to produce the next turn; `store: false` and Redis encryption do not replace provider approval or consent |
| MCP `new_entry` inbox | P-256 ECDH + HKDF-SHA256 + AES-256-GCM envelope for the patient device | ChatGPT already has the summary; the HeyJule MCP process sees tool arguments transiently; only the device can decrypt the stored row | Do not claim the server never handles plaintext in memory |
| Normal patient timeline | AES-256-GCM under a server data key | Authorized HeyJule backend workloads and linked doctors | Encryption at rest is not end-to-end encryption |
| LLM clinical-draft request | Not persisted by HeyJule; OpenAI request uses `store: false` | Authorized HeyJule process and the configured OpenAI processing systems | `store: false` is not a substitute for the required provider contract, privacy configuration, or legal review |
| Doctor export | P-256 ECDH + HKDF-SHA256 + AES-256-GCM envelope for the doctor's key | Holder of the doctor private key | Backend sees patient/doctor ids, timestamps, length, key id, and access metadata |

The strongest honest claim is: **HeyJule cannot decrypt stored doctor-export
ciphertext and cannot decrypt stored MCP inbox ciphertext.** It must not claim
that nobody except the doctor can ever see the source patient data, because the
server-readable timeline and the ChatGPT conversation have different trust
boundaries.

## Implemented controls

- OAuth access-token validation and operation-specific scopes.
- Patient/doctor role separation and active care-relationship checks.
- Authenticated encryption with a unique ephemeral P-256 key, salt, and nonce
  per sealed envelope; the record identity is authenticated as AAD.
- Two-phase delivery to avoid deleting before durable device storage.
- Acknowledgement-based MCP inbox deletion and maximum 30-day encrypted-export TTL.
- AES-256-GCM encryption at rest for server-readable records.
- No plaintext summary in tool results, audit metadata, or database fields.
- `Cache-Control: no-store`, security headers, body-size limits, input schemas,
  request throttling, and sanitized server errors.
- Metadata-only audit trail for key, inbox, patient-record, relationship, and
  export events.
- Structured clinical-draft output with evidence-entry ids, server-side schema
  validation, `store: false`, and separate gates for mock-only versus live/PHI data.
- Mobile text chat uses authenticated Chat SDK threads, pseudonymous keyed-hash
  user ids, AES-256-GCM-encrypted Redis values, a 40-message/two-hour history
  cap, explicit close/save deletion, masked provider errors, and `store: false`.
- No plaintext clinical report is persisted: the patient receives it transiently,
  seals it to the selected doctor's public key, and uploads only ciphertext.
- SQLite `secure_delete` plus WAL checkpointing after expiry cleanup. Because
  backups and storage snapshots may retain deleted blocks, short-lived inbox and
  export rows are additionally recipient-key encrypted.

## What must happen before real health data

1. Use an established OAuth 2.1/OIDC provider with PKCE, short token lifetimes,
   revocation, MFA/passkeys, audience binding, and separately reviewed patient
   and doctor enrollment. Do not implement a bespoke authorization server.
2. Put the server data key in KMS/HSM-backed secret management, implement key
   versioning/rotation, and prohibit it from developer laptops and CI output.
3. Move the repository adapter to managed PostgreSQL for high availability,
   encrypted storage/backups, point-in-time recovery, private networking, and
   tested restore procedures. The current SQLite adapter is a single-node pilot
   implementation and must not run on ephemeral serverless storage.
4. Replace the in-process rate limiter with gateway/WAF plus a shared limiter;
   validate proxy headers only from trusted load balancers.
5. Use TLS everywhere. For the MCP ingress, consider OpenAI client-certificate
   validation/mTLS in addition to end-user OAuth.
6. Add signed consent receipts, scope/version history, data-subject request
   workflows, and patient/doctor key-rotation and recovery UX. Relationship and
   individual export revocation are implemented, but need product/legal review.
7. Keep application, reverse-proxy, APM, analytics, support, and crash-reporting
   systems from recording authorization headers, bodies, query secrets, patient
   names, summaries, or decrypted reports.
8. Commission an independent security review, penetration test, dependency/SBOM
   process, incident response exercise, backup-retention review, and DPIA before
   production. Define the controller/processor roles and contracts for HeyJule,
   hosting, identity, analytics, and OpenAI.
9. Select a ChatGPT/API offering and contractual setup approved for the intended
   health-data use, geography, retention, training, and incident requirements.
   An encrypted HeyJule database does not change the fact that the chat provider
   processes the conversation before the MCP call.

## Browser versus native doctor key

The pilot doctor web stores an exportable P-256 private key string in that
browser's IndexedDB and never sends it to the backend. This proves the backend-
blind ciphertext flow, but it is not hardware-backed and remains accessible to
same-origin JavaScript. Move to a non-extractable WebCrypto key on managed
browsers, or preferably a signed native doctor app with hardware-backed keys,
before real health data. JavaScript delivered by a compromised web server can
still read a report after local decryption. Any design needs recovery/rotation
policy; a lost private key intentionally makes its old exports unrecoverable.

## Regulatory posture

Health information is sensitive data. For a Swiss launch, the revised FADP,
applicable cantonal rules for public healthcare bodies, medical confidentiality,
cross-border disclosure, and breach duties need legal review. GDPR may also
apply depending on establishments and patients. Data minimization, purpose and
storage limitation, appropriate technical/organizational controls, a processing
record, and a DPIA are product requirements rather than post-launch paperwork.

This document is engineering guidance, not legal advice.
