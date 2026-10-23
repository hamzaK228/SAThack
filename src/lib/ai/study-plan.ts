import { buildPlan, DOMAIN_ORDER, sectionOf, type DomainStat, type FocusDomain, type PlanTask } from "../plan";
import { daysUntil } from "../exam-date";
import { knowledgeForTopic } from "./knowledge";
import { chatCompletion } from "./llm";

export type SkillStat = {
  domain: string;
  skill: string;
  correct: number;
  total: number;
  accuracy: number | null;
};

export type Mistake = {
  domain: string;
  skill: string | null;
  difficulty: string | null;
  questionText: string;
};

export type PlanContext = {
  targetScore: number;
  currentScore: number | null;
  testDate: string | null;
  /** Minutes the student says they have on a normal day; null = let the planner decide. */
  minutesPerDay: number | null;
  domainStats: DomainStat[];
  skillStats: SkillStat[];
  mistakes: Mistake[];
};

export type GeneratedPlan = {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  insights: string[];
  tips: string[];
  source: "ai" | "local";
  weeks: number;
  daysLeft: number | null;
  targetScore: number;
  currentScore: number | null;
  gap: number | null;
  focusDomains: FocusDomain[];
  weeklyMinutes: number;
  studyDaysPerWeek: number;
  dailyMinutes: number;
  tasks: PlanTask[];
};

/**
 * The part of a plan that only an LLM (or the offline fallback) can write.
 *
 * Everything else — weeks, days left, tasks, priority order — is pure
 * arithmetic over the user's goals and results, so it is rebuilt on every
 * render from the *current* test date. The narrative is the expensive bit, and
 * `study_plans` caches it between renders (see src/lib/study-plan-data.ts).
 */
export type PlanNarrative = Pick<
  GeneratedPlan,
  "summary" | "strengths" | "weaknesses" | "insights" | "tips" | "source"
>;

/** True when `value` looks like a narrative we can safely render. */
export function isPlanNarrative(value: unknown): value is PlanNarrative {
  if (!value || typeof value !== "object") return false;
  const n = value as Record<string, unknown>;
  return (
    typeof n.summary === "string" &&
    Array.isArray(n.strengths) &&
    Array.isArray(n.weaknesses) &&
    Array.isArray(n.insights) &&
    Array.isArray(n.tips)
  );
}

function accOf(correct: number, total: number): number | null {
  if (!total) return null;
  return Math.round((correct / total) * 100);
}

function analyzeContext(ctx: PlanContext) {
  const domainMap = new Map(ctx.domainStats.map((d) => [d.domain, d]));
  const domainLines = DOMAIN_ORDER.map((d) => {
    const s = domainMap.get(d);
    const acc = s ? accOf(s.correct, s.total) : null;
    return `- ${d}: ${acc === null ? "no data" : acc + "% (" + s!.correct + "/" + s!.total + ")"}`;
  });

  const skills = [...ctx.skillStats]
    .filter((s) => s.total >= 2)
    .sort((a, b) => (a.accuracy ?? -1) - (b.accuracy ?? -1));
  const skillLines = skills.slice(0, 8).map(
    (s) => `- ${s.skill} (${s.domain}): ${s.accuracy}% (${s.correct}/${s.total})`
  );

  const bySkill = new Map<string, number>();
  const byDiff = new Map<string, number>();
  for (const m of ctx.mistakes) {
    if (m.skill) bySkill.set(m.skill, (bySkill.get(m.skill) ?? 0) + 1);
    if (m.difficulty) byDiff.set(m.difficulty, (byDiff.get(m.difficulty) ?? 0) + 1);
  }
  const topMissed = [...bySkill.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const mistakeLines = [
    ...topMissed.map(([skill, n]) => `- missed ${n}x: ${skill}`),
    ...[...byDiff.entries()].sort((a, b) => b[1] - a[1]).map(([d, n]) => `- difficulty ${d}: ${n} wrong`),
  ];
  if (mistakeLines.length === 0) mistakeLines.push("- (no mistakes recorded yet)");

  const daysLeft = ctx.testDate ? Math.max(0, daysUntil(ctx.testDate) ?? 0) : null;

  // Pacing math the planner standard is written against. Weeks mirrors
  // buildPlan's fallback (8) when no test date is set.
  const weeks = daysLeft !== null ? Math.max(1, Math.ceil(daysLeft / 7)) : 8;
  const gap = ctx.currentScore !== null ? ctx.targetScore - ctx.currentScore : null;
  const pointsPerWeek = gap !== null && gap > 0 ? Math.round(gap / weeks) : 0;

  // Both sections count equally toward the 400–1600 total, so the planner
  // needs the section-level picture, not just per-domain rows.
  const sectionTotals = { math: { correct: 0, total: 0 }, rw: { correct: 0, total: 0 } };
  for (const d of ctx.domainStats) {
    const bucket = sectionOf(d.domain) === "math" ? sectionTotals.math : sectionTotals.rw;
    bucket.correct += d.correct;
    bucket.total += d.total;
  }
  const acc = (s: { correct: number; total: number }) => (s.total ? Math.round((s.correct / s.total) * 100) : null);

  return {
    domainLines,
    skillLines,
    mistakeLines,
    daysLeft,
    weeks,
    gap,
    pointsPerWeek,
    totalAttempts: ctx.domainStats.reduce((sum, d) => sum + d.total, 0),
    mathAcc: acc(sectionTotals.math),
    rwAcc: acc(sectionTotals.rw),
  };
}

function buildPrompt(ctx: PlanContext, analysis: ReturnType<typeof analyzeContext>, bookSnippets: string[]) {
  return `You are the lead Digital SAT planner at SAThack — a professional tutor who builds week-by-week prep timelines for a living. You have deep, current command of the digital, adaptive SAT: Reading & Writing (54 questions, 64 minutes) and Math (44 questions, 70 minutes), each scored 200–800 for a 400–1600 total; section-adaptive modules with no guessing penalty; official Bluebook practice tests. Generate a personalized study plan in strict JSON.

STUDENT:
- Current score: ${ctx.currentScore ?? "unknown (needs diagnostic)"}
- Target score: ${ctx.targetScore}
- Test date: ${ctx.testDate ?? "not set"} (${analysis.daysLeft ?? "?"} days left — about ${analysis.weeks} week${analysis.weeks === 1 ? "" : "s"} of prep)
- Pace required to close the gap: ${analysis.gap !== null ? `about ${analysis.pointsPerWeek} points/week` : "establish a baseline first"}. Score gains come fastest early and taper near 1500; if this pace looks unrealistic, say so calmly and prioritize the highest-leverage moves instead of promising the gap will close.

SECTION SNAPSHOT (each section is 50% of the total):
- Math: ${analysis.mathAcc === null ? "no data" : analysis.mathAcc + "% accuracy"}
- Reading & Writing: ${analysis.rwAcc === null ? "no data" : analysis.rwAcc + "% accuracy"}
- Attempts recorded: ${analysis.totalAttempts}

PERFORMANCE BY DOMAIN (accuracy):
${analysis.domainLines.join("\n")}

WEAKEST SKILLS:
${analysis.skillLines.join("\n") || "(none yet)"}

RECENT MISTAKES:
${analysis.mistakeLines.join("\n")}

KNOWLEDGE FROM THE PLATFORM'S SAT BOOKS AND TUTOR HANDBOOK:
${bookSnippets.slice(0, 5).join("\n---\n") || "(none)"}

PLANNING STANDARD:
- Diagnose before prescribing. Base every claim on the supplied results; invent no statistics.
- Set expectations honestly against the days left. Never promise or predict a score.
- Weight weekly effort toward the weaker section, but keep both sections active every week — each is half the total.
- Think in phases and say which phase applies when: foundation (close content gaps, untimed accuracy work) → skill-building (mixed timed sets + error-log review) → test-readiness (a full-length official Bluebook test every 1–2 weeks, review-led) → taper (a light final week — confidence and logistics, no cramming).
- Make the error log the core habit: every miss re-categorized (content gap, process slip, misread, time pressure) and re-done a few days later.
- Ground tips in the book excerpts where possible; make every item concrete — what to do, how, and for how long.

Return ONLY a JSON object with these exact keys:
{
  "summary": "2-3 sentences: what to focus on and why",
  "strengths": ["up to 3 strengths"],
  "weaknesses": ["up to 5 weaknesses, each concrete"],
  "insights": ["3-5 actionable insights derived from the mistakes"],
  "tips": ["3-5 concrete study tips grounded in the book excerpts"]
}`;
}

function localPlan(ctx: PlanContext, analysis: ReturnType<typeof analyzeContext>, bookSnippets: string[]): GeneratedPlan {
  const statsMap = new Map(ctx.domainStats.map((d) => [d.domain, d]));

  const strengths = ctx.skillStats
    .filter((s) => s.total >= 3 && (s.accuracy ?? 0) >= 80)
    .sort((a, b) => (b.accuracy ?? 0) - (a.accuracy ?? 0))
    .slice(0, 3)
    .map((s) => `${s.skill} — ${s.accuracy}% accuracy`);

  const weak = ctx.skillStats
    .filter((s) => s.total >= 2)
    .sort((a, b) => (a.accuracy ?? -1) - (b.accuracy ?? -1))
    .slice(0, 5)
    .map((s) => `${s.skill} (${s.domain}) — ${s.accuracy}% over ${s.total} questions`);

  const topWeakDomains = DOMAIN_ORDER.map((d) => {
    const s = statsMap.get(d);
    return { d, acc: s ? accOf(s.correct, s.total) : null };
  })
    .sort((a, b) => (a.acc ?? -1) - (b.acc ?? -1))
    .slice(0, 3)
    .map((x) => x.d);

  const gap = ctx.currentScore !== null ? ctx.targetScore - ctx.currentScore : null;

  const summary =
    ctx.currentScore !== null
      ? `You're ${Math.max(0, gap!)} points from ${ctx.targetScore}. Over ${analysis.daysLeft ? Math.max(1, Math.ceil(analysis.daysLeft / 7)) : 8} week${(analysis.daysLeft ? Math.max(1, Math.ceil(analysis.daysLeft / 7)) : 8) === 1 ? "" : "s"}, prioritize ${topWeakDomains.join(", ")} — especially ${weak[0] ?? "your weakest skill"}.`
      : `Start with a diagnostic to establish a baseline, then focus on ${topWeakDomains.join(", ")}.`;

  const insights: string[] = [];
  const bySkill = new Map<string, number>();
  for (const m of ctx.mistakes) if (m.skill) bySkill.set(m.skill, (bySkill.get(m.skill) ?? 0) + 1);
  const topMissed = [...bySkill.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  for (const [skill, n] of topMissed) {
    insights.push(`You've missed "${skill}" ${n} time${n === 1 ? "" : "s"} — drill it every day this week.`);
  }
  if (topWeakDomains[0]) insights.push(`Your biggest gap is ${topWeakDomains[0]} — schedule it first each session.`);
  if (insights.length === 0) insights.push("Answer a few questions to unlock mistake-driven insights.");

  const tips = bookSnippets.length
    ? bookSnippets.slice(0, 3).map((s) => s.slice(0, 180))
    : ["Practice in short, focused sets and review every wrong answer the same day."];

  const plan = buildPlan({
    targetScore: ctx.targetScore,
    currentScore: ctx.currentScore,
    testDate: ctx.testDate,
    minutesPerDay: ctx.minutesPerDay,
    stats: statsMap,
    skills: ctx.skillStats,
  });

  return {
    summary,
    strengths,
    weaknesses: weak,
    insights,
    tips,
    source: "local",
    weeks: plan.weeks,
    daysLeft: plan.daysLeft,
    targetScore: ctx.targetScore,
    currentScore: ctx.currentScore,
    gap,
    focusDomains: plan.focusDomains,
    weeklyMinutes: plan.weeklyMinutes,
    studyDaysPerWeek: plan.studyDaysPerWeek,
    dailyMinutes: plan.dailyMinutes,
    tasks: plan.tasks,
  };
}

/**
 * Build a plan.
 *
 * Pass `reuse` to skip the model entirely and keep a narrative that was already
 * written for this student's current results — the week-by-week schedule is
 * still rebuilt from the live context, so a new test date lands immediately
 * instead of waiting on an LLM round trip.
 */
export async function generatePlan(
  ctx: PlanContext,
  model?: string | null,
  reuse?: PlanNarrative | null,
  /** False when the daily AI budget is exhausted: build the local narrative. */
  allowAi = true
): Promise<GeneratedPlan> {
  const analysis = analyzeContext(ctx);
  const statsMap = new Map(ctx.domainStats.map((d) => [d.domain, d]));

  const base = buildPlan({
    targetScore: ctx.targetScore,
    currentScore: ctx.currentScore,
    testDate: ctx.testDate,
    minutesPerDay: ctx.minutesPerDay,
    stats: statsMap,
    skills: ctx.skillStats,
  });
  const gap = ctx.currentScore !== null ? ctx.targetScore - ctx.currentScore : null;

  const schedule = {
    weeks: base.weeks,
    daysLeft: base.daysLeft,
    targetScore: ctx.targetScore,
    currentScore: ctx.currentScore,
    gap,
    focusDomains: base.focusDomains,
    weeklyMinutes: base.weeklyMinutes,
    studyDaysPerWeek: base.studyDaysPerWeek,
    dailyMinutes: base.dailyMinutes,
    tasks: base.tasks,
  };

  if (reuse) return { ...reuse, ...schedule };

  const weakDomains = DOMAIN_ORDER.map((d) => {
    const s = statsMap.get(d);
    return { d, acc: s ? accOf(s.correct, s.total) : null };
  })
    .sort((a, b) => (a.acc ?? -1) - (b.acc ?? -1))
    .slice(0, 3)
    .map((x) => x.d);

  const book = knowledgeForTopic(weakDomains, ctx.skillStats.slice(0, 5).map((s) => s.skill), 6);
  const bookSnippets = book.map((c) => c.text);

  const raw = allowAi
    ? await chatCompletion(buildPrompt(ctx, analysis, bookSnippets), { json: true, model })
    : "";

  if (raw) {
    try {
      const parsed = JSON.parse(raw) as {
        summary?: string;
        strengths?: string[];
        weaknesses?: string[];
        insights?: string[];
        tips?: string[];
      };
      if (parsed.summary) {
        return {
          summary: parsed.summary,
          strengths: parsed.strengths ?? [],
          weaknesses: parsed.weaknesses ?? [],
          insights: parsed.insights ?? [],
          tips: parsed.tips ?? [],
          source: "ai",
          ...schedule,
        };
      }
    } catch {
      // fall through to local
    }
  }

  return { ...localPlan(ctx, analysis, bookSnippets), ...schedule };
}
