import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/* Optimistic redirect only — real session validation happens server-side in
 * requireDoctor(). A forged cookie gets past this, then fails there. */
export function middleware(request: NextRequest) {
  const cookie = getSessionCookie(request);
  if (!cookie) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/patients/:path*"],
};
