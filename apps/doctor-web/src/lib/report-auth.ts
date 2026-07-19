import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getViewerSession, createViewerSession, type ReportLink } from "./db.ts";

/* Viewer sessions are deliberately separate from the Better Auth doctor portal:
 * the doctor holds no web credential. Access = expiring report link (the
 * capability) + phone approval (the identity). The cookie has no Max-Age, so it
 * expires when the browser closes; the row below caps the server-side TTL. */

export const VIEWER_COOKIE = "heyjule_view";
export const VIEWER_TTL_SECONDS = 30 * 60;
export const CHANNEL_TTL_SECONDS = 3 * 60;

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function issueViewerSession(reportLinkId: string) {
  const token = randomBytes(32).toString("base64url");
  createViewerSession(hashToken(token), reportLinkId, VIEWER_TTL_SECONDS);
  return token;
}

/* True when the request carries a live viewer session for THIS report link. */
export async function hasViewerSession(link: ReportLink) {
  const token = (await cookies()).get(VIEWER_COOKIE)?.value;
  if (!token) return false;
  const session = getViewerSession(hashToken(token));
  return session?.report_link_id === link.id;
}
