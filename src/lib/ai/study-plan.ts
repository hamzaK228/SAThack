import { buildPlan, DOMAIN_ORDER, type DomainStat, type FocusDomain, type PlanTask } from "../plan";
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
  tasks: PlanTask[];
};

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

  const daysLeft = ctx.testDate
    ? Math.max(0, Math.ceil((new Date(ctx.testDate).getTime() - Date.now()) / 86400000))
    : null;

  return { domainLines, skillLines, mistakeLines, daysLeft };
}

function buildPrompt(ctx: PlanContext, analysis: ReturnType<typeof analyzeContext>, bookSnippets: string[]) {
  return `You are an expert Digital SAT tutor. Generate a personalized study plan in strict JSON.

STUDENT:
- Current score: ${ctx.currentScore ?? "unknown (needs diagnostic)"}
- Target score: ${ctx.targetScore}
- Test date: ${ctx.testDate ?? "not set"} (${analysis.daysLeft ?? "?"} days left)

PERFORMANCE BY DOMAIN (accuracy):
${analysis.domainLines.join("\n")}

WEAKEST SKILLS:
${analysis.skillLines.join("\n") || "(none yet)"}

RECENT MISTAKES:
${analysis.mistakeLines.join("\n")}

RELEVANT KNOWLEDGE FROM SAT BOOKS:
${bookSnippets.slice(0, 4).join("\n---\n") || "(none)"}

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
      ? `You're ${Math.max(0, gap!)} points from ${ctx.targetScore}. Over ${analysis.daysLeft ? Math.max(1, Math.ceil(analysis.daysLeft / 7)) : 8} weeks, prioritize ${topWeakDomains.join(", ")} — especially ${weak[0] ?? "your weakest skill"}.`
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
    stats: statsMap,
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
    tasks: plan.tasks,
  };
}

export async function generatePlan(ctx: PlanContext, model?: string | null): Promise<GeneratedPlan> {
  const analysis = analyzeContext(ctx);
  const statsMap = new Map(ctx.domainStats.map((d) => [d.domain, d]));

  const weakDomains = DOMAIN_ORDER.map((d) => {
    const s = statsMap.get(d);
    return { d, acc: s ? accOf(s.correct, s.total) : null };
  })
    .sort((a, b) => (a.acc ?? -1) - (b.acc ?? -1))
    .slice(0, 3)
    .map((x) => x.d);

  const book = knowledgeForTopic(weakDomains, ctx.skillStats.slice(0, 5).map((s) => s.skill));
  const bookSnippets = book.map((c) => c.text);

  const base = buildPlan({
    targetScore: ctx.targetScore,
    currentScore: ctx.currentScore,
    testDate: ctx.testDate,
    stats: statsMap,
  });
  const gap = ctx.currentScore !== null ? ctx.targetScore - ctx.currentScore : null;

  const raw = await chatCompletion(buildPrompt(ctx, analysis, bookSnippets), { json: true, model });

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
          weeks: base.weeks,
          daysLeft: base.daysLeft,
          targetScore: ctx.targetScore,
          currentScore: ctx.currentScore,
          gap,
          focusDomains: base.focusDomains,
          tasks: base.tasks,
        };
      }
    } catch {
      // fall through to local
    }
  }

  return localPlan(ctx, analysis, bookSnippets);
}

