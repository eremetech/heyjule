import type { PatientEntry, PatientProfile } from "@heyjule/shared-types";

export const MOCK_PATIENT_DATASET_VERSION = "martina-care-flow-v1";

export const MOCK_PATIENT_PROFILE: PatientProfile = {
  name: "Martina Keller",
  dateOfBirth: "1972-05-30",
  sex: "female",
};

function atDaysBefore(anchor: Date, days: number, hour = 9) {
  const value = new Date(anchor);
  value.setUTCDate(value.getUTCDate() - days);
  value.setUTCHours(hour, 0, 0, 0);
  return value.toISOString();
}

function dateAtDaysBefore(anchor: Date, days: number) {
  return atDaysBefore(anchor, days).slice(0, 10);
}

/** Deterministic demo data that exercises every current ingestion boundary. */
export function buildMockPatientEntries(anchorIso: string): PatientEntry[] {
  const anchor = new Date(anchorIso);
  if (Number.isNaN(anchor.getTime())) throw new Error("Invalid mock-data anchor");

  // FUTURE SOURCE: replace these fixtures with summaries emitted by the
  // in-app voice/message conversation pipeline after patient confirmation.
  const inAppConversations: PatientEntry[] = [
    {
      id: "mock_conversation_night_sweats",
      occurredAt: atDaysBefore(anchor, 1, 7),
      kind: "check_in",
      source: "in_app_conversation",
      dataMode: "mock",
      payload: {
        title: "Night sweats, woke twice",
        note: "Woke at 02:00 and 04:30 drenched, changed clothes, and fell back asleep within about 20 minutes.",
        symptoms: ["night sweats", "sleep interruption"],
        severity: 5,
      },
    },
    {
      id: "mock_conversation_joint_stiffness",
      occurredAt: atDaysBefore(anchor, 18, 8),
      kind: "check_in",
      source: "in_app_conversation",
      dataMode: "mock",
      payload: {
        title: "Morning joint stiffness",
        note: "Fingers and knees felt stiff for about 30 minutes after waking and loosened with movement.",
        symptoms: ["joint stiffness"],
        severity: 3,
      },
    },
    {
      id: "mock_conversation_good_night",
      occurredAt: atDaysBefore(anchor, 8, 8),
      kind: "check_in",
      source: "in_app_conversation",
      dataMode: "mock",
      payload: {
        title: "Slept through the night",
        note: "No waking or night sweats; felt rested in the morning.",
        symptoms: [],
        severity: 0,
      },
    },
  ];

  // FUTURE SOURCE: replace these fixtures with the device-sealed summaries
  // delivered by the authenticated ChatGPT App MCP `new_entry` tool.
  const chatGptMcpSummaries: PatientEntry[] = [
    {
      id: "mock_chatgpt_palpitations",
      occurredAt: atDaysBefore(anchor, 12, 20),
      kind: "chat_summary",
      source: "chatgpt_app_mcp",
      dataMode: "mock",
      payload: {
        title: "Evening palpitations",
        summary: "Martina described a fluttering sensation for a few minutes after dinner, without chest pain or dizziness; it resolved on its own.",
        noteworthy: [{ label: "Palpitations at rest", level: "serious" }],
      },
    },
    {
      id: "mock_chatgpt_hot_flash_cluster",
      occurredAt: atDaysBefore(anchor, 24, 20),
      kind: "chat_summary",
      source: "chatgpt_app_mcp",
      dataMode: "mock",
      payload: {
        title: "Intense hot-flash cluster",
        summary: "A cluster of intense hot flashes occurred over one evening with a racing-heart sensation and anxious mood; symptoms settled after cooling down and paced breathing.",
        noteworthy: [{ label: "Intense symptom cluster", level: "serious" }],
      },
    },
  ];

  // FUTURE SOURCE: replace this fixture generator with consented Apple Health
  // ingestion, normalization, and provenance timestamps on the patient device.
  const wearableRows = [
    [438, 68, 5_400, 36],
    [445, 67, 5_900, 37],
    [452, 67, 6_100, 38],
    [421, 69, 4_900, 34],
    [460, 66, 6_400, 40],
    [468, 65, 6_900, 41],
    [472, 65, 7_100, 42],
    [455, 66, 6_600, 40],
    [480, 64, 7_400, 43],
    [486, 64, 7_800, 44],
    [492, 63, 8_000, 45],
    [475, 65, 7_300, 42],
    [488, 71, 7_900, 40],
    [496, 72, 8_200, 39],
  ] as const;
  const wearables: PatientEntry[] = wearableRows.map(
    ([sleepMinutes, restingHeartRate, steps, hrvMs], index) => {
      const daysBefore = wearableRows.length - 1 - index;
      return {
        id: `mock_apple_health_day_${String(daysBefore).padStart(2, "0")}`,
        occurredAt: atDaysBefore(anchor, daysBefore, 23),
        kind: "wearable",
        source: "apple_health",
        dataMode: "mock",
        payload: {
          date: dateAtDaysBefore(anchor, daysBefore),
          sleepMinutes,
          restingHeartRate,
          steps,
          hrvMs,
        },
      };
    },
  );

  // FUTURE SOURCE: replace these fixtures with a standards-based ePA/EHR
  // import. Imported treatment fields should retain their original provenance.
  const treatments: PatientEntry[] = [
    {
      id: "mock_epa_estradiol",
      occurredAt: atDaysBefore(anchor, 82),
      kind: "treatment",
      source: "electronic_patient_record",
      dataMode: "mock",
      payload: {
        name: "Estradiol patch 25 µg + micronized progesterone",
        startedAt: dateAtDaysBefore(anchor, 82),
        outcome: "Patient reports hot flashes decreasing from daily to one or two per week within six weeks; no side effects recorded.",
      },
    },
    {
      id: "mock_epa_cbti",
      occurredAt: atDaysBefore(anchor, 145),
      kind: "treatment",
      source: "electronic_patient_record",
      dataMode: "mock",
      payload: {
        name: "CBT-I sleep program",
        startedAt: dateAtDaysBefore(anchor, 145),
        endedAt: dateAtDaysBefore(anchor, 86),
        outcome: "Sleep onset improved by about 20 minutes; early waking continued on nights with sweats.",
      },
    },
    {
      id: "mock_epa_venlafaxine",
      occurredAt: atDaysBefore(anchor, 180),
      kind: "treatment",
      source: "electronic_patient_record",
      dataMode: "mock",
      payload: {
        name: "Venlafaxine 37.5 mg",
        startedAt: dateAtDaysBefore(anchor, 180),
        endedAt: dateAtDaysBefore(anchor, 120),
        outcome: "Modest effect on hot flashes; stopped because persistent nausea was recorded.",
      },
    },
  ];

  const promValues = [
    ["Hot flashes & sweating", [3, 2, 1]],
    ["Sleep problems", [3, 2, 1]],
    ["Joint & muscle discomfort", [2, 2, 2]],
  ] as const;
  const proms: PatientEntry[] = promValues.flatMap(([item, scores], itemIndex) =>
    scores.map((score, scoreIndex) => {
      const daysBefore = [80, 40, 2][scoreIndex] ?? 2;
      return {
        id: `mock_prom_mrs_${itemIndex}_${scoreIndex}`,
        occurredAt: atDaysBefore(anchor, daysBefore, 10),
        kind: "prom" as const,
        source: "patient_reported_outcome" as const,
        dataMode: "mock" as const,
        payload: {
          instrument: "Menopause Rating Scale",
          item,
          score,
          maxScore: 4,
          ...(item === "Joint & muscle discomfort" && scoreIndex === 2
            ? { note: "Morning stiffness remains unchanged." }
            : {}),
        },
      };
    }),
  );

  return [...inAppConversations, ...chatGptMcpSummaries, ...wearables, ...treatments, ...proms];
}
