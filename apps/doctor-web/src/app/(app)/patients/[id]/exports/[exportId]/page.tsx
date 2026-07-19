import Link from "next/link";
import { notFound } from "next/navigation";
import { EncryptedReportViewer } from "@/components/encrypted-report-viewer";
import { HeyJuleApiError, heyJuleApi } from "@/lib/heyjule-api";
import { requireDoctor } from "@/lib/session";

export default async function ExportPage({
  params,
}: {
  params: Promise<{ id: string; exportId: string }>;
}) {
  await requireDoctor();
  const { id, exportId } = await params;
  let value: Awaited<ReturnType<typeof heyJuleApi.getEncryptedExport>>;
  try {
    value = await heyJuleApi.getEncryptedExport(exportId);
  } catch (error) {
    if (error instanceof HeyJuleApiError && error.status === 404) notFound();
    throw error;
  }
  if (value.patientId !== id) notFound();

  return (
    <>
      <Link href={`/patients/${id}`} className="back-link">← Patient timeline</Link>
      <header className="patient-header report-header">
        <span className="demo-badge">Encrypted · doctor only</span>
        <h1>Clinical report</h1>
        <p className="meta">The HeyJule server delivered ciphertext. Decryption happens locally below.</p>
      </header>
      <EncryptedReportViewer value={value} />
    </>
  );
}
