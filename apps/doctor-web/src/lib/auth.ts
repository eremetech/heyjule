import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { bearer, emailOTP, jwt, magicLink } from "better-auth/plugins";
import { db } from "./db.ts";
import { sendMagicLinkEmail, sendOtpEmail } from "./magic-mail.ts";

const production = process.env.NODE_ENV === "production";
const baseURL =
  process.env.BETTER_AUTH_URL ??
  (production ? "https://jules.agenticsonar.com" : "http://localhost:3000");
const apiAudience =
  process.env.HEYJULE_API_URL ??
  (production ? "https://api.jules.agenticsonar.com" : "http://localhost:8787");
// The patient app served as a web build; it calls the magic-link and token
// endpoints cross-origin, so Better Auth must trust it.
const patientWebOrigin =
  process.env.HEYJULE_PATIENT_WEB_ORIGIN ??
  (production ? "https://app.jules.agenticsonar.com" : "http://localhost:8081");
const doctorScopes = [
  "care:invite",
  "doctor:key:write",
  "report:data:read",
  "report:read",
].join(" ");
const patientScopes = [
  "device:write",
  "entry:claim",
  "patient:data:write",
  "patient:data:read",
  "patient:profile:write",
  "care:link",
  "report:write",
].join(" ");

export const auth = betterAuth({
  baseURL,
  database: db,
  trustedOrigins: [baseURL, patientWebOrigin, "heyjule://"],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
  },
  user: {
    additionalFields: {
      role: { type: "string", defaultValue: "doctor", input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user, ctx) => {
          // Doctors register through the web sign-up form; the only paths that
          // create users outside it are the patient magic-link and email-code
          // flows, which must never mint doctor-role accounts.
          if (ctx?.path?.includes("magic-link") || ctx?.path?.includes("email-otp")) {
            return { data: { ...user, role: "patient" } };
          }
          return { data: user };
        },
      },
    },
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
        definePayload: ({ user }) => {
          const role = (user as { role?: string }).role === "patient" ? "patient" : "doctor";
          return {
            email: user.email,
            name: user.name,
            role,
            scope: role === "patient" ? patientScopes : doctorScopes,
          };
        },
      },
    }),
    magicLink({
      expiresIn: 60 * 5,
      sendMagicLink: async ({ email, token }) => {
        // The emailed link is an https page (mail clients strip custom schemes)
        // that forwards the untouched token into the app via heyjule://.
        await sendMagicLinkEmail(email, `${baseURL}/patient/verify?token=${encodeURIComponent(token)}`);
      },
    }),
    emailOTP({
      otpLength: 6,
      expiresIn: 60 * 5,
      sendVerificationOTP: async ({ email, otp }) => {
        // The link-free path: patients type this code straight into the app,
        // which the web build needs since heyjule:// deep links can't reach it.
        await sendOtpEmail(email, otp);
      },
    }),
    bearer(),
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
