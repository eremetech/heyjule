import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type {
  ClinicalReport,
  ClinicalReportScope,
  PatientEntry,
  PatientEntrySource,
  PatientProfile,
} from "@heyjule/shared-types";

const generatedReportSchema = z.object({
  headline: z.string().min(1).max(240),
  summary: z.string().min(1).max(4_000),
  findings: z.array(
    z.object({
      title: z.string().min(1).max(200),
      detail: z.string().min(1).max(1_500),
      level: z.enum(["notable", "attention", "urgent"]),
      evidenceEntryIds: z.array(z.string()).max(30),
    }),
  ).max(20),
  trends: z.array(
    z.object({
      metric: z.string().min(1).max(160),
      direction: z.enum(["improving", "stable", "worsening", "mixed"]),
      detail: z.string().min(1).max(1_500),
      evidenceEntryIds: z.array(z.string()).max(60),
    }),
  ).max(20),
  sections: z.array(
    z.object({
      key: z.enum(["symptoms", "wearables", "proms", "treatments", "conversations"]),
      summary: z.string().min(1).max(2_000),
      evidenceEntryIds: z.array(z.string()).max(80),
    }),
  ).max(5),
});

type GenerateReportOptions = {
  apiKey: string;
  model: string;
  patient: PatientProfile;
  entries: PatientEntry[];
  timeframeDays: number;
  scope: ClinicalReportScope;
  fetch: typeof fetch;
  now?: Date;
};

const REPORT_DISCLAIMER =
  "AI-generated clinical draft based only on the supplied HeyJule record. It may contain errors or omit context and is not a diagnosis. A qualified clinician must verify it against the source entries before making care decisions.";

function ageOn(dateOfBirth: string, on: Date) {
  const birth = new Date(`${dateOfBirth}T00:00:00.000Z`);
  let years = on.getUTCFullYear() - birth.getUTCFullYear();
  const birthdayHasPassed =
    on.getUTCMonth() > birth.getUTCMonth() ||
    (on.getUTCMonth() === birth.getUTCMonth() && on.getUTCDate() >= birth.getUTCDate());
  if (!birthdayHasPassed) years--;
  return Math.max(0, years);
}

function entryIsInScope(entry: PatientEntry, scope: ClinicalReportScope) {
  if (entry.kind === "wearable") return scope.wearables;
  if (entry.kind === "prom") return scope.proms;
  if (entry.kind === "treatment") return scope.treatments;
  if (entry.kind === "chat_summary" || entry.source === "in_app_conversation") {
    return scope.conversations;
  }
  return scope.symptoms;
}

export function selectReportEntries(
  entries: PatientEntry[],
  timeframeDays: number,
  scope: ClinicalReportScope,
  now: Date,
) {
  const from = new Date(now.getTime() - timeframeDays * 86_400_000);
  return entries
    .filter((entry) => {
      if (!entryIsInScope(entry, scope)) return false;
      if (entry.kind !== "treatment") return new Date(entry.occurredAt) >= from;
      const endedAt = entry.payload.endedAt;
      return !endedAt || new Date(`${endedAt}T23:59:59.999Z`) >= from;
    })
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

function sourceCounts(entries: PatientEntry[]) {
  const counts = new Map<PatientEntrySource, number>();
  for (const entry of entries) counts.set(entry.source, (counts.get(entry.source) ?? 0) + 1);
  return [...counts].map(([source, count]) => ({ source, count }));
}

function validEvidence(ids: string[], allowed: ReadonlySet<string>) {
  return [...new Set(ids.filter((id) => allowed.has(id)))];
}

function providerInput(patient: PatientProfile, entries: PatientEntry[], now: Date) {
  return {
    patientContext: {
      ageYears: ageOn(patient.dateOfBirth, now),
      sex: patient.sex,
    },
    entries: entries.map((entry) => ({
      id: entry.id,
      occurredAt: entry.occurredAt,
      kind: entry.kind,
      source: entry.source,
      dataMode: entry.dataMode,
      payload: entry.payload,
    })),
  };
}

export async function generateClinicalReport(options: GenerateReportOptions): Promise<ClinicalReport> {
  const now = options.now ?? new Date();
  const entries = selectReportEntries(
    options.entries,
    options.timeframeDays,
    options.scope,
    now,
  );
  if (entries.length === 0) throw new Error("report_has_no_entries");

  const openai = new OpenAI({
    apiKey: options.apiKey,
    fetch: options.fetch,
    maxRetries: 0,
    timeout: 30_000,
  });
  const response = await openai.responses.parse({
    model: options.model,
    store: false,
    max_output_tokens: 4_000,
    input: [
      {
        role: "developer",
        content: [
          "Create a concise clinician-facing draft from the supplied patient record JSON.",
          "Use only facts present in the supplied entries. Never diagnose, prescribe, or infer causality.",
          "Distinguish patient-reported observations from wearable measurements and imported treatment records.",
          "Cite the exact entry IDs supporting every finding, trend, and section.",
          "Use urgent only when a supplied entry itself warrants prompt clinician review; do not invent urgency.",
          "If a category has too little evidence, say so plainly instead of filling gaps.",
          "The record may be deterministic mock data and must still be summarized from the supplied values rather than from an example answer.",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify(providerInput(options.patient, entries, now)),
      },
    ],
    text: {
      format: zodTextFormat(generatedReportSchema, "heyjule_clinical_report"),
    },
  });
  const generated = response.output_parsed;
  if (!generated) throw new Error("report_provider_returned_no_content");

  const allowedEvidence = new Set(entries.map((entry) => entry.id));
  const generatedAt = now.toISOString();
  const from = new Date(now.getTime() - options.timeframeDays * 86_400_000).toISOString();
  return {
    version: 1,
    generatedAt,
    period: { from, to: generatedAt, timeframeDays: options.timeframeDays },
    patient: options.patient,
    headline: generated.headline,
    summary: generated.summary,
    findings: generated.findings.map((finding) => ({
      ...finding,
      evidenceEntryIds: validEvidence(finding.evidenceEntryIds, allowedEvidence),
    })),
    trends: generated.trends.map((trend) => ({
      ...trend,
      evidenceEntryIds: validEvidence(trend.evidenceEntryIds, allowedEvidence),
    })),
    sections: generated.sections.map((section) => ({
      ...section,
      evidenceEntryIds: validEvidence(section.evidenceEntryIds, allowedEvidence),
    })),
    sources: sourceCounts(entries),
    sourceEntryIds: entries.map((entry) => entry.id),
    generation: {
      provider: "openai",
      model: response.model,
      responseId: response.id,
    },
    disclaimer: REPORT_DISCLAIMER,
  };
}
