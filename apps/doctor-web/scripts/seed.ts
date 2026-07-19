/* Seeds a demo doctor plus two linked patients with symptom history, wearable
 * data, and briefs. Run after `pnpm db:migrate`:
 *
 *   pnpm --filter @heyjule/doctor-web seed
 *
 * Demo sign-in: demo.doctor@heyjule.dev / jule-demo-password
 */
import { randomUUID, randomBytes } from "node:crypto";
import { auth } from "../src/lib/auth.ts";
import { db } from "../src/lib/db.ts";

const DEMO_EMAIL = "demo.doctor@heyjule.dev";
const DEMO_PASSWORD = "jule-demo-password";

function daysAgo(n: number, hour = 9) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function dateOnly(n: number) {
  return daysAgo(n).slice(0, 10);
}

async function main() {
  let doctor = db
    .prepare(`SELECT id FROM user WHERE email = ?`)
    .get(DEMO_EMAIL) as { id: string } | undefined;
  if (!doctor) {
    await auth.api.signUpEmail({
      body: { name: "Dr. Jules Rivera", email: DEMO_EMAIL, password: DEMO_PASSWORD },
    });
    doctor = db
      .prepare(`SELECT id FROM user WHERE email = ?`)
      .get(DEMO_EMAIL) as { id: string };
  }
  const hasMaya = db
    .prepare(`SELECT id FROM patients WHERE name = 'Maya Okafor'`)
    .get() as { id: string } | undefined;

  const insertPatient = db.prepare(
    `INSERT INTO patients (id, name, date_of_birth, sex) VALUES (?, ?, ?, ?)`
  );
  const insertLink = db.prepare(
    `INSERT INTO patient_links (id, doctor_id, patient_id, code, status, claimed_at)
     VALUES (?, ?, ?, ?, 'active', ?)`
  );
  const insertSymptom = db.prepare(
    `INSERT INTO symptom_events (id, patient_id, occurred_at, source, title, detail, severity)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const insertDay = db.prepare(
    `INSERT INTO wearable_days (patient_id, date, sleep_minutes, resting_hr, steps, hrv_ms)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const insertBrief = db.prepare(
    `INSERT INTO briefs (id, patient_id, headline, summary) VALUES (?, ?, ?, ?)`
  );

  if (!hasMaya) {
  // ---- Patient 1: Maya Okafor — migraines ----
  const maya = randomUUID();
  insertPatient.run(maya, "Maya Okafor", "1991-04-12", "female");
  insertLink.run(randomUUID(), doctor.id, maya, "DEMO4A", daysAgo(28));

  const mayaSymptoms: [number, string, string, string, string][] = [
    [1, "chat_summary", "Throbbing headache, right temple", "Described a 6/10 throbbing pain starting mid-afternoon, worsened by screen light. Took ibuprofen with partial relief after ~2 hours.", "moderate"],
    [3, "voice", "Aura before headache", "Reported zigzag lines in left visual field for about 20 minutes, followed by headache onset within the hour.", "moderate"],
    [6, "message", "Mild neck stiffness", "Noted stiffness on waking; resolved after stretching. No headache that day.", "mild"],
    [9, "chat_summary", "Severe migraine, missed work", "Pain 8/10 with nausea and light sensitivity. Stayed in a dark room most of the day. Sumatriptan taken at onset helped after 90 minutes.", "severe"],
    [13, "voice", "Skipped meals, headache followed", "Logged that lunch was skipped during a deadline; dull headache began around 5 pm, rating 4/10.", "mild"],
    [17, "chat_summary", "Headache after poor sleep", "Slept under 5 hours; woke with pressure headache 5/10 lasting until noon. Coffee did not help.", "moderate"],
    [22, "message", "Good stretch — no symptoms", "Checked in to note four consecutive symptom-free days.", "mild"],
    [26, "chat_summary", "Throbbing headache with nausea", "Evening onset 7/10 after long screen day; mild nausea, no aura. Resolved overnight.", "severe"],
  ];
  for (const [n, source, title, detail, severity] of mayaSymptoms) {
    insertSymptom.run(randomUUID(), maya, daysAgo(n, 14), source, title, detail, severity);
  }

  const mayaDays = [
    [438, 62, 7100, 44], [455, 61, 8200, 48], [290, 66, 4100, 36],
    [472, 60, 9000, 51], [430, 62, 7600, 46], [401, 63, 6900, 43],
    [445, 61, 8400, 49], [310, 67, 3800, 34], [462, 60, 8800, 50],
    [428, 62, 7200, 45], [415, 63, 6600, 42], [450, 61, 8100, 47],
    [385, 64, 5900, 40], [440, 62, 7800, 46],
  ];
  mayaDays.forEach((row, i) => {
    insertDay.run(maya, dateOnly(13 - i), ...row);
  });

  insertBrief.run(
    randomUUID(),
    maya,
    "Migraine frequency is up; short sleep and skipped meals precede most episodes.",
    "Maya logged 8 headache events over the past 4 weeks, 2 rated severe. A pattern is visible across her logs: episodes cluster after nights under 6 hours of sleep and days with skipped meals or long screen exposure. One episode included visual aura. Sumatriptan taken at onset shortened the severe episodes; ibuprofen gave only partial relief. Wearable data shows resting heart rate rising 4–6 bpm and HRV dropping on the nights preceding an episode, which may be useful as an early signal. She reports a 4-day symptom-free stretch mid-month coinciding with regular sleep."
  );

  // ---- Patient 2: Daniel Reyes — post-viral fatigue ----
  const daniel = randomUUID();
  insertPatient.run(daniel, "Daniel Reyes", "1978-11-02", "male");
  insertLink.run(randomUUID(), doctor.id, daniel, "DEMO7K", daysAgo(21));

  const danielSymptoms: [number, string, string, string, string][] = [
    [2, "chat_summary", "Afternoon energy crash", "Described hitting a wall around 2 pm despite a full night's sleep; needed a 40-minute nap to continue the day.", "moderate"],
    [4, "voice", "Heart racing climbing stairs", "Reported heart pounding after one flight of stairs; settled after a few minutes of rest.", "moderate"],
    [8, "message", "Better morning", "Woke feeling rested for the first time in a week; energy held until early evening.", "mild"],
    [11, "chat_summary", "Crashed after long walk", "A 50-minute walk was followed next day by heavy fatigue, sore muscles, and brain fog lasting into the evening.", "severe"],
    [15, "voice", "Light-headed on standing", "Brief dizziness standing up from desk, twice in one day. No falls.", "mild"],
    [19, "chat_summary", "Gradual improvement noted", "Reflected that baseline energy is better than two weeks prior; can do errands without a next-day crash if kept under 30 minutes.", "mild"],
  ];
  for (const [n, source, title, detail, severity] of danielSymptoms) {
    insertSymptom.run(randomUUID(), daniel, daysAgo(n, 15), source, title, detail, severity);
  }

  const danielDays = [
    [492, 71, 3200, 31], [505, 70, 3600, 33], [478, 72, 2900, 30],
    [512, 69, 4100, 35], [498, 70, 3800, 34], [470, 73, 2400, 28],
    [520, 68, 4400, 37], [508, 69, 4000, 35], [485, 71, 3300, 32],
    [515, 68, 4600, 38], [500, 69, 4200, 36], [522, 67, 4800, 39],
    [510, 68, 4500, 37], [518, 67, 5000, 40],
  ];
  danielDays.forEach((row, i) => {
    insertDay.run(daniel, dateOnly(13 - i), ...row);
  });

  insertBrief.run(
    randomUUID(),
    daniel,
    "Slow but steady recovery; exertion beyond ~30 minutes still triggers next-day crashes.",
    "Daniel's logs over 3 weeks show classic post-exertional patterns: activity beyond roughly 30 minutes is followed by next-day fatigue, muscle soreness, and brain fog, with the clearest crash after a 50-minute walk. He also reports palpitations on stairs and occasional light-headedness on standing. The trend is positive — wearable data shows resting heart rate down 4 bpm and HRV up ~25% across the period, with daily steps gradually increasing without a matching rise in symptom reports. He self-reports improved baseline energy in the most recent week."
  );
  } // end !hasMaya

  // ---- Patient 3: Martina Keller — menopause (MRS PROMs + report link) ----
  let martina = (db
    .prepare(`SELECT id FROM patients WHERE name = 'Martina Keller'`)
    .get() as { id: string } | undefined)?.id;

  if (!martina) {
    martina = randomUUID();
    insertPatient.run(martina, "Martina Keller", "1972-05-30", "female");
    insertLink.run(randomUUID(), doctor.id, martina, "DEMO9M", daysAgo(180));

    const insertProm = db.prepare(
      `INSERT INTO prom_scores (patient_id, instrument, item, recorded_at, score, max_score, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    function monthsAgoDate(n: number) {
      const d = new Date();
      d.setMonth(d.getMonth() - n);
      return `${d.toISOString().slice(0, 8)}01`;
    }
    /* [item, monthly scores oldest→newest, sparse notes by month index] */
    const mrs: [string, number[], Record<number, string>][] = [
      ["Hot flashes & sweating", [3, 3, 4, 3, 2, 1, 1], {
        2: "Worst month so far — flashes nearly every hour some days.",
        3: "Started the estradiol patch this week, fingers crossed.",
        5: "Down to one or two a week now.",
      }],
      ["Sleep problems", [3, 3, 3, 2, 2, 2, 1], {
        4: "The CBT-I wind-down routine seems to help with falling asleep.",
      }],
      ["Heart discomfort", [2, 2, 2, 1, 1, 1, 1], {}],
      ["Irritability", [2, 3, 2, 2, 1, 1, 1], {}],
      ["Physical & mental exhaustion", [3, 3, 3, 2, 2, 1, 2], {
        6: "A bit more tired again this month — busy stretch at work.",
      }],
      ["Anxiety", [2, 2, 1, 1, 1, 1, 1], {}],
      ["Joint & muscle discomfort", [2, 2, 2, 2, 2, 2, 2], {
        6: "Mornings still stiff, no change with the patch.",
      }],
    ];
    for (const [item, scores, notes] of mrs) {
      scores.forEach((score, i) => {
        insertProm.run(
          martina, "MRS", item,
          monthsAgoDate(scores.length - 1 - i), score, 4, notes[i] ?? null
        );
      });
    }
    /* Second instrument — proves the report renders any set of PROMs. */
    const isi = [18, 17, 15, 13, 11, 9, 8];
    isi.forEach((score, i) => {
      insertProm.run(
        martina, "ISI", "Insomnia severity (total)",
        monthsAgoDate(isi.length - 1 - i), score, 28,
        i === 4 ? "Filled in together with the sleep coach." : null
      );
    });

    const insertTreatment = db.prepare(
      `INSERT INTO treatments (id, patient_id, name, started_at, ended_at, outcome, source)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const EPR = "EPR · medatixx";
    insertTreatment.run(
      randomUUID(), martina,
      "Estradiol patch 25 µg + micronized progesterone",
      monthsAgoDate(3), null,
      "Hot flashes down from daily to 1–2 per week within 6 weeks; no side effects reported.",
      EPR
    );
    insertTreatment.run(
      randomUUID(), martina,
      "CBT-I sleep program",
      monthsAgoDate(5), monthsAgoDate(3),
      "Sleep onset improved by ~20 minutes; early waking persists on night-sweat nights.",
      EPR
    );
    insertTreatment.run(
      randomUUID(), martina,
      "Venlafaxine 37.5 mg",
      monthsAgoDate(6), monthsAgoDate(4),
      "Modest effect on hot flashes; stopped due to persistent nausea.",
      EPR
    );

    const martinaSymptoms: [number, string, string, string, string][] = [
      [1, "chat_summary", "Night sweats, woke twice", "Woke at 2 am and 4:30 am drenched; changed clothes, fell back asleep within 20 minutes both times.", "moderate"],
      [2, "voice", "Racing heart at rest", "Noticed heart pounding while reading in the evening, maybe 10 minutes. No pain. Watch showed higher pulse than usual.", "moderate"],
      [4, "voice", "Hot flash during meeting", "Single flash mid-morning, ~2 minutes, manageable. First one in five days.", "mild"],
      [8, "message", "Slept through the night", "Checked in to note the best night in months — no waking, felt rested.", "mild"],
      [12, "chat_summary", "Evening palpitations", "Fluttering sensation for a few minutes after dinner, no chest pain or dizziness. Resolved on its own.", "moderate"],
      [18, "voice", "Morning joint stiffness", "Fingers and knees stiff for about 30 minutes after waking; loosens with movement.", "mild"],
      [24, "chat_summary", "Severe hot flash episode with anxiety", "Cluster of intense flashes over one evening with racing heart and anxious mood; settled after cooling down and breathing exercises.", "severe"],
    ];
    for (const [n, source, title, detail, severity] of martinaSymptoms) {
      insertSymptom.run(randomUUID(), martina, daysAgo(n, 20), source, title, detail, severity);
    }

    /* 90 days of wearable data: gradual post-HRT improvement plus noise, with
     * a resting-HR bump over the last 3 days so the deviation flag fires. */
    const DAYS = 90;
    for (let i = 0; i < DAYS; i++) {
      const t = i / (DAYS - 1); // 0 = oldest, 1 = today
      const noise = (amp: number) => (Math.random() - 0.5) * 2 * amp;
      const daysBack = DAYS - 1 - i;
      const hrBump = daysBack <= 2 ? 8 : 0;
      insertDay.run(
        martina,
        dateOnly(daysBack),
        Math.round(415 + t * 55 + noise(25)),
        Math.round(68 - t * 5 + hrBump + noise(1.5)),
        Math.round(5500 + t * 2600 + noise(1200)),
        Math.round(36 + t * 9 + noise(3))
      );
    }

    insertBrief.run(
      randomUUID(),
      martina,
      "MRS total down 8 points since starting HRT; hot flashes and sleep are the clearest gains.",
      "Martina's Menopause Rating Scale scores have improved steadily since the estradiol patch was started 3 months ago: hot flashes & sweating from 3–4 down to 1, sleep problems from 3 to 1, with joint & muscle discomfort the only unchanged item. Her logs mirror this — night sweats now 1–2 nights per week versus nightly at baseline, and one severe flash cluster in the past month versus several. Wearable data shows sleep duration up ~35 minutes and resting heart rate down 4 bpm over the last two weeks, with night-to-night sleep variation narrowing. Earlier venlafaxine was stopped for nausea; CBT-I improved sleep onset. Open item: morning joint stiffness, unchanged by current treatment."
    );
  }

  // ---- Expiring report link (this is what the EPR PDF embeds) ----
  let reportLink = db
    .prepare(
      `SELECT token FROM report_links
        WHERE patient_id = ? AND revoked = 0 AND expires_at > datetime('now')`
    )
    .get(martina) as { token: string } | undefined;
  if (!reportLink) {
    const token = randomBytes(24).toString("base64url");
    db.prepare(
      `INSERT INTO report_links (id, token, patient_id, doctor_name, reason, timeframe_days, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+14 days'))`
    ).run(
      randomUUID(), token, martina, "Dr. Jules Rivera",
      "Follow-up: HRT review", 90
    );
    reportLink = { token };
  }

  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  console.log("Seeded demo doctor and 3 linked patients.");
  console.log(`Portal sign-in: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`Report link (as embedded in the EPR PDF): ${base}/r/${reportLink.token}`);
}

main();
