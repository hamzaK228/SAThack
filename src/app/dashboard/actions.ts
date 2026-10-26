"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import { blendKnowledge, formatKnowledge } from "@/lib/ai/knowledge";
import { chat, chatCompletion } from "@/lib/ai/llm";
import { availableModels } from "@/lib/ai/models";
import { buildTutorSystem } from "@/lib/ai/tutor";
import { getTutorContext } from "@/lib/tutor-context";
import { daysUntil } from "@/lib/exam-date";
import { applyReview } from "@/lib/vocab";
import { regenerateStudyPlan } from "@/lib/study-plan-data";
import { QUESTION_COLUMNS, QUESTION_BATCH_SIZE, type SessionQuestion } from "@/lib/session-questions";

export async function loadSessionQuestions(
  ids: string[],
  opts?: { officialOnly?: boolean }
) {
  if (!ids.length || ids.length > QUESTION_BATCH_SIZE) throw new Error("Invalid question batch.");
  const user = await getCurrentUser();
  if (!user) redirect("/auth");
  const supabase = await createClient();
  // Review sessions may contain practice-test questions (is_official=false);
  // drills stay inside the official bank.
  let questionQuery = supabase.from("questions").select(QUESTION_COLUMNS).in("id", ids);
  if (opts?.officialOnly !== false) questionQuery = questionQuery.eq("is_official", true).eq("usable", true);
  const [questions, saved] = await Promise.all([
    questionQuery,
    supabase.from("saved_questions").select("question_id").eq("user_id", user.id).in("question_id", ids),
  ]);
  if (questions.error || saved.error) throw new Error("Could not load questions.");
  const byId = new Map((questions.data ?? []).map((question) => [question.id, question]));
  const ordered = ids.map((id) => byId.get(id));
  if (ordered.some((question) => !question)) throw new Error("A question is no longer available. Reload the session.");
  return { questions: ordered as SessionQuestion[], savedIds: (saved.data ?? []).map((row) => row.question_id) };
}

/**
 * Grade one drill answer without exposing the answer key to the browser.
 *
 * When `record` is set (first attempt on a question) the insert lands in
 * `practice_attempts`, where the `grade_attempt` trigger grades it against the
 * stored answer server-side. Retries of a missed question are graded by a
 * read-only compare; a retry that lands the correct answer is recorded once,
 * because that correction is the mastery signal the review queue listens for.
 * The dashboard's "Questions" stat counts distinct questions, so this extra
 * row never double-counts a question the student practiced once.
 */
export async function checkAttempt(input: {
  question_id: string;
  selected_answer: string | null;
  record: boolean;
  /** Mastery retries must create a fresh row even when the answer repeats. */
  force?: boolean;
}): Promise<{ ok: boolean; correct?: boolean; explanation?: string | null; recorded?: boolean }> {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/auth");
  const answer = (input.selected_answer ?? "").trim();
  if (!answer || answer.length > 200) return { ok: false };

  if (input.record) {
    // A slow-but-successful save can show the client an error, and its retry
    // would insert a second row for the same answer. Coalesce attempts made
    // within the last minute: treat the most recent one as THE attempt.
    if (!input.force) {
      const { data: recent } = await supabase
        .from("practice_attempts")
        .select("id, is_correct, selected_answer")
        .eq("user_id", user.id)
        .eq("question_id", input.question_id)
        .eq("mode", "drill")
        .gte("created_at", new Date(Date.now() - 60_000).toISOString())
        .order("created_at", { ascending: false })
        .limit(1);
      // Coalesce only the same answer submitted twice (a slow save plus its
      // retry). A different answer — e.g. the second try in a mastery set — must
      // be inserted and graded on its own.
      if (recent && recent.length > 0 && recent[0].selected_answer === answer) {
        const correct = recent[0].is_correct === true;
        return { ok: true, correct, explanation: correct ? await fetchExplanation(supabase, input.question_id) : null, recorded: true };
      }
    }
    // The write is server-mediated: record_attempt() re-checks the question,
    // rate-limits, inserts and returns the trigger's verdict. The browser no
    // longer has INSERT on practice_attempts.
    const { data: recorded, error } = await supabase.rpc("record_attempt", {
      p_question_id: input.question_id,
      p_answer: answer,
    });
    const row = (Array.isArray(recorded) ? recorded[0] : recorded) as
      | { id?: string; is_correct?: boolean }
      | null;
    if (error || !row) return { ok: false };
    const correct = row.is_correct === true;
    const explanation = correct ? await fetchExplanation(supabase, input.question_id) : null;
    return { ok: true, correct, explanation, recorded: true };
  }

  // Retry path: the student already has a wrong attempt on this question.
  // check_answer() returns only a boolean and refuses without that history;
  // a correct retry is then recorded once so mastery/review sees it.
  const { data: correctAnswer, error: checkError } = await supabase.rpc("check_answer", {
    p_question_id: input.question_id,
    p_answer: answer,
  });
  if (checkError) return { ok: false };
  if (correctAnswer !== true) return { ok: true, correct: false };

  const { error: recordError } = await supabase.rpc("record_attempt", {
    p_question_id: input.question_id,
    p_answer: answer,
  });
  const explanation = await fetchExplanation(supabase, input.question_id);
  return { ok: true, correct: true, explanation, recorded: !recordError };
}

async function fetchExplanation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  questionId: string
): Promise<string | null> {
  const { data, error } = await supabase.rpc("reveal_answer", { p_question_id: questionId });
  if (error) return null;
  const row = (Array.isArray(data) ? data[0] : data) as { explanation?: string | null } | null;
  return row?.explanation ?? null;
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
    if (!error) revalidatePath("/dashboard/saved");
    return { ok: !error };
  }
  const { error } = await supabase.from("saved_questions").upsert({ user_id: user.id, question_id },
    { onConflict: "user_id,question_id", ignoreDuplicates: true });
  if (!error) revalidatePath("/dashboard/saved");
  return { ok: !error };
}

/** Tutor chat keeps a short memory: the last few turns, each tightly capped. */
const HISTORY_TURNS = 8;
const HISTORY_MESSAGE_CAP = 2000;

type HistoryTurn = { role: "user" | "assistant"; content: string };

/** Validate and trim client-supplied chat history before it reaches the model. */
function sanitizeHistory(history: unknown): HistoryTurn[] {
  if (!Array.isArray(history)) return [];
  return history
    .filter(
      (m): m is HistoryTurn =>
        !!m &&
        typeof m === "object" &&
        ((m as { role?: unknown }).role === "user" || (m as { role?: unknown }).role === "assistant") &&
        typeof (m as { content?: unknown }).content === "string" &&
        (m as { content: string }).content.trim().length > 0
    )
    .slice(-HISTORY_TURNS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, HISTORY_MESSAGE_CAP) }));
}

export async function askAI(input: {
  question: string;
  history?: HistoryTurn[];
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
  const history = sanitizeHistory(input.history);
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
    .select("ai_model, target_score, current_score, test_date")
    .eq("id", user.id)
    .maybeSingle();

  // Two retrieval signals: what the student literally asked, and what the
  // current topic (domain/skill) is about — the tutor page sends only the
  // question, the practice-question modal also sends the topic.
  const domains = input.domain ? [input.domain] : [];
  const skills = input.skill ? [input.skill] : [];
  const chunks = blendKnowledge(input.question, domains, skills, 6);
  const context = formatKnowledge(chunks);

  const userContent = [
    `QUESTION: ${input.question}`,
    input.questionText ? `QUESTION TEXT: ${input.questionText}` : "",
    input.explanation ? `OFFICIAL EXPLANATION (for reference): ${input.explanation}` : "",
    input.domain ? `TOPIC: ${input.domain}${input.skill ? ` — ${input.skill}` : ""}` : "",
    "",
    "SAT BOOK EXCERPTS:",
    context || "(none)",
  ]
    .filter((line) => line !== "")
    .join("\n");

  // The mentor answers better when it knows the student: their weakest measured
  // skills, the steps they were actually assigned today, and their streak.
  const tutorContext = await getTutorContext();

  const answer = await chat(
    [
      {
        role: "system",
        content: buildTutorSystem({
          currentScore: profile?.current_score ?? null,
          targetScore: profile?.target_score ?? null,
          testDate: profile?.test_date ?? null,
          daysLeft: profile?.test_date ? daysUntil(profile.test_date) : null,
          weakSkills: tutorContext?.weakSkills,
          mission: tutorContext?.mission.map((step) => ({ title: step.title, minutes: step.minutes })),
          streak: tutorContext?.streak,
        }),
      },
      ...history,
      { role: "user", content: userContent },
    ],
    { temperature: 0.5, model: profile?.ai_model ?? null }
  );
  if (answer.trim()) return answer.trim();

  if (context) return `From your SAT books:\n\n${context.slice(0, 1400)}`;
  if (input.explanation) return `📖 ${input.explanation}`;
  return "I don't have a specific answer for that yet. Try asking about an SAT topic, skill, or strategy.";
}

export async function draftVocabSuggestion(wordValue: string): Promise<{
  ok: boolean;
  error?: string;
  draft?: { definition: string; example: string; tags: string };
}> {
  const word = wordValue.trim().slice(0, 80);
  if (word.length < 2) return { ok: false, error: "Enter a word first." };
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/auth");
  const { data: permitted, error: quotaError } = await supabase.rpc("consume_ai_quota");
  if (quotaError || !permitted) return { ok: false, error: "AI drafting is temporarily unavailable. You can enter the meaning yourself." };
  const raw = await chatCompletion(
    `Create a student-friendly SAT vocabulary entry for "${word}". Return JSON only with definition, example, and tags. Definition must be precise, example must make the meaning inferable from context, and tags must be an array of at most 4 short strings.`,
    { json: true, temperature: 0.2 },
  );
  try {
    const value = JSON.parse(raw) as { definition?: string; example?: string; tags?: string[] };
    if (!value.definition) throw new Error("missing definition");
    return { ok: true, draft: { definition: value.definition.slice(0, 800), example: (value.example ?? "").slice(0, 800), tags: (value.tags ?? []).slice(0, 4).join(", ") } };
  } catch {
    return { ok: false, error: "AI could not draft this entry. Try again or write it manually." };
  }
}

export async function submitVocabSuggestion(input: {
  word: string;
  definition: string;
  example: string;
  tags: string;
  aiAssisted: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const word = input.word.trim().slice(0, 80);
  const definition = input.definition.trim().slice(0, 800);
  const example = input.example.trim().slice(0, 800);
  const tags = input.tags.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 8);
  if (word.length < 2 || definition.length < 3) return { ok: false, error: "Add a word and a clear definition." };
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/auth");
  const { error } = await supabase.from("vocab_suggestions").insert({
    user_id: user.id,
    word,
    definition,
    example_sentence: example,
    tags,
    ai_assisted: input.aiAssisted,
  });
  if (error) return { ok: false, error: "Could not submit this word. The contribution feature may need the latest database migration." };
  revalidatePath("/dashboard/vocab");
  return { ok: true };
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


/* ---------------------------------------------------------------------------
 * Custom vocab lists — "folders" of words a student groups themselves.
 * Lists are private (RLS: owner only); a word can sit in several lists and
 * keeps one shared spaced-repetition schedule either way.
 * ------------------------------------------------------------------------- */

const VOCAB_LIST_LIMIT = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Trim, collapse whitespace, drop control characters, cap at the DB's 60. */
function normalizeListName(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 60);
}

const VOCAB_LIST_COLORS = new Set(["lime", "sky", "rose", "amber", "violet", "teal"]);

type VocabListFields = {
  id: string;
  name: string;
  description: string;
  emoji: string;
  color: string;
};

function cleanVocabText(value: string, max: number): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, max);
}

function normalizeEmoji(value: string | undefined): string {
  const emoji = (value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 8);
  return emoji || "📁";
}

function normalizeListColor(value: string | undefined): string {
  const color = (value ?? "").trim().toLowerCase();
  return VOCAB_LIST_COLORS.has(color) ? color : "lime";
}

function normalizeTags(value: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of value.split(",")) {
    const tag = cleanVocabText(raw, 30);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length >= 8) break;
  }
  return tags;
}

export async function createVocabList(
  nameValue: string,
  options?: { emoji?: string; color?: string }
): Promise<{
  ok: boolean;
  error?: string;
  list?: VocabListFields;
}> {
  const name = normalizeListName(nameValue);
  if (!name) return { ok: false, error: "Give your list a name (1–60 characters)." };
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/auth");

  // Soft cap — keeps the add-to-list picker and the lists page readable.
  const { count } = await supabase
    .from("vocab_lists")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if ((count ?? 0) >= VOCAB_LIST_LIMIT) {
    return { ok: false, error: `You've reached the ${VOCAB_LIST_LIMIT}-list limit. Delete one to make room.` };
  }

  const { data, error } = await supabase
    .from("vocab_lists")
    .insert({
      user_id: user.id,
      name,
      emoji: normalizeEmoji(options?.emoji),
      color: normalizeListColor(options?.color),
    })
    .select("id, name, description, emoji, color")
    .single();
  if (error?.code === "23505") return { ok: false, error: `You already have a list called “${name}”.` };
  if (error || !data) return { ok: false, error: "Could not create the list — the database migration may not be applied yet." };

  revalidatePath("/dashboard/vocab");
  return { ok: true, list: data as VocabListFields };
}

/** Edit the preview card: name, note, icon and accent colour in one call. */
export async function updateVocabList(
  list_id: string,
  patch: { name?: string; description?: string; emoji?: string; color?: string }
): Promise<{ ok: boolean; error?: string; list?: VocabListFields }> {
  if (!UUID_RE.test(list_id)) return { ok: false, error: "That list no longer exists." };
  const update: Record<string, string> = {};

  if (patch.name !== undefined) {
    const name = normalizeListName(patch.name);
    if (!name) return { ok: false, error: "Give your list a name (1–60 characters)." };
    update.name = name;
  }
  if (patch.description !== undefined) update.description = cleanVocabText(patch.description, 160);
  if (patch.emoji !== undefined) update.emoji = normalizeEmoji(patch.emoji);
  if (patch.color !== undefined) {
    const color = (patch.color ?? "").trim().toLowerCase();
    if (!VOCAB_LIST_COLORS.has(color)) return { ok: false, error: "Choose one of the preview colours." };
    update.color = color;
  }
  if (!Object.keys(update).length) return { ok: false, error: "Nothing to change." };

  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/auth");

  const { data, error } = await supabase
    .from("vocab_lists")
    .update(update)
    .eq("id", list_id)
    .eq("user_id", user.id)
    .select("id, name, description, emoji, color")
    .maybeSingle();
  if (error?.code === "23505") return { ok: false, error: `You already have a list called “${update.name ?? ""}”.` };
  if (error || !data) return { ok: false, error: "Could not update the list preview." };

  revalidatePath("/dashboard/vocab");
  return { ok: true, list: data as VocabListFields };
}

export async function renameVocabList(list_id: string, nameValue: string): Promise<{ ok: boolean; error?: string; name?: string }> {
  const result = await updateVocabList(list_id, { name: nameValue });
  return { ok: result.ok, error: result.error, name: result.list?.name };
}

export async function deleteVocabList(list_id: string): Promise<{ ok: boolean; error?: string }> {
  if (!UUID_RE.test(list_id)) return { ok: false, error: "That list no longer exists." };
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/auth");

  // Items cascade with the list; RLS means only this user's list can match.
  const { error } = await supabase.from("vocab_lists").delete().eq("id", list_id);
  if (error) return { ok: false, error: "Could not delete the list." };

  revalidatePath("/dashboard/vocab");
  return { ok: true };
}

/**
 * Put a word in / take it out of one list. Deliberately does NOT revalidate:
 * the card updates optimistically and tab counts are refetched on navigation,
 * so re-rendering the whole page per checkbox tick is pure latency.
 */
export async function toggleWordInList(word_id: string, list_id: string): Promise<{ ok: boolean; inList?: boolean; error?: string }> {
  if (!UUID_RE.test(word_id) || !UUID_RE.test(list_id)) return { ok: false, error: "That word or list no longer exists." };
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/auth");

  const { data: existing } = await supabase
    .from("vocab_list_items")
    .select("word_id")
    .eq("list_id", list_id)
    .eq("word_id", word_id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from("vocab_list_items").delete().eq("list_id", list_id).eq("word_id", word_id);
    if (error) return { ok: false, error: "Could not update the list." };
    return { ok: true, inList: false };
  }

  const { error } = await supabase.from("vocab_list_items").insert({ list_id, word_id });
  if (error) return { ok: false, error: "Could not update the list." };
  return { ok: true, inList: true };
}

/* ---------------------------------------------------------------------------
 * Personal vocab words — ones the curated bank does not contain.
 * A personal row is a vocab_words row with owner_id = the student. RLS hides
 * it from everyone else, and the unique index is per owner.
 * ------------------------------------------------------------------------- */

const CUSTOM_WORD_MAX = 60;
const CUSTOM_DEFINITION_MAX = 500;
const CUSTOM_EXAMPLE_MAX = 500;

function normalizeCustomWord(value: string): string {
  return cleanVocabText(value, CUSTOM_WORD_MAX);
}

function likePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

export async function createVocabWord(input: {
  list_id: string;
  word: string;
  definition: string;
  example?: string;
  tags?: string;
}): Promise<{ ok: boolean; error?: string; wordId?: string; word?: string; existing?: boolean }> {
  if (!UUID_RE.test(input.list_id)) return { ok: false, error: "That list no longer exists." };
  const word = normalizeCustomWord(input.word);
  const definition = cleanVocabText(input.definition, CUSTOM_DEFINITION_MAX);
  const example = cleanVocabText(input.example ?? "", CUSTOM_EXAMPLE_MAX);
  if (word.length < 1) return { ok: false, error: "Add the word." };
  if (definition.length < 1) return { ok: false, error: "Add a short definition so the card is useful." };

  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/auth");

  const { data: list } = await supabase
    .from("vocab_lists")
    .select("id")
    .eq("id", input.list_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!list) return { ok: false, error: "That list no longer belongs to you." };

  const pattern = likePattern(word);

  async function attach(wordId: string, existingWord: string, existing: boolean) {
    const { error } = await supabase.from("vocab_list_items").upsert(
      { list_id: input.list_id, word_id: wordId },
      { onConflict: "list_id,word_id", ignoreDuplicates: true }
    );
    if (error) return { ok: false, error: "Could not add the word to this list." };
    revalidatePath("/dashboard/vocab");
    return { ok: true, wordId, word: existingWord, existing };
  }

  // A curated word with the same spelling is already available; reuse it.
  const { data: bankWord } = await supabase
    .from("vocab_words")
    .select("id, word")
    .is("owner_id", null)
    .ilike("word", pattern)
    .maybeSingle();
  if (bankWord) return attach(bankWord.id as string, bankWord.word as string, true);

  // Or this student already made the same personal word.
  const { data: ownWord } = await supabase
    .from("vocab_words")
    .select("id, word")
    .eq("owner_id", user.id)
    .ilike("word", pattern)
    .maybeSingle();
  if (ownWord) return attach(ownWord.id as string, ownWord.word as string, true);

  const { data: created, error } = await supabase
    .from("vocab_words")
    .insert({
      owner_id: user.id,
      word,
      definition,
      example_sentence: example || null,
      tags: normalizeTags(input.tags ?? ""),
    })
    .select("id, word")
    .single();

  if (error?.code === "23505") {
    const { data: raced } = await supabase
      .from("vocab_words")
      .select("id, word")
      .eq("owner_id", user.id)
      .ilike("word", pattern)
      .maybeSingle();
    if (raced) return attach(raced.id as string, raced.word as string, true);
  }
  if (error || !created) return { ok: false, error: "Could not save your word. Try a different spelling." };

  const linked = await attach(created.id as string, created.word as string, false);
  if (!linked.ok) {
    // Do not leave an orphan personal word if membership failed.
    await supabase.from("vocab_words").delete().eq("id", created.id).eq("owner_id", user.id);
  }
  return linked;
}

export async function updateCustomVocabWord(input: {
  word_id: string;
  word: string;
  definition: string;
  example?: string;
  tags?: string;
}): Promise<{ ok: boolean; error?: string; word?: string }> {
  if (!UUID_RE.test(input.word_id)) return { ok: false, error: "That word no longer exists." };
  const word = normalizeCustomWord(input.word);
  const definition = cleanVocabText(input.definition, CUSTOM_DEFINITION_MAX);
  const example = cleanVocabText(input.example ?? "", CUSTOM_EXAMPLE_MAX);
  if (word.length < 1) return { ok: false, error: "Add the word." };
  if (definition.length < 1) return { ok: false, error: "Add a short definition." };

  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/auth");

  const { data: bankWord } = await supabase
    .from("vocab_words")
    .select("id")
    .is("owner_id", null)
    .ilike("word", likePattern(word))
    .neq("id", input.word_id)
    .maybeSingle();
  if (bankWord) return { ok: false, error: "That word is already in the general bank. Remove this personal one instead." };

  const { data, error } = await supabase
    .from("vocab_words")
    .update({
      word,
      definition,
      example_sentence: example || null,
      tags: normalizeTags(input.tags ?? ""),
    })
    .eq("id", input.word_id)
    .eq("owner_id", user.id)
    .select("id, word")
    .maybeSingle();
  if (error?.code === "23505") return { ok: false, error: "You already have a personal word with that spelling." };
  if (error || !data) return { ok: false, error: "Could not update this personal word." };

  revalidatePath("/dashboard/vocab");
  return { ok: true, word: data.word as string };
}

export async function deleteCustomVocabWord(word_id: string): Promise<{ ok: boolean; error?: string }> {
  if (!UUID_RE.test(word_id)) return { ok: false, error: "That word no longer exists." };
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/auth");

  const { error } = await supabase
    .from("vocab_words")
    .delete()
    .eq("id", word_id)
    .eq("owner_id", user.id);
  if (error) return { ok: false, error: "Could not delete this personal word." };

  revalidatePath("/dashboard/vocab");
  return { ok: true };
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
export async function regeneratePlan(): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth");

  // Re-planning is an AI call like any other — it consumes the same quota
  // (50/day) instead of bypassing it.
  const supabase = await createClient();
  const { data: permitted, error: quotaError } = await supabase.rpc("consume_ai_quota");
  if (quotaError || !permitted) {
    return { ok: false, error: "The daily AI limit is 50 requests. Please wait a bit and try again." };
  }

  const bundle = await regenerateStudyPlan();
  if (!bundle) return { ok: false, error: "Could not load your results. Please try again." };

  revalidatePath("/dashboard/plan");
  revalidatePath("/dashboard");
  return { ok: true };
}
