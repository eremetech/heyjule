import { notFound } from "next/navigation";
import { getQrChannel, getReportLinkById, getPatientById } from "@/lib/db";
import { ApproveCard } from "@/components/approve-card";

/* Phone-side approval. In production this screen lives inside the
 * authenticated HeyJule doctor app (or is replaced by a passkey prompt);
 * this page simulates it for the mock. */
export default async function ApprovePage({
  params,
}: {
  params: Promise<{ channel: string }>;
}) {
  const { channel } = await params;
  const row = getQrChannel(channel);
  if (!row) notFound();
  const link = getReportLinkById(row.report_link_id);
  if (!link) notFound();
  const patient = getPatientById(link.patient_id);
  if (!patient) notFound();

  return (
    <main className="auth-shell">
      <ApproveCard
        channel={channel}
        doctorName={link.doctor_name}
        patientName={patient.name}
        alreadyApproved={row.status !== "pending"}
      />
    </main>
  );
}
