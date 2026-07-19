import Link from "next/link";
import {
  getPatientById,
  getBrief,
  listSymptoms,
  listWearableDays,
  listPromScores,
  listTreatments,
  type ReportLink,
  type WearableDay,
} from "@/lib/db";
import { computeFlags } from "@/lib/insights";
import { ReportChatBar, type ReportChatSuggestion } from "./report-chat-bar";
import { Sparkline } from "./sparkline";

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const monthFmt = new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit" });
const fullDateFmt = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});

const SOURCE_LABEL = {
  voice: "voice log",
  message: "message",
  chat_summary: "chat summary",
} as const;

function age(dateOfBirth: string) {
  const dob = new Date(dateOfBirth);
  const now = new Date();
  let years = now.getFullYear() - dob.getFullYear();
  const beforeBirthday =
    now.getMonth() < dob.getMonth() ||
    (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate());
  if (beforeBirthday) years--;
  return years;
}

function avg(values: (number | null)[]) {
  const present = values.filter((v): v is number => v != null);
  if (present.length === 0) return null;
  return present.reduce((a, b) => a + b, 0) / present.length;
}

function stddev(values: number[]) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(
    values.reduce((a, v) => a + (v - mean) ** 2, 0) / (values.length - 1)
  );
}

function StatTile({
  label,
  value,
  unit,
  sub,
  days,
  metric,
  format,
}: {
  label: string;
  value: string | null;
  unit: string;
  sub?: string;
  days?: WearableDay[];
  metric?: (d: WearableDay) => number | null;
  format?: (v: number) => string;
}) {
  return (
    <div className="stat-tile">
      <span className="stat-label">{label}</span>
      <span className="stat-value">
        {value ?? "—"} <small>{unit}</small>
      </span>
      {sub && <span className="stat-sub">{sub}</span>}
      {days && metric && format && (
        <Sparkline
          points={days.map(metric)}
          labels={days.map((d) => dateFmt.format(new Date(d.date)))}
          format={format}
        />
      )}
    </div>
  );
}

export function PatientReport({ link }: { link: ReportLink }) {
  const patient = getPatientById(link.patient_id)!;
  const brief = getBrief(patient.id);
  const symptoms = listSymptoms(patient.id);
  const days = listWearableDays(patient.id, 14);
  const treatments = listTreatments(patient.id);
  const promRows = listPromScores(patient.id);

  /* Group PROM scores instrument → item → chronological history. Instruments
   * are data-driven: a patient may have MRS, ISI, both, or none. */
  const instruments = new Map<
    string,
    Map<string, { date: string; score: number; max: number }[]>
  >();
  for (const row of promRows) {
    const items = instruments.get(row.instrument) ?? new Map();
    const list = items.get(row.item) ?? [];
    list.push({ date: row.recorded_at, score: row.score, max: row.max_score });
    items.set(row.item, list);
    instruments.set(row.instrument, items);
  }
  /* Primary instrument (most items) first. */
  const promSections = [...instruments.entries()]
    .sort((a, b) => b[1].size - a[1].size)
    .map(([instrument, items]) => {
    const rows = [...items.entries()]
      .map(([item, history]) => {
        const baseline = history[0];
        const current = history[history.length - 1];
        return { item, history, baseline, current, delta: current.score - baseline.score };
      })
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    return {
      instrument,
      rows,
      baselineDate: rows[0]?.baseline.date,
      currentDate: rows[0]?.current.date,
      totalBaseline: rows.reduce((a, p) => a + p.baseline.score, 0),
      totalCurrent: rows.reduce((a, p) => a + p.current.score, 0),
      biggestChanges: rows.filter((p) => p.delta !== 0).slice(0, 4),
    };
  });

  const flags = computeFlags(
    days,
    symptoms,
    promSections.flatMap((s) =>
      s.rows.map((p) => ({
        instrument: s.instrument,
        item: p.item,
        baseline: p.baseline.score,
        current: p.current.score,
        delta: p.delta,
      }))
    )
  );

  const sleepValues = days
    .map((d) => d.sleep_minutes)
    .filter((v): v is number => v != null);
  const avgSleep = avg(days.map((d) => d.sleep_minutes));
  const sleepSpread = Math.round(stddev(sleepValues));
  const avgHr = avg(days.map((d) => d.resting_hr));
  const avgHrv = avg(days.map((d) => d.hrv_ms));
  const avgSteps = avg(days.map((d) => d.steps));

  const promHref = (instrument: string, item: string) =>
    `/r/${link.token}/prom/${encodeURIComponent(`${instrument}~${item}`)}`;
  const wearablesHref = `/r/${link.token}/wearables`;
  const chatSuggestions: ReportChatSuggestion[] = [
    "What changed most?",
    ...(flags.length > 0 ? ["Any noteworthy signals?"] : []),
    ...(treatments.length > 0 ? ["How did treatments compare?"] : []),
    ...(avgSleep != null ? ["Could sleep relate to symptoms?"] : []),
  ];

  return (
    <>
      <header className="topbar">
        <div className="brand">
          HeyJule <span>· patient report</span>
        </div>
        <span className="topbar-note">
          Access ends when you close this tab · link expires{" "}
          {fullDateFmt.format(new Date(link.expires_at.replace(" ", "T") + "Z"))}
        </span>
      </header>

      <main className="page report-page">
        <header className="patient-header">
          <h1>{patient.name}</h1>
          <p className="meta">
            {age(patient.date_of_birth)} · {patient.sex}
          </p>
          <p className="meta">
            {link.reason} · data from the last {link.timeframe_days} days
          </p>
        </header>

        {flags.length > 0 && (
          <section className="section" aria-label="Noteworthy signals">
            <ul className="flag-list">
              {flags.map((f) => (
                <li key={f.title} className={`flag ${f.level}`}>
                  <span className="flag-level">{f.level}</span>
                  <div>
                    <span className="flag-title">{f.title}</span>
                    <p className="flag-detail">{f.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {brief && (
          <section className="section" aria-label="Summary brief">
            <details className="summary-details">
              <summary>
                <h2 className="brief-headline">{brief.headline}</h2>
                <span className="summary-toggle">Read full summary</span>
              </summary>
              <p className="brief-summary">{brief.summary}</p>
            </details>
          </section>
        )}

        {promSections.map((sec) => (
          <section className="section" key={sec.instrument}>
            <h2>
              PROMs <span className="h-note">{sec.instrument}</span>
            </h2>
            <table className="prom-table">
              <thead>
                <tr>
                  <th scope="col"></th>
                  <th scope="col">
                    Baseline
                    {sec.baselineDate && (
                      <small>{monthFmt.format(new Date(sec.baselineDate))}</small>
                    )}
                  </th>
                  <th scope="col">
                    Current
                    {sec.currentDate && (
                      <small>{monthFmt.format(new Date(sec.currentDate))}</small>
                    )}
                  </th>
                  <th scope="col">History</th>
                </tr>
              </thead>
              <tbody>
                {sec.rows.map((p) => (
                  <tr key={p.item}>
                    <th scope="row">{p.item}</th>
                    <td>{p.baseline.score}</td>
                    <td>
                      {p.current.score}
                      {p.delta !== 0 && (
                        <span className={`delta ${p.delta < 0 ? "improved" : "worsened"}`}>
                          {p.delta < 0 ? "↓" : "↑"}
                          {Math.abs(p.delta)}
                        </span>
                      )}
                    </td>
                    <td className="prom-history">
                      <Link
                        href={promHref(sec.instrument, p.item)}
                        aria-label={`Open full history for ${p.item}`}
                      >
                        <Sparkline
                          points={p.history.map((h) => h.score)}
                          labels={p.history.map((h) => monthFmt.format(new Date(h.date)))}
                          format={(v) => `${v}/${p.current.max}`}
                          fixedRange={[0, p.current.max]}
                        />
                      </Link>
                    </td>
                  </tr>
                ))}
                {sec.rows.length > 1 && (
                  <tr className="prom-total">
                    <th scope="row">Total</th>
                    <td>{sec.totalBaseline}</td>
                    <td>
                      {sec.totalCurrent}
                      {sec.totalCurrent !== sec.totalBaseline && (
                        <span
                          className={`delta ${
                            sec.totalCurrent < sec.totalBaseline ? "improved" : "worsened"
                          }`}
                        >
                          {sec.totalCurrent < sec.totalBaseline ? "↓" : "↑"}
                          {Math.abs(sec.totalCurrent - sec.totalBaseline)}
                        </span>
                      )}
                    </td>
                    <td></td>
                  </tr>
                )}
              </tbody>
            </table>

            {sec.rows.length > 1 && sec.biggestChanges.length > 0 && (
              <div className="chips" aria-label="Biggest changes">
                {sec.biggestChanges.map((p) => (
                  <Link
                    key={p.item}
                    href={promHref(sec.instrument, p.item)}
                    className={`chip ${p.delta < 0 ? "improved" : "worsened"}`}
                  >
                    {p.item} {p.baseline.score} → {p.current.score}
                  </Link>
                ))}
              </div>
            )}
          </section>
        ))}

        {treatments.length > 0 && (
          <section className="section">
            <h2>
              Past treatments{" "}
              <span className="h-note">imported from {treatments[0].source}</span>
            </h2>
            <ul className="treatment-list">
              {treatments.map((t) => (
                <li key={t.id}>
                  <div>
                    <span className="treatment-name">{t.name}</span>
                    <span className="treatment-period">
                      {monthFmt.format(new Date(t.started_at))} –{" "}
                      {t.ended_at ? monthFmt.format(new Date(t.ended_at)) : "ongoing"}
                    </span>
                  </div>
                  <p className="treatment-outcome">{t.outcome}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {days.length > 0 && (
          <section className="section">
            <h2>
              Wearable data <span className="h-note">last 14 days · Apple Health</span>
            </h2>
            <h3 className="subhead">Sleep</h3>
            <div className="stat-grid">
              <Link href={wearablesHref} className="stat-link">
                <StatTile
                  label="Duration"
                  value={avgSleep != null ? (avgSleep / 60).toFixed(1) : null}
                  unit="h avg"
                  days={days}
                  metric={(d) => d.sleep_minutes}
                  format={(v) => `${(v / 60).toFixed(1)} h`}
                />
              </Link>
              <Link href={wearablesHref} className="stat-link">
                <StatTile
                  label="Consistency"
                  value={sleepValues.length > 1 ? `±${sleepSpread}` : null}
                  unit="min"
                  sub="night-to-night variation"
                />
              </Link>
            </div>
            <h3 className="subhead">Heart &amp; activity</h3>
            <div className="stat-grid">
              <Link href={wearablesHref} className="stat-link">
                <StatTile
                  label="Resting heart rate"
                  value={avgHr != null ? Math.round(avgHr).toString() : null}
                  unit="bpm avg"
                  days={days}
                  metric={(d) => d.resting_hr}
                  format={(v) => `${Math.round(v)} bpm`}
                />
              </Link>
              <Link href={wearablesHref} className="stat-link">
                <StatTile
                  label="HRV"
                  value={avgHrv != null ? Math.round(avgHrv).toString() : null}
                  unit="ms avg"
                  days={days}
                  metric={(d) => d.hrv_ms}
                  format={(v) => `${Math.round(v)} ms`}
                />
              </Link>
              <Link href={wearablesHref} className="stat-link">
                <StatTile
                  label="Steps"
                  value={avgSteps != null ? Math.round(avgSteps).toLocaleString("en-US") : null}
                  unit="avg"
                  days={days}
                  metric={(d) => d.steps}
                  format={(v) => Math.round(v).toLocaleString("en-US")}
                />
              </Link>
            </div>
            <p className="detail-cta">
              <Link href={wearablesHref}>Open detailed wearable view →</Link>
            </p>
          </section>
        )}

        <section className="section">
          <h2>Symptom history</h2>
          {symptoms.length === 0 ? (
            <p className="empty">No symptom entries in this timeframe.</p>
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
      </main>
      <ReportChatBar
        patientName={patient.name}
        reportToken={link.token}
        suggestions={chatSuggestions}
      />
    </>
  );
}
