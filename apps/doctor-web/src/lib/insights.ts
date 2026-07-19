import type { SymptomEvent, WearableDay } from "./db.ts";

export type Flag = {
  level: "critical" | "serious" | "notable";
  title: string;
  detail: string;
};

export type PromDelta = {
  instrument: string;
  item: string;
  baseline: number;
  current: number;
  delta: number;
};

function avg(values: number[]) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

function metricWindowDelta(days: WearableDay[], metric: (d: WearableDay) => number | null, recentN: number) {
  const values = days.map(metric);
  const recent = avg(values.slice(-recentN).filter((v): v is number => v != null));
  const baseline = avg(values.slice(0, -recentN).filter((v): v is number => v != null));
  if (recent == null || baseline == null) return null;
  return { recent, baseline, delta: recent - baseline };
}

/* Simple, explainable deviation heuristics over the report window. Ordered
 * most-severe first; the report shows them as the "noteworthy" strip. */
export function computeFlags(
  days: WearableDay[],
  symptoms: SymptomEvent[],
  promDeltas: PromDelta[]
): Flag[] {
  const flags: Flag[] = [];

  const hr = metricWindowDelta(days, (d) => d.resting_hr, 3);
  if (hr && hr.delta >= 4) {
    flags.push({
      level: hr.delta >= 7 ? "critical" : "serious",
      title: "Resting heart rate elevated",
      detail: `${Math.round(hr.recent)} bpm over the last 3 nights — ${Math.round(
        hr.delta
      )} bpm above the ${days.length}-day baseline of ${Math.round(hr.baseline)} bpm.`,
    });
  }

  const recentSevere = symptoms.filter(
    (s) =>
      s.severity === "severe" &&
      Date.now() - new Date(s.occurred_at).getTime() < 7 * 86_400_000
  );
  for (const s of recentSevere) {
    flags.push({
      level: "serious",
      title: `Severe symptom logged: ${s.title.toLowerCase()}`,
      detail: s.detail,
    });
  }

  const sleep = metricWindowDelta(days, (d) => d.sleep_minutes, 7);
  if (sleep && sleep.delta <= -30) {
    flags.push({
      level: "serious",
      title: "Sleep duration dropping",
      detail: `${(sleep.recent / 60).toFixed(1)} h average this week, down ${Math.round(
        Math.abs(sleep.delta)
      )} min from the window baseline.`,
    });
  } else if (sleep && sleep.delta >= 20) {
    flags.push({
      level: "notable",
      title: "Sleep duration improving",
      detail: `${(sleep.recent / 60).toFixed(1)} h average this week, up ${Math.round(
        sleep.delta
      )} min from the window baseline.`,
    });
  }

  for (const p of promDeltas) {
    if (p.delta >= 2) {
      flags.push({
        level: "serious",
        title: `${p.item} worsening (${p.instrument})`,
        detail: `Score up from ${p.baseline} to ${p.current} since baseline.`,
      });
    }
  }
  const byInstrument = new Map<string, number>();
  for (const p of promDeltas) {
    byInstrument.set(p.instrument, (byInstrument.get(p.instrument) ?? 0) + p.delta);
  }
  for (const [instrument, totalDelta] of byInstrument) {
    if (totalDelta <= -5) {
      flags.push({
        level: "notable",
        title: `${instrument} total improved ${Math.abs(totalDelta)} points`,
        detail: "Overall patient-reported burden is clearly down since baseline.",
      });
    }
  }

  const order = { critical: 0, serious: 1, notable: 2 } as const;
  return flags.sort((a, b) => order[a.level] - order[b.level]).slice(0, 4);
}
