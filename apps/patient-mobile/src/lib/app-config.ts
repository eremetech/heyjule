const productionApiUrl = "https://api.jules.agenticsonar.com";
const productionAuthUrl = "https://jules.agenticsonar.com";
const apiUrl =
  process.env.EXPO_PUBLIC_HEYJULE_API_URL?.trim().replace(/\/$/u, "") ||
  (__DEV__ ? null : productionApiUrl);
// Better Auth server (magic-link sign-in + short-lived JWTs for the API).
// Kept in the OAUTH_ISSUER env var so existing .env files keep working.
const authUrl =
  process.env.EXPO_PUBLIC_HEYJULE_OAUTH_ISSUER?.trim().replace(/\/$/u, "") ||
  (__DEV__ ? null : productionAuthUrl);

export const appConfig = {
  apiUrl,
  authUrl,
  authConfigured: Boolean(apiUrl && authUrl),
  devAccessToken: __DEV__ ? process.env.EXPO_PUBLIC_HEYJULE_DEV_ACCESS_TOKEN?.trim() || null : null,
  mockDataEnabled: process.env.EXPO_PUBLIC_HEYJULE_MOCK_DATA_ENABLED !== "false",
};
