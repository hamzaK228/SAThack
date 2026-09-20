"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import { knowledgeForTopic } from "@/lib/ai/knowledge";
import { chatCompletion } from "@/lib/ai/llm";
import { availableModels } from "@/lib/ai/models";
import { applyReview } from "@/lib/vocab";
import { regenerateStudyPlan } from "@/lib/study-plan-data";
import { QUESTION_COLUMNS, QUESTION_BATCH_SIZE, type SessionQuestion } from "@/lib/session-questions";

export async function loadSessionQuestions(ids: string[]) {
  if (!ids.length || ids.length > QUESTION_BATCH_SIZE) throw new Error("Invalid question batch.");
  const user = await getCurrentUser();
  if (!user) redirect("/auth");
  const supabase = await createClient();
  const [questions, saved] = await Promise.all([
    supabase.from("questions").select(QUESTION_COLUMNS).eq("is_official", true).eq("usable",true).in("id", ids),
    supabase.from("saved_questions").select("question_id").eq("user_id", user.id).in("question_id", ids),
  ]);
  if (questions.error || saved.error) throw new Error("Could not load questions.");
  const byId = new Map((questions.data ?? []).map((question) => [question.id, question]));
  const ordered = ids.map((id) => byId.get(id));
  if (ordered.some((question) => !question)) throw new Error("A question is no longer available. Reload the session.");
  return { questions: ordered as SessionQuestion[], savedIds: (saved.data ?? []).map((row) => row.question_id) };
}

export async function recordAttempt(input: {
  question_id: string;
  selected_answer: string | null;
}) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/auth");

  const { error } = await supabase.from("practice_attempts").insert({
    user_id: user.id,
    question_id: input.question_id,
    selected_answer: input.selected_answer,
    mode: "drill",
  });

  // Dynamic pages read fresh data on navigation; do not reload the active drill.
  return { ok: !error };
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

export async function updateUsername(usernameValue: string): Promise<{ ok: boolean; error?: string }> {
  const username = usernameValue.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    return { ok: false, error: "Use 3–24 lowercase letters, numbers, or underscores." };
  }
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/auth");

  const { error } = await supabase.from("profiles").update({ username }).eq("id", user.id);
  if (error?.code === "23505") return { ok: false, error: "That username is already taken." };
  if (error) return { ok: false, error: "Could not update your username." };

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/community");
  return { ok: true };
}

export async function toggleSave(question_id: string, saved: boolean) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/auth");

  if (!saved) {
    const { error } = await supabase.from("saved_questions").delete()
      .eq("user_id", user.id).eq("question_id", question_id);
    return { ok: !error };
  }
  const { error } = await supabase.from("saved_questions").upsert({ user_id: user.id, question_id },
    { onConflict: "user_id,question_id", ignoreDuplicates: true });
  return { ok: !error };
}

export async function askAI(input: {
  question: string;
  questionText?: string | null;
  domain?: string | null;
  skill?: string | null;
  explanation?: string | null;
}): Promise<string> {
  if (typeof input.question !== "string" || !input.question.trim() || input.question.length > 4000 ||
      [input.questionText, input.explanation].some(value => value != null && (typeof value !== "string" || value.length > 20000)) ||
      [input.domain, input.skill].some(value => value != null && (typeof value !== "string" || value.length > 200))) {
    return "Please keep your question under 4,000 characters.";
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: permitted, error: quotaError } = await supabase.rpc("consume_ai_quota");
  if (quotaError) return "The tutor is temporarily unavailable. Please try again.";
  if (!permitted) return "Please wait a few seconds before asking again. The daily limit is 50 messages.";
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
  if (ai_model !== null && !availableModels().includes(ai_model)) throw new Error("This model is not available.");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { error } = await supabase.from("profiles").upsert({ id: user.id, ai_model }, {onConflict:"id"});
  if(error) throw new Error("Could not save your model preference.");
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
