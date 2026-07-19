import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";

export type Role = "patient" | "doctor" | "service";

export type Principal = {
  sub: string;
  role: Role;
  scopes: ReadonlySet<string>;
};

export type Authenticate = (authorizationHeader: string | undefined) => Promise<Principal | null>;

const devTokenSchema = z.record(
  z.string().min(20),
  z.object({
    sub: z.string().min(1),
    role: z.enum(["patient", "doctor", "service"]),
    scopes: z.array(z.string().min(1)),
  }),
);

function bearerToken(header: string | undefined) {
  const match = header?.match(/^Bearer ([A-Za-z0-9._~-]+)$/u);
  return match?.[1] ?? null;
}

export function createAuthenticator(options: {
  issuer: string;
  audience: string;
  jwksUrl: string;
  additionalIssuers?: Array<{ issuer: string; audience: string; jwksUrl: string }>;
  devTokens?: string;
}): Authenticate {
  const developmentTokens = options.devTokens
    ? devTokenSchema.parse(JSON.parse(options.devTokens) as unknown)
    : null;
  const issuers = [
    { issuer: options.issuer, audience: options.audience, jwks: createRemoteJWKSet(new URL(options.jwksUrl)) },
    ...(options.additionalIssuers ?? []).map((value) => ({
      issuer: value.issuer,
      audience: value.audience,
      jwks: createRemoteJWKSet(new URL(value.jwksUrl)),
    })),
  ];

  return async (authorizationHeader) => {
    const token = bearerToken(authorizationHeader);
    if (!token) return null;

    const devPrincipal = developmentTokens?.[token];
    if (devPrincipal) {
      return {
        sub: devPrincipal.sub,
        role: devPrincipal.role,
        scopes: new Set(devPrincipal.scopes),
      };
    }

    for (const verifier of issuers) {
      try {
        const { payload } = await jwtVerify(token, verifier.jwks, {
          issuer: verifier.issuer,
          audience: verifier.audience,
          algorithms: ["ES256", "RS256", "PS256", "EdDSA"],
        });
        if (!payload.sub) return null;
        const role = payload.heyjule_role ?? payload.role;
        if (role !== "patient" && role !== "doctor" && role !== "service") return null;
        const scopeClaim = typeof payload.scope === "string" ? payload.scope.split(/\s+/u) : [];
        return { sub: payload.sub, role, scopes: new Set(scopeClaim.filter(Boolean)) };
      } catch {
        // Try the next explicitly configured issuer. Never accept an unlisted issuer.
      }
    }
    return null;
  };
}

export function hasAccess(
  principal: Principal | null,
  role: Role,
  scope: string,
): principal is Principal {
  return principal?.role === role && principal.scopes.has(scope);
}
