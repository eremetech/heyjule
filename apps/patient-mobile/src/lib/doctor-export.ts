import { doctorExportEnvelopeContext, sealJson, type RandomBytes } from "@heyjule/crypto";
import type { ClinicalReport, DoctorPublicKey, SealedEnvelope } from "@heyjule/shared-types";

export function sealClinicalReportForDoctor(
  report: ClinicalReport,
  doctorKey: DoctorPublicKey,
  exportId: string,
  randomBytes: RandomBytes,
): SealedEnvelope {
  return sealJson(
    report,
    doctorKey.publicKey,
    doctorExportEnvelopeContext(exportId, doctorKey.id),
    randomBytes,
  );
}
