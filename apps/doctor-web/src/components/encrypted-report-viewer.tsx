"use client";

import { doctorExportEnvelopeContext, openJson } from "@heyjule/crypto";
import type {
  ClinicalReport,
  EncryptedDoctorExport,
  PatientEntry,
  PromEntry,
  TreatmentEntry,
  WearableEntry,
} from "@heyjule/shared-types";
import { useEffect, useMemo, useState } from "react";
import { getBrowserDoctorKey } from "@/lib/doctor-key-store";
import { Sparkline } from "./sparkline";

type DecryptionState =
  | { status: "decrypting" }
  | { status: "error"; message: string }
  | { status: "ready"; report: ClinicalReport };

const dateTimeFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });
const monthYearFormat = new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit" });
const dayFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

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

function ageOn(dateOfBirth: string, on: Date) {
  const birth = new Date(`${dateOfBirth}T00:00:00.000Z`);
  let years = on.getUTCFullYear() - birth.getUTCFullYear();
  const passed =
    on.getUTCMonth() > birth.getUTCMonth() ||
    (on.getUTCMonth() === birth.getUTCMonth() && on.getUTCDate() >= birth.getUTCDate());
  if (!passed) years--;
  return Math.max(0, years);
}

/* ---------- symptom domains (German menopause guideline) ---------- */

const DOMAINS = [
  { key: "vasomotor", title: "Vasomotor", match: /hot flash|sweat|flush|heart/i },
  { key: "sleep", title: "Sleep", match: /sleep|insomnia|wake/i },
  { key: "psycho", title: "Psycho-cognitive", match: /anxi|irritab|mood|depress|exhaust|concentrat|memory|cognit/i },
  { key: "urogenital", title: "Urogenital & sexual", match: /vagina|bladder|urinar|libido|sexual|dryness/i },
  { key: "musculo", title: "Musculoskeletal", match: /joint|muscle|bone|back/i },
] as const;

type DomainSummary = {
  key: string;
  title: string;
  items: string[];
  baseline: number;
  current: number;
  max: number;
  collected: boolean;
};

function verdictFor(domain: DomainSummary): { label: string; tone: "good" | "partial" | "flat" | "bad" } {
  if (domain.baseline === 0) return { label: "no baseline burden", tone: "flat" };
  const change = (domain.baseline - domain.current) / domain.baseline;
  if (change >= 0.5) return { label: "clearly improved", tone: "good" };
  if (change >= 0.2) return { label: "improved", tone: "good" };
  if (change > 0) return { label: "partly improved", tone: "partial" };
  if (change === 0) return { label: "unchanged", tone: "flat" };
  return { label: "worse", tone: "bad" };
}

function buildDomains(entries: PromEntry[]): DomainSummary[] {
  const byItem = new Map<string, PromEntry[]>();
  for (const entry of entries) {
    const list = byItem.get(entry.payload.item) ?? [];
    list.push(entry);
    byItem.set(entry.payload.item, list);
  }
  for (const list of byItem.values()) list.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

  return DOMAINS.map((domain) => {
    const items = [...byItem].filter(([item]) => domain.match.test(item));
    const baseline = items.reduce((sum, [, list]) => sum + list[0]!.payload.score, 0);
    const current = items.reduce((sum, [, list]) => sum + list[list.length - 1]!.payload.score, 0);
    const max = items.reduce((sum, [, list]) => sum + list[0]!.payload.maxScore, 0);
    return {
      key: domain.key,
      title: domain.title,
      items: items.map(([item]) => item),
      baseline,
      current,
      max,
      collected: items.length > 0,
    };
  });
}

function DomainCard({ domain }: { domain: DomainSummary }) {
  if (!domain.collected) {
    return (
      <div className="domain-card domain-empty">
        <h3>{domain.title}</h3>
        <p className="domain-missing">not collected</p>
        <span className="domain-verdict verdict-flat">— vs. baseline</span>
      </div>
    );
  }
  const filled = domain.max === 0 ? 0 : Math.max(domain.current > 0 ? 1 : 0, Math.round((domain.current / domain.max) * 5));
  const verdict = verdictFor(domain);
  return (
    <div className={`domain-card domain-${domain.key}`}>
      <h3>{domain.title}</h3>
      <ul className="domain-items">
        {domain.items.slice(0, 3).map((item) => <li key={item}>{item}</li>)}
      </ul>
      <div className="domain-blocks" aria-label={`Current burden ${domain.current} of ${domain.max}`}>
        {Array.from({ length: 5 }, (_, index) => (
          <span key={index} className={index < filled ? "block block-on" : "block"} />
        ))}
      </div>
      <span className={`domain-verdict verdict-${verdict.tone}`}>{verdict.label}</span>
      <span className="domain-baseline">
        {domain.baseline} → {domain.current} vs. baseline
      </span>
    </div>
  );
}

/* ---------- MRS total ---------- */

function MrsScoreCard({ entries }: { entries: PromEntry[] }) {
  const mrs = entries.filter((entry) => /mrs/i.test(entry.payload.instrument));
  if (mrs.length === 0) return null;
  const byItem = new Map<string, PromEntry[]>();
  for (const entry of mrs) {
    const list = byItem.get(entry.payload.item) ?? [];
    list.push(entry);
    byItem.set(entry.payload.item, list);
  }
  const perDate = new Map<string, number>();
  for (const list of byItem.values()) {
    list.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    for (const entry of list) {
      const day = entry.occurredAt.slice(0, 10);
      perDate.set(day, (perDate.get(day) ?? 0) + entry.payload.score);
    }
  }
  const baseline = [...byItem.values()].reduce((sum, list) => sum + list[0]!.payload.score, 0);
  const current = [...byItem.values()].reduce((sum, list) => sum + list[list.length - 1]!.payload.score, 0);
  const max = [...byItem.values()].reduce((sum, list) => sum + list[0]!.payload.maxScore, 0);
  const change = baseline === 0 ? 0 : Math.round(((current - baseline) / baseline) * 100);
  const timeline = [...perDate].sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="mrs-card">
      <span className="mrs-title">MRS total score <small>(0–{max})</small></span>
      <div className="mrs-numbers">
        <span className="mrs-current">
          {current} <small>/ {max}</small>
        </span>
        {change !== 0 ? (
          <span className={change < 0 ? "mrs-change change-good" : "mrs-change change-bad"}>
            {change < 0 ? "↓" : "↑"} {Math.abs(change)}%
          </span>
        ) : null}
      </div>
      <span className="mrs-baseline">Baseline: {baseline} / {max} · since baseline</span>
      {timeline.length > 1 ? (
        <Sparkline
          points={timeline.map(([, total]) => total)}
          labels={timeline.map(([day]) => dayFormat.format(new Date(day)))}
          format={(v) => `${v} / ${max}`}
          fixedRange={[0, max]}
        />
      ) : null}
    </div>
  );
}

/* ---------- therapy ---------- */

function Therapy({ entries, note }: { entries: TreatmentEntry[]; note?: string }) {
  if (entries.length === 0 && !note) return null;
  const sorted = [...entries].sort((a, b) => b.payload.startedAt.localeCompare(a.payload.startedAt));
  const ongoing = sorted.filter((entry) => !entry.payload.endedAt);
  const past = sorted.filter((entry) => entry.payload.endedAt);
  return (
    <div className="panel therapy-panel">
      <h3>Therapy & tolerability</h3>
      {ongoing.map((entry) => (
        <div className="therapy-current" key={entry.id}>
          <strong>{entry.payload.name}</strong>
          <span>Started {dateFormat.format(new Date(`${entry.payload.startedAt}T00:00:00.000Z`))}</span>
          {entry.payload.outcome ? <p>{entry.payload.outcome}</p> : null}
        </div>
      ))}
      {note ? <p className="therapy-note">{note}</p> : null}
      {past.length > 0 ? (
        <details className="quiet-details">
          <summary>Previous treatments ({past.length})</summary>
          {past.map((entry) => (
            <div className="therapy-past" key={entry.id}>
              <strong>{entry.payload.name}</strong>
              <span>
                {monthYearFormat.format(new Date(`${entry.payload.startedAt}T00:00:00.000Z`))} –{" "}
                {monthYearFormat.format(new Date(`${entry.payload.endedAt}T00:00:00.000Z`))}
              </span>
              {entry.payload.outcome ? <p>{entry.payload.outcome}</p> : null}
            </div>
          ))}
        </details>
      ) : null}
    </div>
  );
}

/* ---------- wearables ---------- */

function average(values: number[]) {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function formatSleep(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h} h ${m.toString().padStart(2, "0")} min`;
}

function Wearables({ entries, windowDays }: { entries: WearableEntry[]; windowDays: number }) {
  if (entries.length < 5) return null;
  const sorted = [...entries].sort((a, b) => a.payload.date.localeCompare(b.payload.date));
  const labels = sorted.map((entry) => dayFormat.format(new Date(`${entry.payload.date}T00:00:00.000Z`)));
  const splitIndex = Math.min(14, Math.floor(sorted.length / 2));
  const baselineSlice = sorted.slice(0, splitIndex);
  const recentSlice = sorted.slice(-14);

  const sleepRecent = average(recentSlice.map((e) => e.payload.sleepMinutes));
  const sleepBase = average(baselineSlice.map((e) => e.payload.sleepMinutes));
  const hrRecent = average(recentSlice.map((e) => e.payload.restingHeartRate));
  const hrBase = average(baselineSlice.map((e) => e.payload.restingHeartRate));
  const hrvRecent = average(recentSlice.map((e) => e.payload.hrvMs));
  const hrvBase = average(baselineSlice.map((e) => e.payload.hrvMs));
  const activeDays = recentSlice.filter((e) => e.payload.steps >= 7_000).length / (recentSlice.length / 7);
  const activeBase = baselineSlice.filter((e) => e.payload.steps >= 7_000).length / (baselineSlice.length / 7);
  const coverage = Math.min(100, Math.round((sorted.length / windowDays) * 100));

  const cards = [
    {
      label: "Sleep duration",
      sub: "avg per night",
      value: formatSleep(sleepRecent),
      delta: `${sleepRecent - sleepBase >= 0 ? "+" : "−"}${Math.abs(Math.round(sleepRecent - sleepBase))} min vs. baseline (${formatSleep(sleepBase)})`,
      good: sleepRecent >= sleepBase,
      series: sorted.map((e) => e.payload.sleepMinutes / 60),
      format: (v: number) => `${v.toFixed(1)} h`,
    },
    {
      label: "Active days",
      sub: "per week (≥7k steps)",
      value: `${Math.round(activeDays)} days`,
      delta: `${activeDays - activeBase >= 0 ? "+" : "−"}${Math.abs(Math.round(activeDays - activeBase))} vs. baseline (${Math.round(activeBase)})`,
      good: activeDays >= activeBase,
      series: sorted.map((e) => e.payload.steps),
      format: (v: number) => `${Math.round(v).toLocaleString()} steps`,
    },
    {
      label: "Resting pulse",
      sub: "avg per day",
      value: `${Math.round(hrRecent)} bpm`,
      delta: `${hrRecent - hrBase >= 0 ? "+" : "−"}${Math.abs(Math.round(hrRecent - hrBase))} bpm vs. baseline (${Math.round(hrBase)})`,
      good: hrRecent <= hrBase,
      series: sorted.map((e) => e.payload.restingHeartRate),
      format: (v: number) => `${Math.round(v)} bpm`,
    },
    {
      label: "HRV",
      sub: "avg per night",
      value: `${Math.round(hrvRecent)} ms`,
      delta: `${hrvRecent - hrvBase >= 0 ? "+" : "−"}${Math.abs(Math.round(hrvRecent - hrvBase))} ms vs. baseline (${Math.round(hrvBase)})`,
      good: hrvRecent >= hrvBase,
      series: sorted.map((e) => e.payload.hrvMs),
      format: (v: number) => `${Math.round(v)} ms`,
    },
    {
      label: "Data coverage",
      sub: `${windowDays}-day window`,
      value: `${coverage} %`,
      delta: coverage >= 70 ? "sufficient" : "sparse — interpret with care",
      good: coverage >= 70,
      series: null,
      format: null,
    },
  ];

  return (
    <div className="panel wearables-panel">
      <h3>
        Supporting trend data <span className="block-tag">wearables · Apple Health</span>
      </h3>
      <div className="wearable-grid">
        {cards.map((card) => (
          <div className="wearable-card" key={card.label}>
            <span className="stat-label">{card.label}</span>
            <span className="stat-sub">{card.sub}</span>
            <span className="stat-value">{card.value}</span>
            <span className={card.good ? "stat-delta delta-ok" : "stat-delta delta-warn"}>{card.delta}</span>
            {card.series && card.format ? (
              <Sparkline points={card.series} labels={labels} format={card.format} />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- viewer ---------- */

const FINDING_LABEL = { urgent: "Critical", attention: "Attention", notable: "Notable" } as const;

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

  const report = state.status === "ready" ? state.report : null;
  const promEntries = useMemo(
    () => (report?.entries ?? []).filter((entry): entry is PromEntry => entry.kind === "prom"),
    [report],
  );
  const domains = useMemo(() => buildDomains(promEntries), [promEntries]);

  if (state.status === "decrypting") {
    return <div className="decrypt-state" role="status">Opening with this browser’s doctor key…</div>;
  }
  if (state.status === "error" || !report) {
    return (
      <div className="decrypt-state decrypt-error" role="alert">
        <strong>Report remains encrypted</strong>
        <p>{state.status === "error" ? state.message : "The encrypted report could not be opened."}</p>
        <p>The server cannot recover the private key or decrypt this export.</p>
      </div>
    );
  }

  const entries: PatientEntry[] = report.entries ?? [];
  const treatmentEntries = entries.filter((entry): entry is TreatmentEntry => entry.kind === "treatment");
  const wearableEntries = entries.filter((entry): entry is WearableEntry => entry.kind === "wearable");
  const generatedOn = new Date(report.generatedAt);
  const initials = report.patient.name
    .split(/\s+/u)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const therapyNote = report.sections.find((section) => section.key === "treatments")?.summary;
  const collectedDomains = domains.some((domain) => domain.collected);

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
    <article className="clinical-report dashboard-report">
      <div className="report-actions" aria-label="Report actions">
        <button className="button-quiet" onClick={() => window.print()}>Print</button>
        <button className="button-primary" onClick={download}>Save report JSON</button>
      </div>

      <header className="dash-head">
        <div className="dash-identity">
          <span className="dash-avatar" aria-hidden>{initials}</span>
          <div>
            <h1>{report.patient.name}</h1>
            <p>
              {ageOn(report.patient.dateOfBirth, generatedOn)} y · {report.patient.sex} ·{" "}
              {dateFormat.format(new Date(`${report.patient.dateOfBirth}T00:00:00.000Z`))}
            </p>
            {report.patientId ? <p className="dash-id">Patient ID {report.patientId}</p> : null}
          </div>
        </div>
        {report.keyFacts && report.keyFacts.length > 0 ? (
          <ul className="dash-facts">
            {report.keyFacts.map((fact) => (
              <li key={fact.label}>
                <span>{fact.label}</span>
                <strong>{fact.value}</strong>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="dash-context">
          {report.recipient?.doctorName ? <p>Clinician<br /><strong>{report.recipient.doctorName}</strong></p> : null}
          <p>
            Window: last {report.period.timeframeDays} days
            <br />
            <span className="dash-generated">{dateTimeFormat.format(generatedOn)}</span>
          </p>
        </div>
      </header>

      <div className="dash-overview">
        <div className="panel assessment-panel">
          <h3>Clinical assessment</h3>
          <p className="assessment-lede">{report.headline}</p>
          {report.findings.length > 0 ? (
            <ul className="assessment-findings">
              {report.findings.map((finding, index) => (
                <li key={`${finding.title}-${index}`}>
                  <span className={`finding-level level-${finding.level}`}>{FINDING_LABEL[finding.level]}</span>
                  <span>
                    <strong>{finding.title}</strong> — {finding.detail}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <details className="quiet-details">
            <summary>Read full summary</summary>
            <p>{report.summary}</p>
            {report.sections.map((section) => (
              <p key={section.key}>
                <strong className="section-key">{section.key}: </strong>
                {section.summary}
              </p>
            ))}
          </details>
        </div>
        <MrsScoreCard entries={promEntries} />
      </div>

      {collectedDomains ? (
        <section className="report-block">
          <h2>
            Symptom course by domain <span className="block-tag">patient-reported · MRS</span>
          </h2>
          <div className="domain-grid">
            {domains.map((domain) => <DomainCard key={domain.key} domain={domain} />)}
          </div>
        </section>
      ) : null}

      <div className="dash-bottom">
        <Therapy entries={treatmentEntries} note={therapyNote} />
        <Wearables entries={wearableEntries} windowDays={report.period.timeframeDays} />
        {report.discussionPoints && report.discussionPoints.length > 0 ? (
          <div className="panel discuss-panel">
            <h3>To discuss today</h3>
            <ul className="discuss-list">
              {report.discussionPoints.map((point) => (
                <li key={point}>
                  <span className="discuss-box" aria-hidden />
                  {point}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <footer className="dash-footer">
        <p>{report.disclaimer}</p>
        <p>
          {report.sources.map((source) => `${sourceLabel(source.source)}: ${source.count}`).join(" · ")} ·
          Generated by {report.generation.provider} <code>{report.generation.model}</code>
        </p>
      </footer>
    </article>
  );
}
