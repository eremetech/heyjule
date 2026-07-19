import Link from "next/link";
import { requireReportSession } from "@/lib/report-guard";
import {
  getPatientById,
  listSymptoms,
  listTreatments,
  listWearableDays,
} from "@/lib/db";
import { TimeSeriesChart, type ChartEvent, type ChartMarker } from "@/components/time-series-chart";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export default async function WearableDetailPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const link = await requireReportSession(token);
  const patient = getPatientById(link.patient_id)!;
  const days = listWearableDays(patient.id, link.timeframe_days);

  const events: ChartEvent[] = listSymptoms(patient.id).map((s) => ({
    date: s.occurred_at.slice(0, 10),
    title: s.title,
    severity: s.severity,
    note: s.detail,
  }));
  const markers: ChartMarker[] = listTreatments(patient.id).map((t) => ({
    date: t.started_at,
    label: `Started: ${t.name}`,
  }));

  const charts = [
    { key: "sleep", title: "Sleep duration", unit: "h", decimals: 1, scale: 1 / 60, metric: (d: (typeof days)[number]) => d.sleep_minutes },
    { key: "hr", title: "Resting heart rate", unit: "bpm", decimals: 0, scale: 1, metric: (d: (typeof days)[number]) => d.resting_hr },
    { key: "hrv", title: "HRV", unit: "ms", decimals: 0, scale: 1, metric: (d: (typeof days)[number]) => d.hrv_ms },
    { key: "steps", title: "Steps", unit: "", decimals: 0, scale: 1, metric: (d: (typeof days)[number]) => d.steps },
  ];

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
          <h1>Wearable data</h1>
          <p className="meta">
            {patient.name} · last {link.timeframe_days} days · synced from Apple
            Health, updated daily
          </p>
          <p className="meta chart-legend">
            Dots below each chart are logged symptoms (hover for the entry);
            dashed lines mark treatment starts.
          </p>
        </header>

        {charts.map((c) => (
          <section className="section" key={c.key}>
            <h2>{c.title}</h2>
            <TimeSeriesChart
              points={days.map((d) => ({ date: d.date, value: c.metric(d) }))}
              events={events}
              markers={markers}
              unit={c.unit}
              decimals={c.decimals}
              scale={c.scale}
              label={`${c.title} over the last ${link.timeframe_days} days`}
            />
          </section>
        ))}

        <section className="section">
          <details className="data-table-details">
            <summary>View daily data as a table</summary>
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Sleep</th>
                  <th scope="col">Resting HR</th>
                  <th scope="col">HRV</th>
                  <th scope="col">Steps</th>
                </tr>
              </thead>
              <tbody>
                {[...days].reverse().map((d) => (
                  <tr key={d.date}>
                    <td>{dateFmt.format(new Date(d.date))}</td>
                    <td>{d.sleep_minutes != null ? `${(d.sleep_minutes / 60).toFixed(1)} h` : "—"}</td>
                    <td>{d.resting_hr != null ? `${d.resting_hr} bpm` : "—"}</td>
                    <td>{d.hrv_ms != null ? `${d.hrv_ms} ms` : "—"}</td>
                    <td>{d.steps?.toLocaleString("en-US") ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>
      </main>
    </>
  );
}
