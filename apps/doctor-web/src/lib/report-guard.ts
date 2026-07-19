import { redirect } from "next/navigation";
import { getReportLink } from "./db.ts";
import { hasViewerSession } from "./report-auth.ts";

/* Detail pages under /r/[token]/… require the same viewer session as the
 * report itself; anything missing bounces back to the gate (or expiry page). */
export async function requireReportSession(token: string) {
  const link = getReportLink(token);
  if (!link || !(await hasViewerSession(link))) redirect(`/r/${token}`);
  return link;
}
