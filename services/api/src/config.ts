import { base64UrlToBytes } from "@heyjule/crypto";

export type ApiConfig = {
  apiUrl: string;
  port: number;
  databasePath: string;
  dataKey: Uint8Array;
  oauthIssuer: string;
  oauthAudience: string;
  oauthJwksUrl: string;
  allowedOrigins: Set<string>;
  trustProxy: boolean;
  production: boolean;
  devTokens: string | undefined;
};

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function loadConfig(): ApiConfig {
  const production = process.env.NODE_ENV === "production";
  const apiUrl = required("HEYJULE_API_URL").replace(/\/$/u, "");
  const oauthIssuer = required("HEYJULE_OAUTH_ISSUER").replace(/\/$/u, "");
  const dataKey = base64UrlToBytes(required("HEYJULE_DATA_KEY"));
  if (dataKey.length !== 32) throw new Error("HEYJULE_DATA_KEY must decode to exactly 32 bytes");
  const devTokens = process.env.HEYJULE_DEV_TOKENS?.trim();
  if (production && devTokens) throw new Error("HEYJULE_DEV_TOKENS is forbidden in production");

  return {
    apiUrl,
    port: Number(process.env.PORT ?? "8787"),
    databasePath: process.env.HEYJULE_DATABASE_PATH ?? "./data/heyjule-api.db",
    dataKey,
    oauthIssuer,
    oauthAudience: process.env.HEYJULE_OAUTH_AUDIENCE?.trim() || apiUrl,
    oauthJwksUrl:
      process.env.HEYJULE_OAUTH_JWKS_URL?.trim() || `${oauthIssuer}/.well-known/jwks.json`,
    allowedOrigins: new Set(
      (process.env.HEYJULE_ALLOWED_ORIGINS ?? "")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
    trustProxy: process.env.HEYJULE_TRUST_PROXY === "true",
    production,
    devTokens,
  };
}
