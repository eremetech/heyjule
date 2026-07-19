import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { db } from "./db.ts";

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

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
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
