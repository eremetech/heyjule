import { NextResponse, type NextRequest } from "next/server";

const production = process.env.NODE_ENV === "production";
/* The patient app's web build signs in against this Better Auth instance from
 * its own origin; Better Auth trusts it (auth.ts), but the browser also needs
 * CORS headers, including on the OPTIONS preflight the route handler never sees. */
const allowedOrigins = new Set([
  process.env.HEYJULE_PATIENT_WEB_ORIGIN ??
    (production ? "https://app.jules.agenticsonar.com" : "http://localhost:8081"),
]);

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

export function middleware(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || !allowedOrigins.has(origin)) return NextResponse.next();

  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
  }
  const response = NextResponse.next();
  for (const [name, value] of Object.entries(corsHeaders(origin))) {
    response.headers.set(name, value);
  }
  return response;
}

export const config = { matcher: "/api/auth/:path*" };
