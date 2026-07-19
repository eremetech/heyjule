import { NextRequest, NextResponse } from "next/server";
import { getQrChannel, approveQrChannel, consumeQrChannel } from "@/lib/db";
import { issueViewerSession, VIEWER_COOKIE } from "@/lib/report-auth";

type Params = { params: Promise<{ channel: string }> };

/* Polled by the desktop QR page. On first poll after phone approval, the
 * channel is consumed (single use) and the viewer-session cookie is set. */
export async function GET(request: NextRequest, { params }: Params) {
  const { channel } = await params;
  const row = getQrChannel(channel);
  if (!row) return NextResponse.json({ status: "expired" });
  if (row.status !== "approved") return NextResponse.json({ status: row.status });

  if (!consumeQrChannel(channel)) return NextResponse.json({ status: "expired" });

  const token = issueViewerSession(row.report_link_id);
  const res = NextResponse.json({ status: "approved" });
  res.cookies.set(VIEWER_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
    /* No maxAge: a session cookie that expires when the tab/browser closes. */
  });
  return res;
}

/* Called from the phone-side approval page. In production this endpoint is
 * only reachable from the authenticated HeyJule doctor app (or replaced by a
 * passkey ceremony) — here it simulates that step for the mock. */
export async function POST(_request: NextRequest, { params }: Params) {
  const { channel } = await params;
  const ok = approveQrChannel(channel);
  return NextResponse.json({ ok }, { status: ok ? 200 : 410 });
}
