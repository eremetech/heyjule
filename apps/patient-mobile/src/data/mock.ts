// Preloaded demo user — 35 days of signals, entries, and proactive questions.
// Shapes follow the mcPHASES-aligned schema direction from the scope doc.

import type { Phase } from '../theme';

export interface DaySignals {
  iso: string; // YYYY-MM-DD
  dayOffset: number; // 0 = today, negative = past
  cycleDay: number;
  phase: Phase;
  rhr: number; // resting heart rate, bpm
  skinTemp: number; // °C
  sleepHours: number;
  sleepEff: number; // %
}

export interface ContextAttachment {
  cycleDay: number;
  phase: Phase;
  sleepHours: number;
  signalName: string;
  signalValue: string;
  sources: { value: string; device: string }[];
}

export interface Entry {
  id: string;
  kind: 'entry';
  iso: string;
  time: string; // HH:MM
  symptom: string;
  severity: 1 | 2 | 3;
  category: string;
  raw: string; // verbatim utterance
  via: 'voice' | 'text';
  context: ContextAttachment;
  answersQuestionId?: string;
}

export interface ProactiveQuestion {
  id: string;
  kind: 'question';
  iso: string;
  time: string;
  observation: string; // states the deviation and its source, names no cause
  question: string;
  signal: SignalKey;
  dismissed?: boolean;
  answeredByEntryId?: string;
}

export type StreamItem = Entry | ProactiveQuestion;

export type SignalKey = 'rhr' | 'skinTemp' | 'sleepHours';

export const signalMeta: Record<
  SignalKey,
  { label: string; unit: string; device: string; format: (v: number) => string }
> = {
  rhr: { label: 'RHR', unit: 'bpm', device: 'Apple Watch S9', format: (v) => `${Math.round(v)}` },
  skinTemp: { label: 'SKIN T', unit: '°C', device: 'Oura Ring Gen 4', format: (v) => v.toFixed(1) },
  sleepHours: { label: 'SLEEP', unit: 'h', device: 'Oura Ring Gen 4', format: (v) => v.toFixed(1) },
};

// ---------------------------------------------------------------------------
// Cycle model: 29-day cycle, today is cycle day 24 (luteal).
// Scrolling 35 days back crosses luteal → ovulation → follicular → menstrual.
// ---------------------------------------------------------------------------

const TODAY = new Date(2026, 6, 19); // demo anchor
const DAYS = 35;
const CYCLE_LEN = 29;
const TODAY_CYCLE_DAY = 24;

function phaseOf(cycleDay: number): Phase {
  if (cycleDay <= 5) return 'menstrual';
  if (cycleDay <= 13) return 'follicular';
  if (cycleDay <= 16) return 'ovulation';
  return 'luteal';
}

function isoOf(offset: number): string {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

// deterministic pseudo-noise
function noise(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x); // 0..1
}

export const days: DaySignals[] = [];
for (let i = DAYS - 1; i >= 0; i--) {
  const dayOffset = -i;
  const cycleDay = ((TODAY_CYCLE_DAY - 1 + dayOffset) % CYCLE_LEN + CYCLE_LEN) % CYCLE_LEN + 1;
  const phase = phaseOf(cycleDay);

  // baselines with phase physiology
  let rhr = 60 + noise(i) * 3 + (phase === 'luteal' ? 2 : 0);
  let skinTemp = 36.35 + noise(i + 50) * 0.12 + (phase === 'luteal' ? 0.28 : phase === 'ovulation' ? 0.12 : 0);
  let sleepHours = 7.2 + (noise(i + 90) - 0.5) * 1.1;
  let sleepEff = 88 + (noise(i + 130) - 0.5) * 8;

  // Anomaly A — RHR elevated across the last 3 consecutive days
  if (dayOffset >= -2) rhr += 7 + noise(i + 7) * 2;
  // Anomaly B — one sharp sleep drop 6 days ago
  if (dayOffset === -6) {
    sleepHours = 4.9;
    sleepEff = 71;
  }
  // Anomaly C — sustained skin temp elevation 12–10 days ago (past ovulation window)
  if (dayOffset <= -10 && dayOffset >= -12) skinTemp += 0.31;

  days.push({
    iso: isoOf(dayOffset),
    dayOffset,
    cycleDay,
    phase,
    rhr,
    skinTemp,
    sleepHours,
    sleepEff,
  });
}

export const dayByIso = new Map(days.map((d) => [d.iso, d]));

export function contextFor(iso: string, signal: SignalKey = 'rhr'): ContextAttachment {
  const d = dayByIso.get(iso) ?? days[days.length - 1];
  const meta = signalMeta[signal];
  return {
    cycleDay: d.cycleDay,
    phase: d.phase,
    sleepHours: d.sleepHours,
    signalName: meta.label,
    signalValue: `${meta.format(d[signal])} ${meta.unit}`,
    sources: [
      { value: `cycle day ${d.cycleDay}`, device: 'Clue' },
      { value: `${d.sleepHours.toFixed(1)} h sleep`, device: 'Oura Ring Gen 4' },
      { value: `${meta.format(d[signal])} ${meta.unit} ${meta.label.toLowerCase()}`, device: meta.device },
    ],
  };
}

// ---------------------------------------------------------------------------
// Entries — coded, with the verbatim utterance preserved
// ---------------------------------------------------------------------------

function entry(
  offset: number,
  time: string,
  symptom: string,
  severity: 1 | 2 | 3,
  category: string,
  raw: string,
  via: 'voice' | 'text' = 'voice',
): Entry {
  const iso = isoOf(offset);
  return {
    id: `e${offset}${time}`,
    kind: 'entry',
    iso,
    time,
    symptom,
    severity,
    category,
    raw,
    via,
    context: contextFor(iso),
  };
}

export const seedEntries: Entry[] = [
  entry(-33, '08:12', 'Bleeding', 2, 'Cycle', 'Period started overnight, medium flow so far.'),
  entry(-32, '21:40', 'Cramps', 3, 'Pain', 'Cramps are really bad tonight, painkillers barely touch it.', 'text'),
  entry(-31, '14:05', 'Fatigue', 2, 'Energy', 'So drained today, needed a nap after lunch.'),
  entry(-26, '09:30', 'Headache', 2, 'Pain', 'Dull headache behind my eyes since I woke up.', 'text'),
  entry(-19, '18:22', 'Discharge', 1, 'Cycle', 'Noticed stretchy discharge today, more than usual.'),
  entry(-15, '22:10', 'Mood', 2, 'Mood', 'Felt weirdly irritable all evening for no reason.', 'text'),
  entry(-11, '07:45', 'Poor sleep', 2, 'Sleep', 'Kept waking up hot last night, sheets soaked.'),
  entry(-8, '16:00', 'Headache', 3, 'Pain', 'Splitting headache again, same side as last month.'),
  entry(-6, '10:15', 'Fatigue', 3, 'Energy', 'Could not get out of bed properly, completely wiped.', 'text'),
  entry(-2, '13:37', 'Bloating', 2, 'Digestive', 'Really bloated after lunch, jeans feel tight.'),
];

// ---------------------------------------------------------------------------
// Proactive questions — anchored at their anomaly, observation + source + question
// ---------------------------------------------------------------------------

export const seedQuestions: ProactiveQuestion[] = [
  {
    id: 'q-rhr',
    kind: 'question',
    iso: isoOf(0),
    time: '08:00',
    observation:
      'Resting heart rate has been 61→69 bpm for three consecutive nights, above your usual 58–64 range. Source: Apple Watch S9.',
    question: 'Anything felt different these last few days?',
    signal: 'rhr',
  },
  {
    id: 'q-sleep',
    kind: 'question',
    iso: isoOf(-6),
    time: '09:10',
    observation:
      'You slept 4.9 h at 71% efficiency against your 7.2 h / 88% trailing average. Source: Oura Ring Gen 4.',
    question: 'How was that night for you?',
    signal: 'sleepHours',
  },
  {
    id: 'q-temp',
    kind: 'question',
    iso: isoOf(-10),
    time: '08:30',
    observation:
      'Skin temperature has held +0.3 °C above your cycle-phase baseline for three days. Source: Oura Ring Gen 4.',
    question: 'Did anything unusual happen this week?',
    signal: 'skinTemp',
  },
];

// ---------------------------------------------------------------------------
// Inflow sources — fourteen, four live
// ---------------------------------------------------------------------------

export interface Source {
  id: string;
  category: string;
  kind: string;
  example: string;
  live: boolean;
  reading?: string;
}

export const sources: Source[] = [
  { id: 'watch', category: 'Wearable', kind: 'Smart watch', example: 'Apple Watch Series 9', live: true, reading: '69 bpm · 2 min ago' },
  { id: 'ring', category: 'Wearable', kind: 'Ring', example: 'Oura Ring Gen 4', live: true, reading: '36.7 °C · 14 min ago' },
  { id: 'buds', category: 'Wearable', kind: 'Earphones', example: 'Powerbeats Pro 2', live: false },
  { id: 'scale', category: 'Wearable', kind: 'Smart scale', example: 'Withings Body+', live: false },
  { id: 'cgm', category: 'Medical', kind: 'Glucose monitor', example: 'FreeStyle Libre 3', live: true, reading: '5.4 mmol/L · now' },
  { id: 'strava', category: 'App', kind: 'Exercise', example: 'Strava', live: false },
  { id: 'fitness', category: 'App', kind: 'Activity', example: 'Apple Fitness', live: false },
  { id: 'mfp', category: 'App', kind: 'Nutrition', example: 'MyFitnessPal', live: false },
  { id: 'clue', category: 'App', kind: 'Cycle tracker', example: 'Clue', live: true, reading: 'CD 24 · luteal' },
  { id: 'sleep', category: 'Passive', kind: 'Sleep', example: 'Oura sleep staging', live: false },
  { id: 'screen', category: 'Passive', kind: 'Screen time', example: 'iOS Screen Time', live: false },
  { id: 'travel', category: 'Passive', kind: 'Travel', example: 'Google Maps Timeline', live: false },
  { id: 'records', category: 'Records', kind: 'Medical records', example: 'Apple Health Records', live: false },
  { id: 'ai', category: 'Records', kind: 'AI conversations', example: 'ChatGPT export', live: false },
];

// ---------------------------------------------------------------------------
// Extraction mock — resolves a free-text/voice utterance into a coded entry
// ---------------------------------------------------------------------------

const LEXICON: { match: RegExp; symptom: string; category: string }[] = [
  { match: /cramp/i, symptom: 'Cramps', category: 'Pain' },
  { match: /headache|migraine|head hurts/i, symptom: 'Headache', category: 'Pain' },
  { match: /discharge/i, symptom: 'Discharge', category: 'Cycle' },
  { match: /bleed|spotting|period/i, symptom: 'Bleeding', category: 'Cycle' },
  { match: /mood|irritab|anxious|sad|cry/i, symptom: 'Mood', category: 'Mood' },
  { match: /tired|fatigue|exhaust|drained|wiped/i, symptom: 'Fatigue', category: 'Energy' },
  { match: /sleep|insomnia|woke/i, symptom: 'Poor sleep', category: 'Sleep' },
  { match: /bloat/i, symptom: 'Bloating', category: 'Digestive' },
  { match: /nausea|sick/i, symptom: 'Nausea', category: 'Digestive' },
];

export function extract(raw: string): { symptom: string; severity: 1 | 2 | 3; category: string } {
  const hit = LEXICON.find((l) => l.match.test(raw));
  let severity: 1 | 2 | 3 = 2;
  if (/worse|severe|sharp|really bad|splitting|unbearable|worst/i.test(raw)) severity = 3;
  else if (/mild|slight|a bit|little/i.test(raw)) severity = 1;
  return {
    symptom: hit?.symptom ?? 'Noted',
    severity,
    category: hit?.category ?? 'General',
  };
}

// Follow-up the extraction agent may ask, anchored to the capture buttons
export function followUpFor(symptom: string): string | null {
  switch (symptom) {
    case 'Cramps':
      return 'Worse than your usual for this phase?';
    case 'Headache':
      return 'Same side as the ones you logged before?';
    case 'Bleeding':
      return 'Heavier or lighter than your usual day 1?';
    case 'Mood':
      return 'Did anything set it off, or did it arrive on its own?';
    case 'Fatigue':
      return 'Physical heaviness, or more like brain fog?';
    default:
      return null;
  }
}

export const todayIso = isoOf(0);
export { TODAY };
