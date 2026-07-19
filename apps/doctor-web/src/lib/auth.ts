import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { jwt } from "better-auth/plugins";
import { db } from "./db.ts";

const production = process.env.NODE_ENV === "production";
const baseURL =
  process.env.BETTER_AUTH_URL ??
  (production ? "https://jules.agenticsonar.com" : "http://localhost:3000");
const apiAudience =
  process.env.HEYJULE_API_URL ??
  (production ? "https://api.jules.agenticsonar.com" : "http://localhost:8787");
const doctorScopes = [
  "care:invite",
  "doctor:key:write",
  "report:data:read",
  "report:read",
].join(" ");

export const auth = betterAuth({
  baseURL,
  database: db,
  trustedOrigins: [baseURL],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 30,
  },
  advanced: {
    useSecureCookies: baseURL.startsWith("https://"),
  },
  plugins: [
    jwt({
      jwks: {
        keyPairConfig: { alg: "ES256" },
        rotationInterval: 60 * 60 * 24 * 30,
        gracePeriod: 60 * 60 * 24 * 30,
      },
      jwt: {
        issuer: baseURL,
        audience: apiAudience,
        expirationTime: "10m",
        definePayload: ({ user }) => ({
          email: user.email,
          role: "doctor",
          scope: doctorScopes,
        }),
      },
    }),
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
