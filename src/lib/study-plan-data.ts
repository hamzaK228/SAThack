import { cache } from "react";
import { createClient } from "./supabase/server";
import { getCurrentUser } from "./supabase/auth";
import {
  generatePlan,
  isPlanNarrative,
  type GeneratedPlan,
  type Mistake,
  type PlanContext,
  type PlanNarrative,
  type SkillStat,
} from "./ai/study-plan";
import { taskKey, type DomainStat } from "./plan";

/**
 * One plan, one source of truth.
 *
 * Both the dashboard ("this week's plan") and the full Study Plan page read
 * from here, so the AI engine is never bypassed and the two views can't
 * disagree. `cache()` de-duplicates the work (and the AI call) within a single
 * request render.
 *
 * The expensive part of a plan is the *narrative* (summary, strengths,
 * insights…), which is written by a model. It is cached in `study_plans` and
 * keyed by a signature of the student's results — so it survives navigation,
 * and editing a goal like the test date no longer costs an LLM round trip. The
 * schedule (weeks, days left, tasks) is pure arithmetic and is always rebuilt
 * from the current goals.
 */

export type PlanWithProgress = GeneratedPlan & {
  /** taskKey → done, persisted in `plan_tasks`. */
  done: Record<string, boolean>;
};

export type PlanBundle = { userId: string; plan: PlanWithProgress };

type Attempt = {
  question_id: string | null;
  domain: string | null;
  is_correct: boolean | null;
  created_at: string;
};

/**
 * Identity of "the results this narrative was written for".
 *
 * Deliberately excludes the test date: moving test day changes the schedule,
 * not the analysis, and must never trigger a model call on the critical path of
 * a save. Target/current score *are* included — the narrative is written around
 * them. A stored plan with a different signature is simply regenerated.
 */
function planSignature(input: {
  targetScore: number;
  currentScore: number | null;
  model: string | null;
  attempts: Attempt[];
  correct: number;
}): string {
  const latest = input.attempts[0]?.created_at ?? "none";
  return [
    input.targetScore,
    input.currentScore ?? "-",
    input.model ?? "default",
    input.attempts.length,
    input.correct,
    latest,
  ].join("|");
}

async function loadPlan(force = false): Promise<PlanBundle | null> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("target_score, current_score, test_date, ai_model")
    .eq("id", user.id)
    .maybeSingle();

  // Paginated attempts (past the 1000-row PostgREST cap).
  const attempts: Attempt[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase
      .from("practice_attempts")
      .select("question_id, domain, is_correct, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    const rows = (data ?? []) as Attempt[];
    attempts.push(...rows);
    if (rows.length < PAGE) break;
  }

  const statsMap = new Map<string, DomainStat>();
  for (const a of attempts) {
    const d = a.domain || "Other";
    const s = statsMap.get(d) || { domain: d, correct: 0, total: 0 };
    s.total += 1;
    if (a.is_correct) s.correct += 1;
    statsMap.set(d, s);
  }

  // Skill + difficulty come from the questions table.
  const qids = [...new Set(attempts.map((a) => a.question_id).filter(Boolean))] as string[];
  const qmap = new Map<string, { skill: string | null; difficulty: string }>();
  for (let i = 0; i < qids.length; i += 500) {
    const { data } = await supabase
      .from("questions")
      .select("id, skill, difficulty")
      .in("id", qids.slice(i, i + 500));
    for (const q of data ?? []) qmap.set(q.id, q);
  }

  const skillAcc = new Map<string, SkillStat>();
  for (const a of attempts) {
    if (!a.question_id) continue;
    const q = qmap.get(a.question_id);
    const skill = q?.skill?.trim() || "General";
    const domain = a.domain || "Other";
    const key = `${domain}\u0000${skill}`;
    const s = skillAcc.get(key) || { domain, skill, correct: 0, total: 0, accuracy: null };
    s.total += 1;
    if (a.is_correct) s.correct += 1;
    skillAcc.set(key, s);
  }
  const skillStats: SkillStat[] = [...skillAcc.values()].map((s) => ({
    ...s,
    accuracy: s.total ? Math.round((s.correct / s.total) * 100) : null,
  }));

  // Recent misses (with question text) feed the AI's weakness analysis.
  const wrong = attempts.filter((a) => a.is_correct === false).slice(0, 30);
  const wrongIds = [...new Set(wrong.map((a) => a.question_id).filter(Boolean))] as string[];
  const wrongMap = new Map<string, { question_text: string; skill: string | null; difficulty: string }>();
  if (wrongIds.length) {
    const { data } = await supabase
      .from("questions")
      .select("id, question_text, skill, difficulty")
      .in("id", wrongIds);
    for (const q of data ?? []) wrongMap.set(q.id, q);
  }
  const mistakes: Mistake[] = wrong.map((a) => {
    const q = a.question_id ? wrongMap.get(a.question_id) : undefined;
    return {
      domain: a.domain || "Other",
      skill: q?.skill ?? null,
      difficulty: q?.difficulty ?? null,
      questionText: (q?.question_text ?? "").slice(0, 240),
    };
  });

  const ctx: PlanContext = {
    targetScore: profile?.target_score ?? 1400,
    currentScore: profile?.current_score ?? null,
    testDate: profile?.test_date ?? null,
    domainStats: [...statsMap.values()],
    skillStats,
    mistakes,
  };

  const model = profile?.ai_model ?? null;
  const signature = planSignature({
    targetScore: ctx.targetScore,
    currentScore: ctx.currentScore,
    model,
    attempts,
    correct: attempts.filter((a) => a.is_correct).length,
  });

  // The narrative from the last generation, when it still describes these
  // results. Anything unreadable (e.g. the migration below hasn't run) just
  // means "write a new one".
  let narrative: PlanNarrative | null = null;
  if (!force) {
    const { data: saved } = await supabase
      .from("study_plans")
      .select("signature, plan")
      .eq("user_id", user.id)
      .maybeSingle();
    if (saved?.signature === signature && isPlanNarrative(saved.plan)) {
      narrative = saved.plan;
    }
  }

  const generated = await generatePlan(ctx, model, narrative);

  // Reusing the narrative leaves nothing to persist; a fresh one is saved so
  // every later render (and navigation) is instant.
  if (!narrative) {
    const next: PlanNarrative = {
      summary: generated.summary,
      strengths: generated.strengths,
      weaknesses: generated.weaknesses,
      insights: generated.insights,
      tips: generated.tips,
      source: generated.source,
    };
    await supabase.from("study_plans").upsert(
      {
        user_id: user.id,
        target_score: ctx.targetScore,
        current_score: ctx.currentScore,
        test_date: ctx.testDate,
        weeks: generated.weeks,
        summary: generated.summary,
        signature,
        plan: next,
        generated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
  }

  // Persisted check-off state (empty when the migration hasn't been applied).
  const done: Record<string, boolean> = {};
  const keys = generated.tasks.map(taskKey);
  if (keys.length) {
    const { data: rows } = await supabase
      .from("plan_tasks")
      .select("task_key, done")
      .eq("user_id", user.id)
      .in("task_key", keys.slice(0, 250));
    for (const row of rows ?? []) done[row.task_key] = row.done;
  }

  return { userId: user.id, plan: { ...generated, done } };
}

/** Request-scoped memoised study plan (AI engine + persisted progress). */
export const getStudyPlan = cache(loadPlan);

/**
 * Same plan, but the narrative is rewritten from scratch — the "Re-plan with
 * AI" button. Also refreshes the cache every render reads.
 */
export const regenerateStudyPlan = cache(() => loadPlan(true));

