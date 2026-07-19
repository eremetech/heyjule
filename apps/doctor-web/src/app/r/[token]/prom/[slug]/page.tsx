import Link from "next/link";
import { notFound } from "next/navigation";
import { requireReportSession } from "@/lib/report-guard";
import {
  getPatientById,
  listPromScores,
  listSymptoms,
  listTreatments,
} from "@/lib/db";
import { TimeSeriesChart, type ChartEvent, type ChartMarker } from "@/components/time-series-chart";

export const dynamic = "force-dynamic";

const monthFmt = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });

export default async function PromDetailPage({
  params,
}: {
  params: Promise<{ token: string; slug: string }>;
}) {
  const { token, slug } = await params;
  const link = await requireReportSession(token);
  const patient = getPatientById(link.patient_id)!;

  const [instrument, item] = decodeURIComponent(slug).split("~");
  const history = listPromScores(patient.id).filter(
    (p) => p.instrument === instrument && p.item === item
  );
  if (history.length === 0) notFound();
  const max = history[0].max_score;

  /* Patient notes on entries join the symptom log on the event rail. */
  const events: ChartEvent[] = [
    ...history
      .filter((p) => p.note)
      .map((p) => ({ date: p.recorded_at, title: "Patient note", note: p.note })),
    ...listSymptoms(patient.id).map((s) => ({
      date: s.occurred_at.slice(0, 10),
      title: s.title,
      severity: s.severity,
      note: s.detail,
    })),
  ];
  const markers: ChartMarker[] = listTreatments(patient.id).map((t) => ({
    date: t.started_at,
    label: `Started: ${t.name}`,
  }));

  return (
    <>
      <header className="topbar">
        <div className="brand">
          HeyJule <span>· patient report</span>
        </div>
        <span className="topbar-note">Access ends when you close this tab</span>
      </header>
      <main className="page page-wide">
        <Link href={`/r/${token}`} className="back-link">
          ← {patient.name}&rsquo;s report
        </Link>
        <header className="patient-header">
          <h1>
            {item} <span className="h-note">{instrument}</span>
          </h1>
          <p className="meta">
            {patient.name} · scored 0–{max}, lower is better · patient-reported
          </p>
          <p className="meta chart-legend">
            Dots below the chart are logged symptoms and patient notes (hover
            for the entry); dashed lines mark treatment starts.
          </p>
        </header>

        <section className="section">
          <TimeSeriesChart
            points={history.map((p) => ({ date: p.recorded_at, value: p.score }))}
            events={events}
            markers={markers}
            unit={`/ ${max}`}
            decimals={0}
            yMin={0}
            yMax={max}
            label={`${item} (${instrument}) score history`}
          />
        </section>

        <section className="section">
          <h2>Entries</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Recorded</th>
                <th scope="col">Score</th>
                <th scope="col">Note from the patient</th>
              </tr>
            </thead>
            <tbody>
              {[...history].reverse().map((p) => (
                <tr key={p.recorded_at}>
                  <td>{monthFmt.format(new Date(p.recorded_at))}</td>
                  <td>
                    {p.score} / {p.max_score}
                  </td>
                  <td>{p.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </>
  );
}
