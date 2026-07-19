import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { getReportLink, createQrChannel } from "@/lib/db";
import { hasViewerSession, CHANNEL_TTL_SECONDS } from "@/lib/report-auth";
import { QrSignIn } from "@/components/qr-sign-in";
import { PatientReport } from "@/components/patient-report";
import { getPatientById } from "@/lib/db";

export const dynamic = "force-dynamic";

/* Entry point for the expiring link embedded in the EPR PDF.
 * No session → QR gate. Live viewer session for this link → the report. */
export default async function ReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const link = getReportLink(token);

  if (!link) {
    return (
      <main className="auth-shell">
        <div className="auth-card">
          <h1>Link expired</h1>
          <p className="auth-alt">
            This report link is no longer valid. Request a fresh one from the
            patient&rsquo;s record, or ask the patient to share again.
          </p>
        </div>
      </main>
    );
  }

  if (await hasViewerSession(link)) {
    return <PatientReport link={link} />;
  }

  const patient = getPatientById(link.patient_id)!;
  const channel = randomUUID();
  createQrChannel(channel, link.id, CHANNEL_TTL_SECONDS);

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host") ?? "localhost:3000";
  const approveUrl = `${proto}://${host}/approve/${channel}`;
  const qrDataUrl = await QRCode.toDataURL(approveUrl, {
    margin: 1,
    width: 440,
    color: { dark: "#0b0b0bff", light: "#ffffff00" },
  });

  return (
    <main className="auth-shell">
      <QrSignIn
        channel={channel}
        qrDataUrl={qrDataUrl}
        patientName={patient.name}
        mockApproveUrl={process.env.NODE_ENV === "development" ? approveUrl : undefined}
      />
    </main>
  );
}
