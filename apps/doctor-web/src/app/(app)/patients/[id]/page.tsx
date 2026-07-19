import Link from "next/link";
import { notFound } from "next/navigation";
import type { PatientEntry } from "@heyjule/shared-types";
import { requireDoctor } from "@/lib/session";
import { HeyJuleApiError, heyJuleApi } from "@/lib/heyjule-api";

const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

function entryView(entry: PatientEntry) {
  if (entry.kind === "chat_summary") {
    return {
      title: entry.payload.title,
      detail: entry.payload.summary,
      source: entry.source === "chatgpt_app_mcp" ? "ChatGPT App MCP" : "In-app conversation",
    };
  }
  if (entry.kind === "check_in") {
    const symptoms = entry.payload.symptoms.join(", ");
    return {
      title: symptoms || "Check-in",
      detail: entry.payload.note,
      source: entry.source === "in_app_conversation" ? "In-app conversation" : "Patient check-in",
    };
  }
  if (entry.kind === "wearable") {
    return {
      title: `Sleep ${Math.round(entry.payload.sleepMinutes / 6) / 10}h · resting HR ${entry.payload.restingHeartRate}`,
      detail: `${entry.payload.steps.toLocaleString()} steps · HRV ${entry.payload.hrvMs} ms`,
      source: "Apple Health",
    };
  }
  if (entry.kind === "prom") {
    return {
      title: `${entry.payload.instrument} · ${entry.payload.item}`,
      detail: `Score ${entry.payload.score} of ${entry.payload.maxScore}${entry.payload.note ? ` · ${entry.payload.note}` : ""}`,
      source: "Patient-reported outcome",
    };
  }
  if (entry.kind === "treatment") {
    return {
      title: entry.payload.name,
      detail: entry.payload.outcome ?? "No outcome recorded.",
      source: "Imported ePA/EHR record",
    };
  }
  throw new Error("Unsupported patient entry kind");
}

export default async function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  await requireDoctor();
  const { id } = await params;
  let result: Awaited<ReturnType<typeof heyJuleApi.getPatientTimeline>>;
  let exports: Awaited<ReturnType<typeof heyJuleApi.listPatientExports>>;
  try {
    [result, exports] = await Promise.all([
      heyJuleApi.getPatientTimeline(id),
      heyJuleApi.listPatientExports(id),
    ]);
  } catch (error) {
    if (error instanceof HeyJuleApiError && error.status === 404) notFound();
    throw error;
  }

  const { patient, entries } = result;
  return (
    <>
      <Link href="/" className="back-link">← Patients</Link>
      <header className="patient-header">
        <h1>{patient.profile?.name ?? "Patient"}</h1>
        <p className="meta">
          {patient.profile
            ? `Born ${patient.profile.dateOfBirth} · ${patient.profile.sex}`
            : `Profile not supplied · ${patient.id}`}
        </p>
      </header>
      <section className="section">
        <div className="section-heading-row">
          <div>
            <h2>Encrypted AI reports</h2>
            <p className="section-note">Ciphertext is opened only in this browser with its local doctor key.</p>
          </div>
          <span className="demo-badge">AI draft · verify</span>
        </div>
        {exports.length === 0 ? (
          <p className="empty">
            No encrypted report yet. Keep this portal open once so its encryption key is ready, then ask the patient to create a report in the HeyJule app.
          </p>
        ) : (
          <ul className="export-list">
            {exports.map((value) => (
              <li key={value.id}>
                <Link href={`/patients/${id}/exports/${value.id}`} className="export-row">
                  <div>
                    <strong>Encrypted clinical draft</strong>
                    <span>Created {dateFmt.format(new Date(value.createdAt))}</span>
                  </div>
                  <div className="export-meta">
                    Expires {dateFmt.format(new Date(value.expiresAt))}<span aria-hidden="true">→</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="section">
        <h2>Health timeline</h2>
        {entries.length === 0 ? (
          <p className="empty">No synchronized entries yet.</p>
        ) : (
          <ol className="timeline">
            {entries.map((entry) => {
              const view = entryView(entry);
              return (
                <li key={entry.id}>
                  <time dateTime={entry.occurredAt}>{dateFmt.format(new Date(entry.occurredAt))}</time>
                  <div>
                    <div className="event-title">
                      {view.title}<span className="source-tag">{view.source}</span>
                    </div>
                    <p className="event-detail">{view.detail}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </>
  );
}
