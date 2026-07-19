"use client";

import { doctorExportEnvelopeContext, openJson } from "@heyjule/crypto";
import type { ClinicalReport, EncryptedDoctorExport } from "@heyjule/shared-types";
import { useEffect, useState } from "react";
import { getBrowserDoctorKey } from "@/lib/doctor-key-store";

type DecryptionState =
  | { status: "decrypting" }
  | { status: "error"; message: string }
  | { status: "ready"; report: ClinicalReport };

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

function assertClinicalReport(value: unknown): asserts value is ClinicalReport {
  if (!value || typeof value !== "object") throw new Error("Invalid clinical report");
  const report = value as Partial<ClinicalReport>;
  if (
    report.version !== 1 ||
    typeof report.headline !== "string" ||
    typeof report.summary !== "string" ||
    !report.patient ||
    !Array.isArray(report.findings) ||
    !Array.isArray(report.trends) ||
    !Array.isArray(report.sections) ||
    !Array.isArray(report.sourceEntryIds)
  ) {
    throw new Error("Invalid clinical report");
  }
}

function Evidence({ ids }: { ids: string[] }) {
  if (ids.length === 0) return <span className="evidence-empty">No cited entry</span>;
  return (
    <span className="evidence-list" aria-label="Supporting source entry IDs">
      {ids.map((id) => <code key={id}>{id}</code>)}
    </span>
  );
}

function sourceLabel(source: ClinicalReport["sources"][number]["source"]) {
  return {
    patient_check_in: "Patient check-ins",
    in_app_conversation: "In-app conversations",
    chatgpt_app_mcp: "ChatGPT App MCP",
    apple_health: "Apple Health",
    electronic_patient_record: "ePA/EHR",
    patient_reported_outcome: "PROMs",
  }[source];
}

export function EncryptedReportViewer({ value }: { value: EncryptedDoctorExport }) {
  const [state, setState] = useState<DecryptionState>({ status: "decrypting" });

  useEffect(() => {
    let active = true;
    async function decrypt() {
      try {
        const key = await getBrowserDoctorKey(value.doctorKeyId);
        if (!key) {
          throw new Error(
            "This report targets a doctor key that is not present in this browser. Use the browser that originally registered the key.",
          );
        }
        const report = openJson<unknown>(
          value.envelope,
          key.privateKey,
          doctorExportEnvelopeContext(value.id, value.doctorKeyId),
        );
        assertClinicalReport(report);
        if (active) setState({ status: "ready", report });
      } catch (error) {
        if (active) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : "The encrypted report could not be opened.",
          });
        }
      }
    }
    void decrypt();
    return () => {
      active = false;
    };
  }, [value]);

  if (state.status === "decrypting") {
    return <div className="decrypt-state" role="status">Opening with this browser’s doctor key…</div>;
  }
  if (state.status === "error") {
    return (
      <div className="decrypt-state decrypt-error" role="alert">
        <strong>Report remains encrypted</strong>
        <p>{state.message}</p>
        <p>The server cannot recover the private key or decrypt this export.</p>
      </div>
    );
  }

  const { report } = state;
  function download() {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `heyjule-report-${value.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <article className="clinical-report">
      <div className="report-actions" aria-label="Report actions">
        <button className="button-quiet" onClick={() => window.print()}>Print</button>
        <button className="button-primary" onClick={download}>Save report JSON</button>
      </div>

      <section className="report-hero">
        <div>
          <span className="report-kicker">AI-GENERATED CLINICAL DRAFT</span>
          <h2>{report.headline}</h2>
          <p>{report.summary}</p>
        </div>
        <dl className="report-demographics">
          <div><dt>Patient</dt><dd>{report.patient.name}</dd></div>
          <div><dt>Date of birth</dt><dd>{report.patient.dateOfBirth}</dd></div>
          <div><dt>Review window</dt><dd>{report.period.timeframeDays} days</dd></div>
          <div><dt>Generated</dt><dd>{dateFormat.format(new Date(report.generatedAt))}</dd></div>
        </dl>
      </section>

      <div className="report-warning" role="note">{report.disclaimer}</div>

      <section className="report-section">
        <h2>Clinical attention</h2>
        {report.findings.length === 0 ? <p className="section-note">No specific findings were returned.</p> : (
          <ul className="finding-list">
            {report.findings.map((finding, index) => (
              <li key={`${finding.title}-${index}`} className={`finding finding-${finding.level}`}>
                <div className="finding-heading">
                  <strong>{finding.title}</strong><span>{finding.level}</span>
                </div>
                <p>{finding.detail}</p>
                <Evidence ids={finding.evidenceEntryIds} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="report-section">
        <h2>Trends</h2>
        <div className="trend-grid">
          {report.trends.map((trend, index) => (
            <article key={`${trend.metric}-${index}`} className="trend-card">
              <span className={`trend-direction trend-${trend.direction}`}>{trend.direction}</span>
              <h3>{trend.metric}</h3>
              <p>{trend.detail}</p>
              <Evidence ids={trend.evidenceEntryIds} />
            </article>
          ))}
        </div>
      </section>

      <section className="report-section">
        <h2>Record review</h2>
        <div className="report-sections">
          {report.sections.map((section) => (
            <article key={section.key}>
              <h3>{section.key}</h3>
              <p>{section.summary}</p>
              <Evidence ids={section.evidenceEntryIds} />
            </article>
          ))}
        </div>
      </section>

      <section className="report-section report-provenance">
        <h2>Sources and generation</h2>
        <ul className="source-counts">
          {report.sources.map((source) => (
            <li key={source.source}><span>{sourceLabel(source.source)}</span><strong>{source.count}</strong></li>
          ))}
        </ul>
        <p>
          Generated by {report.generation.provider} model <code>{report.generation.model}</code>. Provider response <code>{report.generation.responseId}</code>.
        </p>
      </section>
    </article>
  );
}
