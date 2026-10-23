"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import { getStudyPlan } from "@/lib/study-plan-data";
import { taskKey } from "@/lib/plan";
import { chatCompletion } from "@/lib/ai/llm";

/**
 * "Not today." Pushes a plan step out of today's mission and brings it back
 * tomorrow — the honest escape hatch that keeps a bad evening from turning into
 * an abandoned plan. The task itself is untouched: the plan still holds it.
 */
export async function snoozePlanTask(taskKey: string): Promise<void> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return;

  const key = taskKey.trim().slice(0, 200);
  if (!key) return;

  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await supabase
    .from("plan_tasks")
    .upsert({ user_id: user.id, task_key: key, snoozed_until: tomorrow }, { onConflict: "user_id,task_key" });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/plan");
}

/** Put a snoozed step back into today's mission. */
export async function unsnoozePlanTask(taskKey: string): Promise<void> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return;

  const key = taskKey.trim().slice(0, 200);
  if (!key) return;

  await supabase
    .from("plan_tasks")
    .update({ snoozed_until: null })
    .eq("user_id", user.id)
    .eq("task_key", key);

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/plan");
}

/**
 * Record how long a normal study day is, so the plan is built inside the time the
 * student actually has instead of the time the algorithm assumed for them. An
 * empty value hands the decision back to the planner.
 */
export async function setStudyMinutes(form: FormData): Promise<void> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return;

  const raw = String(form.get("minutes") ?? "").trim();
  const minutes = raw ? Number.parseInt(raw, 10) : NaN;
  const value = Number.isFinite(minutes) ? Math.min(600, Math.max(10, minutes)) : null;

  await supabase.from("profiles").update({ study_minutes_per_day: value }).eq("id", user.id);

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/plan");
}

/**
 * Ask the model to review this student's plan and propose at most three concrete
 * changes, each with a reason. The proposals are stored as pending rows — nothing
 * is applied until the student accepts one, so the plan can never move under them
 * without their say-so.
 *
 * The agent's levers are deliberately small: push a step to tomorrow, or raise or
 * lower its difficulty. Those are the two adjustments the plan builder honours,
 * and both are reversible. Everything else stays in the rules.
 */
export async function proposePlanAdjustments(): Promise<void> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return;

  const bundle = await getStudyPlan();
  if (!bundle) return;
  const { plan, skillStats, recentQuestionsPerDay } = bundle;

  const open = plan.tasks
    .filter((task) => !plan.done[taskKey(task)] && task.kind !== "diagnostic")
    .sort((a, b) => a.week - b.week || a.day - b.day)
    .slice(0, 6);
  if (!open.length) return;

  const weak = (skillStats ?? [])
    .filter((s) => s.total >= 3 && s.accuracy !== null)
    .sort((a, b) => (a.accuracy ?? 100) - (b.accuracy ?? 100))
    .slice(0, 4)
    .map((s) => `${s.domain} → ${s.skill}: ${s.accuracy}% over ${s.total}`);

  const taskLines = open.map(
    (task) =>
      `${taskKey(task)} | ${task.title} | ${task.domain ?? "-"} | ${task.skill ?? "-"} | ${task.difficulty ?? "-"} | ${task.minutes} min`
  );

  const raw = await chatCompletion(
    [
      "You review one student's SAT study plan and return JSON only.",
      'Schema: {"adjustments":[{"task_key":"...","action":"snooze"|"harder"|"easier","title":"short label","reason":"one sentence"}]}',
      "Rules: at most 3 adjustments; task_key must come from the list below; use harder/easier only when their measured accuracy for that domain clearly justifies it; use snooze when the plan is too heavy for the time they have; if nothing should change return {\"adjustments\":[]}.",
      `STUDENT: target ${plan.targetScore}, current ${plan.currentScore ?? "unknown"}, ${plan.daysLeft ?? "?"} days left, about ${plan.dailyMinutes} min a day, answering roughly ${recentQuestionsPerDay ?? "unknown"} questions a day.`,
      weak.length ? `WEAKEST SKILLS: ${weak.join("; ")}` : "WEAKEST SKILLS: not enough data yet.",
      "TASKS (next undone):",
      ...taskLines,
    ].join("\n"),
    { json: true, temperature: 0.3, maxTokens: 900 }
  );

  let proposed: { task_key?: string; action?: string; title?: string; reason?: string }[] = [];
  try {
    const parsed = JSON.parse(raw) as { adjustments?: typeof proposed };
    proposed = Array.isArray(parsed.adjustments) ? parsed.adjustments : [];
  } catch {
    proposed = [];
  }

  const byKey = new Map(open.map((task) => [taskKey(task), task]));
  const valid = proposed
    .filter(
      (item): item is { task_key: string; action: "snooze" | "harder" | "easier"; title: string; reason: string } =>
        typeof item.task_key === "string" &&
        byKey.has(item.task_key) &&
        ["snooze", "harder", "easier"].includes(String(item.action))
    )
    .slice(0, 3)
    .map((item) => ({
      user_id: user.id,
      task_key: item.task_key,
      action: item.action,
      title: String(item.title ?? "").slice(0, 90) || byKey.get(item.task_key)!.title.slice(0, 90),
      reason: String(item.reason ?? "").slice(0, 240),
      status: "pending",
    }));

  // Fresh proposals replace the old ones: the agent never accumulates a backlog.
  await supabase.from("plan_adjustments").delete().eq("user_id", user.id).eq("status", "pending");
  if (valid.length) await supabase.from("plan_adjustments").insert(valid);

  revalidatePath("/dashboard/plan");
}

/** Accept or dismiss one proposal. Accepting is what actually changes the plan. */
export async function decidePlanAdjustment(form: FormData): Promise<void> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return;

  const id = String(form.get("id") ?? "").trim();
  const decision = String(form.get("decision") ?? "");
  if (!id || !["accept", "dismiss"].includes(decision)) return;

  const { data: row } = await supabase
    .from("plan_adjustments")
    .select("id, task_key, action")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!row) return;

  if (decision === "accept") {
    if (row.action === "snooze") {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      await supabase
        .from("plan_tasks")
        .upsert({ user_id: user.id, task_key: row.task_key, snoozed_until: tomorrow }, { onConflict: "user_id,task_key" });
    } else {
      await supabase
        .from("plan_tasks")
        .upsert(
          { user_id: user.id, task_key: row.task_key, difficulty_override: row.action === "harder" ? "hard" : "easy" },
          { onConflict: "user_id,task_key" }
        );
    }
  }

  await supabase
    .from("plan_adjustments")
    .update({ status: decision === "accept" ? "accepted" : "dismissed", decided_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/plan");
}
