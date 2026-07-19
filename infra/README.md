# Backend deployment

The root [`docker-compose.yml`](../docker-compose.yml) deploys `@heyjule/api` on
Dokploy or Coolify. Both platforms should build the Compose service from the
repository and route the API's public HTTPS domain to container port `8787`.

Configure these required environment variables in the platform UI:

- `HEYJULE_API_URL` — the final public URL, for example `https://api.example.com`
- `HEYJULE_DATA_KEY` — a 32-byte base64url key generated with
  `openssl rand -base64 32 | tr '+/' '-_' | tr -d '='`
- `HEYJULE_OAUTH_ISSUER` — the public OAuth/OIDC issuer

The following variables are optional:

- `HEYJULE_OAUTH_AUDIENCE` — defaults to `HEYJULE_API_URL`
- `HEYJULE_OAUTH_JWKS_URL` — defaults to the issuer's well-known JWKS URL
- `HEYJULE_ALLOWED_ORIGINS` — comma-separated browser origins
- `XAI_API_KEY` — required only for voice client-token minting

`HEYJULE_TRUST_PROXY` is deliberately enabled because TLS terminates at the
platform reverse proxy. Do not publish the container directly without that
trusted proxy. The named `heyjule-api-data` volume contains the SQLite database;
include it in encrypted backups and never scale this Compose service above one
replica.

After deployment, verify `https://<your-api-domain>/healthz` returns
`{"status":"ok"}`.
