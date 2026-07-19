"use client";

import { useState } from "react";

export function ApproveCard({
  channel,
  doctorName,
  patientName,
  alreadyApproved,
}: {
  channel: string;
  doctorName: string;
  patientName: string;
  alreadyApproved: boolean;
}) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "failed">(
    alreadyApproved ? "done" : "idle"
  );

  async function approve() {
    setState("busy");
    const res = await fetch(`/api/report-auth/${channel}`, { method: "POST" });
    setState(res.ok ? "done" : "failed");
  }

  return (
    <div className="auth-card approve-card">
      <div>
        <h1>Approve sign-in?</h1>
        <p className="auth-alt">
          {doctorName} is opening <strong>{patientName}</strong>&rsquo;s report on a
          nearby computer.
        </p>
      </div>
      {state === "done" ? (
        <p className="approve-done">✓ Approved — return to your computer.</p>
      ) : state === "failed" ? (
        <p className="auth-error" role="alert">
          This code is no longer valid. Ask for a fresh QR code and try again.
        </p>
      ) : (
        <button
          className="button-primary"
          onClick={approve}
          disabled={state === "busy"}
        >
          {state === "busy" ? "Approving…" : "Approve"}
        </button>
      )}
      <p className="auth-alt">
        Demo note: in production this step runs inside the HeyJule app on your
        phone (or as a passkey prompt) and requires Face ID / fingerprint.
      </p>
    </div>
  );
}
