import Link from "next/link";
import { notFound } from "next/navigation";
import { requireDoctor } from "@/lib/session";
import {
  getLinkedPatient,
  getBrief,
  listSymptoms,
  listWearableDays,
  type WearableDay,
} from "@/lib/db";
import { Sparkline } from "@/components/sparkline";

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const fullDateFmt = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});

function avg(values: (number | null)[]) {
  const present = values.filter((v): v is number => v != null);
  if (present.length === 0) return null;
  return present.reduce((a, b) => a + b, 0) / present.length;
}

function hours(minutes: number) {
  return `${(minutes / 60).toFixed(1)} h`;
}

const SOURCE_LABEL = {
  voice: "voice log",
  message: "message",
  chat_summary: "chat summary",
} as const;

function StatTile({
  label,
  value,
  unit,
  days,
  metric,
  format,
}: {
  label: string;
  value: string | null;
  unit: string;
  days: WearableDay[];
  metric: (d: WearableDay) => number | null;
  format: (v: number) => string;
}) {
  return (
    <div className="stat-tile">
      <span className="stat-label">{label}</span>
      <span className="stat-value">
        {value ?? "—"} <small>{unit}</small>
      </span>
      <Sparkline
        points={days.map(metric)}
        labels={days.map((d) => dateFmt.format(new Date(d.date)))}
        format={format}
      />
    </div>
  );
}

export default async function PatientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const doctor = await requireDoctor();
  const { id } = await params;

  /* Scoped read: resolves only if this doctor holds an active, consented link. */
  const patient = getLinkedPatient(doctor.id, id);
  if (!patient) notFound();

  const brief = getBrief(patient.id);
  const symptoms = listSymptoms(patient.id);
  const days = listWearableDays(patient.id, 14);

  const avgSleep = avg(days.map((d) => d.sleep_minutes));
  const avgHr = avg(days.map((d) => d.resting_hr));
  const avgSteps = avg(days.map((d) => d.steps));
  const avgHrv = avg(days.map((d) => d.hrv_ms));

  return (
    <>
      <Link href="/" className="back-link">
        ← Patients
      </Link>

      <header className="patient-header">
        <h1>{patient.name}</h1>
        <p className="meta">
          Born {fullDateFmt.format(new Date(patient.date_of_birth))} · {patient.sex} ·
          linked {fullDateFmt.format(new Date(patient.claimed_at))}
        </p>
      </header>

      {brief && (
        <section className="section" aria-label="Summary brief">
          <h2 className="brief-headline">{brief.headline}</h2>
          <p className="brief-summary">{brief.summary}</p>
        </section>
      )}

      {days.length > 0 && (
        <section className="section">
          <h2>Last 14 days</h2>
          <div className="stat-grid">
            <StatTile
              label="Sleep"
              value={avgSleep != null ? (avgSleep / 60).toFixed(1) : null}
              unit="h avg"
              days={days}
              metric={(d) => d.sleep_minutes}
              format={hours}
            />
            <StatTile
              label="Resting heart rate"
              value={avgHr != null ? Math.round(avgHr).toString() : null}
              unit="bpm avg"
              days={days}
              metric={(d) => d.resting_hr}
              format={(v) => `${Math.round(v)} bpm`}
            />
            <StatTile
              label="Steps"
              value={
                avgSteps != null
                  ? Math.round(avgSteps).toLocaleString("en-US")
                  : null
              }
              unit="avg"
              days={days}
              metric={(d) => d.steps}
              format={(v) => Math.round(v).toLocaleString("en-US")}
            />
            <StatTile
              label="HRV"
              value={avgHrv != null ? Math.round(avgHrv).toString() : null}
              unit="ms avg"
              days={days}
              metric={(d) => d.hrv_ms}
              format={(v) => `${Math.round(v)} ms`}
            />
          </div>

          <details className="data-table-details">
            <summary>View daily data</summary>
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Sleep</th>
                  <th scope="col">Resting HR</th>
                  <th scope="col">Steps</th>
                  <th scope="col">HRV</th>
                </tr>
              </thead>
              <tbody>
                {[...days].reverse().map((d) => (
                  <tr key={d.date}>
                    <td>{dateFmt.format(new Date(d.date))}</td>
                    <td>{d.sleep_minutes != null ? hours(d.sleep_minutes) : "—"}</td>
                    <td>{d.resting_hr != null ? `${d.resting_hr} bpm` : "—"}</td>
                    <td>{d.steps?.toLocaleString("en-US") ?? "—"}</td>
                    <td>{d.hrv_ms != null ? `${d.hrv_ms} ms` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>
      )}

      <section className="section">
        <h2>Symptom history</h2>
        {symptoms.length === 0 ? (
          <p className="empty">No symptom entries yet.</p>
        ) : (
          <ol className="timeline">
            {symptoms.map((s) => (
              <li key={s.id}>
                <time dateTime={s.occurred_at}>
                  {dateFmt.format(new Date(s.occurred_at))}
                </time>
                <div>
                  <div className="event-title">
                    {s.title}
                    <span className={`severity ${s.severity}`}>{s.severity}</span>
                    <span className="source-tag">{SOURCE_LABEL[s.source]}</span>
                  </div>
                  <p className="event-detail">{s.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
