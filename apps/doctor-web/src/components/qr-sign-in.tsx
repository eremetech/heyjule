"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/* Polls the handshake channel; the phone-side approval flips it, the poll
 * response sets the viewer-session cookie, and a refresh renders the report. */
export function QrSignIn({
  channel,
  qrDataUrl,
  patientName,
}: {
  channel: string;
  qrDataUrl: string;
  patientName: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"pending" | "approved" | "expired">("pending");

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/report-auth/${channel}`, { cache: "no-store" });
        const body = (await res.json()) as { status: string };
        if (stopped) return;
        if (body.status === "approved") {
          setStatus("approved");
          router.refresh();
          return;
        }
        if (body.status === "expired") {
          setStatus("expired");
          return;
        }
      } catch {
        /* transient network error — keep polling */
      }
      timer = window.setTimeout(tick, 1500);
    };
    let timer = window.setTimeout(tick, 1500);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [channel, router]);

  return (
    <div className="qr-card">
      <h1>Sign in to view {patientName}&rsquo;s data</h1>
      <div className="qr-frame" aria-hidden={status !== "pending"}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrDataUrl} alt="Sign-in QR code" width={220} height={220} />
      </div>
      {status === "pending" && (
        <p className="qr-hint">
          Scan with the HeyJule app on your phone.
          <br />
          This tab signs in automatically — no password, and access ends when
          you close it.
        </p>
      )}
      {status === "approved" && <p className="qr-hint">Approved — opening the report…</p>}
      {status === "expired" && (
        <p className="qr-hint">
          This code expired.{" "}
          <button className="qr-reload" onClick={() => router.refresh()}>
            Get a new one
          </button>
        </p>
      )}
    </div>
  );
}
