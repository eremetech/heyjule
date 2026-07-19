const apiUrl = process.env.EXPO_PUBLIC_HEYJULE_API_URL?.trim().replace(/\/$/u, "") || null;
const oauthIssuer = process.env.EXPO_PUBLIC_HEYJULE_OAUTH_ISSUER?.trim().replace(/\/$/u, "") || null;
const oauthClientId = process.env.EXPO_PUBLIC_HEYJULE_OAUTH_CLIENT_ID?.trim() || null;

export const appConfig = {
  apiUrl,
  oauthIssuer,
  oauthClientId,
  oauthConfigured: Boolean(apiUrl && oauthIssuer && oauthClientId),
  devAccessToken: __DEV__ ? process.env.EXPO_PUBLIC_HEYJULE_DEV_ACCESS_TOKEN?.trim() || null : null,
};

export const patientScopes = [
  "openid",
  "profile",
  "offline_access",
  "device:write",
  "entry:claim",
  "patient:data:write",
  "patient:data:read",
  "report:write",
];
