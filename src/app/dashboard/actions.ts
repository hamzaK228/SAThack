"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import { knowledgeForTopic } from "@/lib/ai/knowledge";
import { chatCompletion } from "@/lib/ai/llm";
import { applyReview } from "@/lib/vocab";
import { regenerateStudyPlan } from "@/lib/study-plan-data";

export async function recordAttempt(input: {
  question_id: string;
  selected_answer: string | null;
  correct_answer: string;
  is_correct: boolean;
  section: string;
  domain: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  await supabase.from("practice_attempts").insert({
    user_id: user.id,
    question_id: input.question_id,
    selected_answer: input.selected_answer,
    correct_answer: input.correct_answer,
    is_correct: input.is_correct,
    section: input.section,
    domain: input.domain,
    mode: "drill",
  });

  // Keep the Question Bank (solved/unsolved/missed counts) and the Review Queue
  // in sync with the freshly recorded attempt.
  revalidatePath("/dashboard/question-bank");
  revalidatePath("/dashboard/review");
}

/** Server-side guard rails for the goal editor — mirrors the DB check constraints. */
function validScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 400 && value <= 1600;
}

function validTestDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const parsed = new Date(y, m - 1, d);
  return (
    parsed.getFullYear() === y && parsed.getMonth() === m - 1 && parsed.getDate() === d
  );
}

export async function updateGoals(input: {
  target_score?: number;
  current_score?: number | null;
  test_date?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/auth");

  const patch: Record<string, unknown> = {};
  if (input.target_score !== undefined) {
    if (!validScore(input.target_score)) {
      return { ok: false, error: "Target score must be between 400 and 1600." };
    }
    patch.target_score = input.target_score;
  }
  if (input.current_score !== undefined) {
    if (input.current_score !== null && !validScore(input.current_score)) {
      return { ok: false, error: "Current score must be between 400 and 1600." };
    }
    patch.current_score = input.current_score;
  }
  if (input.test_date !== undefined) {
    if (input.test_date !== null && !validTestDate(input.test_date)) {
      return { ok: false, error: "That test date doesn't look right — try picking it again." };
    }
    patch.test_date = input.test_date;
  }
  if (Object.keys(patch).length === 0) return { ok: true };

  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  const { error } = data
    ? await supabase.from("profiles").update(patch).eq("id", user.id)
    : await supabase.from("profiles").insert({ id: user.id, ...patch });

  if (error) return { ok: false, error: error.message };

  // Anything that renders the goal or the plan built from it.
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/plan");
  revalidatePath("/dashboard/analytics");
  revalidatePath("/dashboard/settings");

  return { ok: true };
}

export async function toggleSave(question_id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: existing } = await supabase
    .from("saved_questions")
    .select("id")
    .eq("user_id", user.id)
    .eq("question_id", question_id)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("saved_questions")
      .delete()
      .eq("user_id", user.id)
      .eq("question_id", question_id);
  } else {
    await supabase.from("saved_questions").insert({ user_id: user.id, question_id });
  }
}

export async function startTestSession(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data } = await supabase
    .from("test_sessions")
    .insert({
      user_id: user.id,
      status: "in_progress",
      current_module: "rw1",
      modules: { moduleIdx: 0, qIdx: 0, answers: {}, marked: [], m1: { rw: null, math: null } },
    })
    .select("id")
    .single();

  return data?.id ?? null;
}

export async function saveTestProgress(input: {
  sessionId: string;
  currentModule: string;
  progress: Record<string, unknown>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  await supabase
    .from("test_sessions")
    .update({ current_module: input.currentModule, modules: input.progress })
    .eq("id", input.sessionId)
    .eq("user_id", user.id);
}

export async function completeTestSession(input: {
  sessionId: string | null;
  rw_correct: number;
  math_correct: number;
  rw_score: number;
  math_score: number;
  total_score: number;
  attempts: {
    question_id: string;
    selected_answer: string | null;
    correct_answer: string;
    is_correct: boolean;
    section: string;
    domain: string;
  }[];
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  if (input.attempts.length > 0) {
    await supabase.from("practice_attempts").insert(
      input.attempts.map((a) => ({
        user_id: user.id,
        question_id: a.question_id,
        selected_answer: a.selected_answer,
        correct_answer: a.correct_answer,
        is_correct: a.is_correct,
        section: a.section,
        domain: a.domain,
        mode: "full_test",
      }))
    );
  }

  const result = {
    status: "completed",
    rw_correct: input.rw_correct,
    math_correct: input.math_correct,
    rw_score: input.rw_score,
    math_score: input.math_score,
    total_score: input.total_score,
    completed_at: new Date().toISOString(),
    modules: {},
  };

  if (input.sessionId) {
    await supabase
      .from("test_sessions")
      .update(result)
      .eq("id", input.sessionId)
      .eq("user_id", user.id);
  } else {
    await supabase.from("test_sessions").insert({
      user_id: user.id,
      current_module: "done",
      ...result,
    });
  }
}

export async function askAI(input: {
  question: string;
  questionText?: string | null;
  domain?: string | null;
  skill?: string | null;
  explanation?: string | null;
}): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: profile } = await supabase
    .from("profiles")
    .select("ai_model")
    .eq("id", user.id)
    .maybeSingle();

  const domains = input.domain ? [input.domain] : [];
  const skills = input.skill ? [input.skill] : [];
  const chunks = knowledgeForTopic(domains, skills, 4);
  const context = chunks.map((c) => `[${c.book} p.${c.page}] ${c.text}`).join("\n\n");

  const prompt = `You are an expert Digital SAT tutor. Answer the student's question using the book excerpts below when relevant. Be concise, clear, and encouraging.

QUESTION: ${input.question}
${input.questionText ? `QUESTION TEXT: ${input.questionText}` : ""}
${input.explanation ? `OFFICIAL EXPLANATION (for reference): ${input.explanation}` : ""}
${input.domain ? `TOPIC: ${input.domain}${input.skill ? ` — ${input.skill}` : ""}` : ""}

SAT BOOK EXCERPTS:
${context || "(none)"}`;

  const answer = await chatCompletion(prompt, { temperature: 0.5, model: profile?.ai_model ?? null });
  if (answer.trim()) return answer.trim();

  if (context) return `From your SAT books:\n\n${context.slice(0, 1400)}`;
  if (input.explanation) return `📖 ${input.explanation}`;
  return "I don't have a specific answer for that yet. Try asking about an SAT topic, skill, or strategy.";
}


export async function updateAIModel(ai_model: string | null) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (data) {
    await supabase.from("profiles").update({ ai_model }).eq("id", user.id);
  } else {
    await supabase.from("profiles").insert({ id: user.id, ai_model });
  }
}



export async function toggleSaveVocab(word_id: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: existing } = await supabase
    .from("vocab_progress")
    .select("id, saved")
    .eq("user_id", user.id)
    .eq("word_id", word_id)
    .maybeSingle();

  const next = !(existing?.saved ?? false);

  let error: { message: string } | null = null;
  if (existing) {
    ({ error } = await supabase
      .from("vocab_progress")
      .update({ saved: next })
      .eq("id", existing.id));
  } else {
    ({ error } = await supabase.from("vocab_progress").insert({
      user_id: user.id,
      word_id: word_id,
      saved: next,
    }));
  }

  if (!error) revalidatePath("/dashboard/vocab");
  return { ok: !error };
}


/**
 * Spaced repetition for one word.
 * "Know it" pushes the next review 1 → 2 → 4 → 7 → 14 → 30 days out; "Review
 * again" resets mastery so the word comes back immediately.
 */
export async function reviewVocab(word_id: string, known: boolean): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: existing, error: readErr } = await supabase
    .from("vocab_progress")
    .select("id, mastery, times_seen, times_correct")
    .eq("user_id", user.id)
    .eq("word_id", word_id)
    .maybeSingle();

  const patch = applyReview(
    {
      mastery: existing?.mastery ?? 0,
      times_seen: existing?.times_seen ?? 0,
      times_correct: existing?.times_correct ?? 0,
    },
    known
  );

  let error: { message: string } | null = readErr;
  if (!error && existing) {
    ({ error } = await supabase.from("vocab_progress").update(patch).eq("id", existing.id));
  } else if (!error) {
    ({ error } = await supabase.from("vocab_progress").insert({
      user_id: user.id,
      word_id,
      saved: false,
      ...patch,
    }));
  }

  if (!error) revalidatePath("/dashboard/vocab");
  return { ok: !error };
}


/**
 * Tick a study-plan task off (or back on). Keyed by the task's stable key, so
 * progress survives the plan being regenerated.
 */
export async function setPlanTaskDone(input: {
  task_key: string;
  week: number;
  title: string;
  kind: string;
  domain: string | null;
  minutes: number;
  done: boolean;
}): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/auth");

  const { error } = await supabase.from("plan_tasks").upsert(
    {
      user_id: user.id,
      task_key: input.task_key,
      week: input.week,
      title: input.title,
      kind: input.kind,
      domain: input.domain,
      minutes: input.minutes,
      done: input.done,
      completed_at: input.done ? new Date().toISOString() : null,
    },
    { onConflict: "user_id,task_key" }
  );

  // Report the failure so the checklist can put the tick back.
  if (error) return { ok: false };

  revalidatePath("/dashboard/plan");
  revalidatePath("/dashboard");
  return { ok: true };
}


/**
 * Let the AI re-plan from scratch: rebuild the narrative from the latest
 * results and save it, so the dashboard and the Study Plan page both pick it up.
 * The plan itself is still produced by one engine (src/lib/study-plan-data.ts) —
 * this only forces it to ignore the plan it already had.
 */
export async function regeneratePlan() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");

  const bundle = await regenerateStudyPlan();
  if (!bundle) return;

  revalidatePath("/dashboard/plan");
  revalidatePath("/dashboard");
}


export async function saveDiagnostic(input: {
  rw_correct: number;
  rw_total: number;
  math_correct: number;
  math_total: number;
  domain_breakdown: Record<string, { correct: number; total: number }>;
  attempts: {
    question_id: string;
    selected_answer: string | null;
    correct_answer: string;
    is_correct: boolean;
    section: string;
    domain: string;
  }[];
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const rwScore = 200 + Math.round((input.rw_correct / Math.max(1, input.rw_total)) * 600);
  const mathScore = 200 + Math.round((input.math_correct / Math.max(1, input.math_total)) * 600);
  const total = rwScore + mathScore;

  if (input.attempts.length > 0) {
    await supabase.from("practice_attempts").insert(
      input.attempts.map((a) => ({
        user_id: user.id,
        question_id: a.question_id,
        selected_answer: a.selected_answer,
        correct_answer: a.correct_answer,
        is_correct: a.is_correct,
        section: a.section,
        domain: a.domain,
        mode: "module",
      }))
    );
  }

  await supabase.from("diagnostics").insert({
    user_id: user.id,
    rw_score: rwScore,
    math_score: mathScore,
    total_score: total,
    rw_module1_raw: input.rw_correct,
    math_module1_raw: input.math_correct,
    domain_breakdown: input.domain_breakdown,
    completed_at: new Date().toISOString(),
  });

  // Set the baseline score if the user hasn't set one manually.
  const { data: profile } = await supabase
    .from("profiles")
    .select("current_score")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.current_score) {
    await supabase.from("profiles").update({ current_score: total }).eq("id", user.id);
  }

  return { rwScore, mathScore, total };
}
