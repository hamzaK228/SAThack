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

export type PlanBundle = {
  userId: string;
  plan: PlanWithProgress;
  skillStats: SkillStat[];
  /** When this student last answered anything — the mentor notices gaps. */
  lastPractisedAt: string | null;
  /** task_key → the date until which the student pushed that step out of "today". */
  snoozed: Record<string, string>;
  /** The student's own daily budget, or null when the planner is choosing. */
  minutesPerDay: number | null;
  /** Questions this student actually answers on an average day, last 7 days. */
  recentQuestionsPerDay: number | null;
};

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
  testDate: string | null;
  model: string | null;
  attempts: Attempt[];
  correct: number;
}): string {
  // Bucket the live counts. The narrative is a coaching summary, not a
  // per-answer report; invalidating it on every attempt made the next dashboard
  // render wait on a model call. It refreshes at most every 25 attempts / 10
  // correct answers / new day.
  const attemptBucket = Math.floor(input.attempts.length / 25);
  const correctBucket = Math.floor(input.correct / 10);
  const latestDay = input.attempts[0]?.created_at?.slice(0, 10) ?? "none";
  return [
    input.targetScore,
    input.currentScore ?? "-",
    // The schedule is rebuilt on every render, but the written narrative is
    // reused — and it talks about the timeline, so moving the test date has to
    // invalidate it or the plan keeps saying "seven weeks out" when it is five.
    input.testDate ?? "no-date",
    input.model ?? "default",
    attemptBucket,
    correctBucket,
    latestDay,
  ].join("|");
}

async function loadPlan(force = false): Promise<PlanBundle | null> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("target_score, current_score, test_date, ai_model, study_minutes_per_day")
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

  // The diagnostic stores its own per-domain breakdown, and until now nothing
  // read it. A brand-new student has almost no attempts, so every domain looked
  // "new" and the plan had nothing real to aim at; seeding the gaps from the
  // diagnostic gives week one actual weaknesses to work on. Domains already
  // measured by real practice are left alone so nothing is counted twice.
  const { data: diagnostic } = await supabase
    .from("diagnostics")
    .select("domain_breakdown")
    .eq("user_id", user.id)
    .order("completed_at", { ascending: false })
    .maybeSingle();
  const breakdown = (diagnostic?.domain_breakdown ?? null) as
    | Record<string, { correct?: number; total?: number }>
    | null;
  if (breakdown) {
    for (const [domain, value] of Object.entries(breakdown)) {
      const total = Number(value?.total ?? 0);
      if (!domain || !Number.isFinite(total) || total <= 0 || statsMap.has(domain)) continue;
      statsMap.set(domain, { domain, correct: Number(value?.correct ?? 0), total });
    }
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
    minutesPerDay: profile?.study_minutes_per_day ?? null,
    domainStats: [...statsMap.values()],
    skillStats,
    mistakes,
  };

  const model = profile?.ai_model ?? null;
  const signature = planSignature({
    targetScore: ctx.targetScore,
    currentScore: ctx.currentScore,
    testDate: ctx.testDate,
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

  // A fresh narrative costs an AI call. Force (the "Re-plan" action) already
  // consumed the quota before calling in; a normal render consumes it here and
  // falls back to the local narrative when the day's budget is gone.
  let allowAi = true;
  if (!narrative && !force) {
    const { data: permitted, error: quotaError } = await supabase.rpc("consume_ai_quota");
    allowAi = !quotaError && permitted === true;
  }
  const generated = await generatePlan(ctx, model, narrative, allowAi);

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
  // Chunked: one `.in()` carrying every key of a long plan silently truncated at
  // 250, so a task ticked in a later week never came back after a reload.
  const done: Record<string, boolean> = {};
  const snoozed: Record<string, string> = {};
  const difficultyOverrides: Record<string, string> = {};
  const keys = generated.tasks.map(taskKey);
  for (let index = 0; index < keys.length; index += 200) {
    const { data: rows } = await supabase
      .from("plan_tasks")
      .select("task_key, done, snoozed_until, difficulty_override")
      .eq("user_id", user.id)
      .in("task_key", keys.slice(index, index + 200));
    for (const row of rows ?? []) {
      done[row.task_key] = row.done;
      if (row.snoozed_until) snoozed[row.task_key] = row.snoozed_until;
      if (row.difficulty_override) difficultyOverrides[row.task_key] = row.difficulty_override;
    }
  }

  // The one lever the student (or the agent, with their consent) may pull: a task's
  // difficulty. Applied after the rules have had their say, so it always wins.
  if (Object.keys(difficultyOverrides).length) {
    for (const task of generated.tasks) {
      const override = difficultyOverrides[taskKey(task)];
      if (override && task.difficulty) task.difficulty = override as typeof task.difficulty;
    }
  }

  // Work already done today counts. A domain drilled properly today means the
  // plan's task for that domain is genuinely finished, checkbox or not — the app
  // can see the answers, so it should tick the box itself.
  const today = new Date().toISOString().slice(0, 10);
  const practisedToday = new Map<string, number>();
  for (const a of attempts) {
    if (!a.created_at || a.created_at.slice(0, 10) !== today) continue;
    const domain = a.domain || "Other";
    practisedToday.set(domain, (practisedToday.get(domain) ?? 0) + 1);
  }
  for (const task of generated.tasks) {
    if (!task.domain || (task.kind !== "practice" && task.kind !== "learn")) continue;
    if ((practisedToday.get(task.domain) ?? 0) < 10) continue;
    done[taskKey(task)] = true;
  }

  // Coming back after a long gap, the plan should meet the student where they
  // are: drop the heaviest step of week one and shorten the rest. A full
  // schedule on the first day back is how a return turns into a resignation.
  const gapDays = attempts[0]?.created_at
    ? Math.floor((Date.now() - new Date(attempts[0].created_at).getTime()) / 86_400_000)
    : null;
  if (gapDays !== null && gapDays >= 5) {
    const week1 = generated.tasks.filter((task) => task.week === 1);
    const heaviest = [...week1].sort((a, b) => b.minutes - a.minutes)[0];
    if (heaviest && week1.length > 2) {
      generated.tasks = generated.tasks.filter((task) => task.id !== heaviest.id);
    }
    for (const task of generated.tasks.filter((t) => t.week === 1)) {
      task.minutes = Math.max(10, Math.round(task.minutes * 0.6));
    }
  }

  // How much this student actually does in a day. The mission is sized to this
  // rather than to what the plan assumed: someone answering ten questions a day
  // should be given one focused step, not three they will never finish.
  const weekAgo = Date.now() - 7 * 86_400_000;
  const recentAttempts = attempts.filter(
    (a) => a.created_at && new Date(a.created_at).getTime() >= weekAgo
  );
  const recentQuestionsPerDay = attempts.length ? Math.round(recentAttempts.length / 7) : null;

  // `attempts` is newest-first, so the head is the last time they answered.
  return {
    userId: user.id,
    plan: { ...generated, done },
    skillStats,
    lastPractisedAt: attempts[0]?.created_at ?? null,
    snoozed,
    minutesPerDay: profile?.study_minutes_per_day ?? null,
    recentQuestionsPerDay,
  };
}

/** Request-scoped memoised study plan (AI engine + persisted progress). */
export const getStudyPlan = cache(loadPlan);

/**
 * Same plan, but the narrative is rewritten from scratch — the "Re-plan with
 * AI" button. Also refreshes the cache every render reads.
 */
export const regenerateStudyPlan = cache(() => loadPlan(true));

