import { cache } from "react";
import { createClient } from "./supabase/server";
import {
  generatePlan,
  type GeneratedPlan,
  type Mistake,
  type PlanContext,
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

async function loadPlan(): Promise<PlanBundle | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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

  const base = await generatePlan(ctx, profile?.ai_model ?? null);

  // Persisted check-off state (empty when the migration hasn't been applied).
  const done: Record<string, boolean> = {};
  const keys = base.tasks.map(taskKey);
  if (keys.length) {
    const { data: rows } = await supabase
      .from("plan_tasks")
      .select("task_key, done")
      .eq("user_id", user.id)
      .in("task_key", keys.slice(0, 250));
    for (const row of rows ?? []) done[row.task_key] = row.done;
  }

  return { userId: user.id, plan: { ...base, done } };
}

/** Request-scoped memoised study plan (AI engine + persisted progress). */
export const getStudyPlan = cache(loadPlan);
