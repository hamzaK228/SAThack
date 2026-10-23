"use server";

import { revalidatePath } from "next/cache";
import { getIsAdmin } from "@/lib/admin";
import { chatCompletion } from "@/lib/ai/llm";
import { getCurrentUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export type AdminActionResult = { ok: boolean; message: string; data?: Record<string, string> };

function clean(value: FormDataEntryValue | null, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function textHtml(value: string) {
  return value
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`)
    .join("");
}

function questionMediaUrl(value: string) {
  if (!value) return "";
  try {
    const url = new URL(value);
    const projectUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
    const prefix = "/storage/v1/object/public/question-media/";
    return url.origin === projectUrl.origin && url.pathname.startsWith(prefix) ? url.toString() : "";
  } catch {
    return "";
  }
}

function normalizeOcrText(value: string) {
  return value
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, math: string) => `$${math.trim()}$`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_match, math: string) => `$${math.trim()}$`)
    .replace(/\$\$([\s\S]*?)\$\$/g, (_match, math: string) => `$${math.trim()}$`)
    .trim();
}

async function adminContext() {
  const user = await getCurrentUser();
  if (!user || !(await getIsAdmin())) return null;
  return { user, supabase: await createClient() };
}

async function audit(
  context: NonNullable<Awaited<ReturnType<typeof adminContext>>>,
  action: string,
  entityType: string,
  entityId?: string,
  details: Record<string, unknown> = {},
) {
  await context.supabase.from("admin_audit_logs").insert({
    actor_id: context.user.id,
    action,
    entity_type: entityType,
    entity_id: entityId ?? null,
    details,
  });
}

function complete(message: string): AdminActionResult {
  revalidatePath("/admin");
  revalidatePath("/dashboard/community");
  revalidatePath("/dashboard/vocab");
  return { ok: true, message };
}

export async function addQuestion(form: FormData): Promise<AdminActionResult> {
  const context = await adminContext();
  if (!context) return { ok: false, message: "Admin access required." };
  const section = clean(form.get("section"), 20);
  const domain = clean(form.get("domain"), 80);
  const skill = clean(form.get("skill"), 120);
  const difficulty = clean(form.get("difficulty"), 20);
  const question = clean(form.get("question"), 4000);
  const explanation = clean(form.get("explanation"), 6000);
  const correct = clean(form.get("correct"), 1).toUpperCase();
  const mediaUrl = questionMediaUrl(clean(form.get("media_url"), 1200));
  const mediaAlt = clean(form.get("media_alt"), 300);
  const mediaCaption = clean(form.get("media_caption"), 500);
  const mediaPlacement = clean(form.get("media_placement"), 20) === "passage" ? "passage" : "question";
  const choiceTexts = ["A", "B", "C", "D"].map((label) => ({
    label,
    text: clean(form.get(`choice_${label}`), 1200),
    html: null,
  }));
  if (!section || !domain || !skill || question.length < 8 || !["A", "B", "C", "D"].includes(correct) || choiceTexts.some((choice) => !choice.text)) {
    return { ok: false, message: "Complete the question, skill, four choices, and correct answer." };
  }
  if (clean(form.get("media_url"), 1200) && !mediaUrl) {
    return { ok: false, message: "The uploaded question image URL is invalid." };
  }
  if (mediaUrl && mediaAlt.length < 3) {
    return { ok: false, message: "Add a short image description for accessibility." };
  }
  const passage = clean(form.get("passage"), 8000);
  const figure = mediaUrl
    ? `<figure><img src="${escapeHtml(mediaUrl)}" alt="${escapeHtml(mediaAlt)}">${mediaCaption ? `<figcaption>${escapeHtml(mediaCaption)}</figcaption>` : ""}</figure>`
    : "";
  const id = crypto.randomUUID();
  const { error } = await context.supabase.from("questions").insert({
    id,
    source_id: `admin-${id}`,
    section,
    domain,
    skill,
    difficulty: ["easy", "medium", "hard"].includes(difficulty) ? difficulty : "medium",
    is_grid_in: false,
    question_text: question,
    question_text_html: mediaUrl && mediaPlacement === "question" ? `${textHtml(question)}${figure}` : null,
    passage: passage || null,
    passage_html: mediaUrl && mediaPlacement === "passage" ? `${textHtml(passage)}${figure}` : null,
    choices: choiceTexts,
    correct_answer: correct,
    explanation,
    is_official: false,
    usable: true,
  });
  if (error) return { ok: false, message: `Question was not added: ${error.message}` };
  await audit(context, "create", "question", id, { domain, skill });
  return complete("Question added to the bank.");
}

/**
 * Edit an existing question — the gap that used to force delete-and-recreate.
 *
 * The plain-text columns are the admin's source of truth, but the bank renders
 * the *_html columns whenever they exist, so those are rebuilt from the new text
 * while any <figure> (a graph, a table screenshot) is carried over untouched and
 * in the same position. A choice's own html is kept unless that choice's text
 * changed — it holds the LaTeX and figures plain text cannot reproduce.
 * `is_official` is deliberately never touched: editing a real exam question must
 * not change what it is.
 */
export async function updateQuestion(form: FormData): Promise<AdminActionResult> {
  const context = await adminContext();
  if (!context) return { ok: false, message: "Admin access required." };

  const id = clean(form.get("id"), 64);
  if (!isUuid(id)) return { ok: false, message: "Unknown question." };

  const { data: existing, error: readError } = await context.supabase
    .from("questions")
    .select("id, question_text_html, passage_html, choices")
    .eq("id", id)
    .maybeSingle();
  if (readError || !existing) return { ok: false, message: "That question no longer exists." };

  const section = clean(form.get("section"), 20);
  const domain = clean(form.get("domain"), 80);
  const skill = clean(form.get("skill"), 120);
  const difficulty = clean(form.get("difficulty"), 20);
  const question = clean(form.get("question"), 4000);
  const passage = clean(form.get("passage"), 8000);
  const explanation = clean(form.get("explanation"), 6000);
  const correct = clean(form.get("correct"), 1).toUpperCase();
  const previousChoices = (existing.choices ?? []) as { label: string; text: string; html: string | null }[];

  const choiceTexts = ["A", "B", "C", "D"].map((label) => {
    const text = clean(form.get(`choice_${label}`), 1200);
    const previous = previousChoices.find((choice) => choice.label === label);
    return { label, text, html: previous && previous.text === text ? previous.html : null };
  });

  if (
    !section ||
    !domain ||
    !skill ||
    question.length < 8 ||
    !["A", "B", "C", "D"].includes(correct) ||
    choiceTexts.some((choice) => !choice.text)
  ) {
    return { ok: false, message: "Complete the question, skill, four choices, and correct answer." };
  }

  const figuresOf = (html: string | null) => (html ?? "").match(/<figure[\s\S]*?<\/figure>/g)?.join("") ?? "";
  const rebuild = (html: string | null, text: string) => {
    if (!html) return null;
    const figures = figuresOf(html);
    if (!figures) return textHtml(text);
    return html.trimStart().startsWith("<figure") ? `${figures}${textHtml(text)}` : `${textHtml(text)}${figures}`;
  };

  const { error } = await context.supabase
    .from("questions")
    .update({
      section,
      domain,
      skill,
      difficulty: ["easy", "medium", "hard"].includes(difficulty) ? difficulty : "medium",
      question_text: question,
      question_text_html: rebuild(existing.question_text_html as string | null, question),
      passage: passage || null,
      passage_html: passage ? rebuild(existing.passage_html as string | null, passage) : null,
      choices: choiceTexts,
      correct_answer: correct,
      explanation,
      usable: form.get("usable") === "on",
    })
    .eq("id", id);
  if (error) return { ok: false, message: `Question was not saved: ${error.message}` };

  await audit(context, "update", "question", id, { domain, skill });
  revalidatePath(`/admin/questions/${id}`);
  return complete("Question updated.");
}

async function callGlmLayout(dataUri: string): Promise<{ ok: boolean; text?: string; message?: string }> {
  const apiKey = process.env.GLM_OCR_API_KEY?.trim();
  if (!apiKey) return { ok: false, message: "GLM-OCR is not configured. Add GLM_OCR_API_KEY to the server environment." };
  try {
    const endpoint = process.env.GLM_OCR_BASE_URL?.trim() || "https://open.bigmodel.cn/api/paas/v4/layout_parsing";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "glm-ocr", file: dataUri }),
      signal: AbortSignal.timeout(45_000),
      cache: "no-store",
    });
    const result = await response.json() as {
      md_results?: string;
      message?: string;
      error?: { message?: string } | string;
      usage?: { total_tokens?: number };
    };
    const errorMessage = typeof result.error === "string" ? result.error : result.error?.message;
    if (!response.ok || !result.md_results) {
      return { ok: false, message: `GLM-OCR could not read this image: ${errorMessage ?? result.message ?? response.statusText}` };
    }
    return { ok: true, text: normalizeOcrText(result.md_results) };
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError" ? "GLM-OCR timed out." : "GLM-OCR is unavailable right now.";
    return { ok: false, message };
  }
}

export async function extractGlmOcrQuestion(form: FormData): Promise<AdminActionResult> {
  const context = await adminContext();
  if (!context) return { ok: false, message: "Admin access required." };
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a question screenshot first." };
  if (!new Set(["image/png", "image/jpeg"]).has(file.type)) {
    return { ok: false, message: "GLM-OCR accepts PNG or JPEG screenshots here." };
  }
  if (file.size > 10 * 1024 * 1024) return { ok: false, message: "Keep the GLM-OCR screenshot under 10 MB." };

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const dataUri = `data:${file.type};base64,${bytes.toString("base64")}`;
    const result = await callGlmLayout(dataUri);
    if (!result.ok || !result.text) return { ok: false, message: result.message ?? "GLM-OCR failed." };
    const text = result.text.slice(0, 8000);
    await audit(context, "extract", "glm_ocr_question");
    return {
      ok: true,
      message: "GLM-OCR draft ready. Review the text and LaTeX before publishing.",
      data: { text },
    };
  } catch {
    return { ok: false, message: "GLM-OCR is unavailable right now." };
  }
}

// ---------------------------------------------------------------------------
// Test Builder: uploaded real-exam PDF -> per-page GLM OCR -> structured
// questions -> published practice form. The client renders each PDF page to a
// JPEG (pdf.js) and streams them through extractTestPage; structureTestQuestions
// turns the OCR text into question records; publishPracticeTestDraft inserts
// them into the bank and registers the adaptive form.
// ---------------------------------------------------------------------------

export type BuilderQuestion = {
  number: number;
  section: "reading_writing" | "math";
  domain: string;
  skill: string;
  difficulty: "easy" | "medium" | "hard";
  is_grid_in: boolean;
  passage: string;
  question_text: string;
  choices: { label: string; text: string }[];
  correct_answer: string;
};

export async function extractTestPage(dataUri: string): Promise<{ ok: boolean; text?: string; message?: string }> {
  const context = await adminContext();
  if (!context) return { ok: false, message: "Admin access required." };
  if (typeof dataUri !== "string" || !/^data:image\/(png|jpeg);base64,/.test(dataUri)) {
    return { ok: false, message: "Expected a rendered page image." };
  }
  if (dataUri.length > 10.5 * 1024 * 1024) return { ok: false, message: "This page render is too large; lower the render quality." };
  const result = await callGlmLayout(dataUri);
  if (!result.ok) return result;
  return { ok: true, text: result.text!.slice(0, 12000) };
}

const STRUCTURE_SYSTEM = `You convert the OCR text of a real Digital SAT exam into structured JSON for a question bank.
Input is the OCR markdown of consecutive exam pages. It may contain watermarks, ads, section instructions, headers, and (near the end of the exam) an answer key.
Return ONLY JSON shaped as {"questions":[...]} where each question is:
{"number": <int, the printed question number>,
 "section": "reading_writing" | "math",
 "domain": <one of: "Information and Ideas","Craft and Structure","Expression of Ideas","Standard English Conventions","Algebra","Advanced Math","Problem-Solving and Data Analysis","Geometry and Trigonometry">,
 "skill": <short skill name or "">,
 "difficulty": "easy"|"medium"|"hard",
 "is_grid_in": <true only for student-produced response questions>,
 "passage": <full shared passage text for Reading & Writing questions, repeated on EVERY question that uses it; empty for math standalone questions>,
 "question_text": <complete question stem, math wrapped in $...$ LaTeX>,
 "choices": [{"label":"A","text":...},{"label":"B","text":...},{"label":"C","text":...},{"label":"D","text":...}],
 "correct_answer": <letter A-D, or the numeric value for grid-ins, or "" if not determinable>}
Rules:
- Ignore watermarks (t.me links), page headers/footers, ads, and test instructions.
- Include ONLY questions whose stem AND all choices are fully visible in the provided pages.
- For graphs/tables: describe the essential figure in one <figure-description> line inside question_text (the platform shows real figures later; do not skip the question).
- Math answer choices: keep $...$ LaTeX inside choice text.
- Use the answer key pages when they are included in this chunk; otherwise set correct_answer to "".
- Do not invent questions; do not merge questions.`;

export async function structureTestQuestions(input: {
  title: string;
  filename: string;
  pageTexts: string[];
}): Promise<{ ok: boolean; message: string; data?: Record<string, unknown> }> {
  const context = await adminContext();
  if (!context) return { ok: false, message: "Admin access required." };
  if (!Array.isArray(input.pageTexts) || input.pageTexts.length < 4) {
    return { ok: false, message: "Run page extraction first — at least 4 pages of OCR text are needed." };
  }

  const chunkSize = 6;
  const questions: BuilderQuestion[] = [];
  try {
    for (let start = 0; start < input.pageTexts.length; start += chunkSize) {
      const chunk = input.pageTexts
        .slice(start, start + chunkSize)
        .map((text, i) => `--- PAGE ${start + i + 1} ---\n${text}`)
        .join("\n\n");
      const raw = await chatCompletion(
        `${STRUCTURE_SYSTEM}\n\nEXAM PAGES:\n${chunk}`,
        { json: true, temperature: 0.1, maxTokens: 7000 },
      );
      const parsed = JSON.parse(raw) as { questions?: BuilderQuestion[] };
      for (const q of parsed.questions ?? []) {
        if (typeof q?.number !== "number" || !q?.question_text) continue;
        questions.push({
          number: q.number,
          section: q.section === "math" ? "math" : "reading_writing",
          domain: String(q.domain ?? "").slice(0, 80),
          skill: String(q.skill ?? "").slice(0, 120),
          difficulty: q.difficulty === "easy" || q.difficulty === "hard" ? q.difficulty : "medium",
          is_grid_in: Boolean(q.is_grid_in),
          passage: String(q.passage ?? "").slice(0, 12000),
          question_text: String(q.question_text).slice(0, 6000),
          choices: Array.isArray(q.choices)
            ? q.choices.slice(0, 5).map((c, i) => ({
                label: ["A", "B", "C", "D", "E"][i] ?? c.label ?? String(i + 1),
                text: String(c?.text ?? "").slice(0, 2000),
              }))
            : [],
          correct_answer: String(q.correct_answer ?? "").slice(0, 40),
        });
      }
    }
  } catch {
    return { ok: false, message: "The AI structuring call failed partway. Retry — extraction is safe to re-run." };
  }

  if (questions.length < 20) {
    return { ok: false, message: `Only ${questions.length} questions could be structured — the OCR text may be too poor. Check the GLM-OCR output and retry.` };
  }

  // Deduplicate by printed number (last chunk wins for shared keys).
  const byNumber = new Map<number, BuilderQuestion>();
  for (const q of questions) byNumber.set(q.number, q);
  const unique = [...byNumber.values()].sort((a, b) => a.number - b.number);
  const unanswered = unique.filter((q) => !q.correct_answer).length;

  const slug = input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 38) || `real-test-${Date.now()}`;
  const { data: draft, error } = await context.supabase
    .from("practice_test_drafts")
    .insert({
      created_by: context.user.id,
      title: input.title.slice(0, 120),
      source_filename: (input.filename ?? "").slice(0, 200),
      page_count: input.pageTexts.length,
      questions: unique,
      status: "draft",
    })
    .select("id")
    .single();
  if (error || !draft) return { ok: false, message: "Could not save the draft." };
  await audit(context, "create", "practice_test_draft", draft.id as string, {
    questions: unique.length, unanswered, slug,
  });
  return {
    ok: true,
    message: `Structured ${unique.length} questions (${unanswered} still missing answers). Review and publish.`,
    data: {
      draftId: draft.id as string,
      slug,
      count: unique.length,
      unanswered,
      preview: unique.slice(0, 8).map((q) => ({
        number: q.number, section: q.section, domain: q.domain,
        difficulty: q.difficulty, correct_answer: q.correct_answer || "—",
      })),
    },
  };
}

type QuestionWithId = BuilderQuestion & { id: string };

function splitBranch(pool: QuestionWithId[]): { hard: string[]; easy: string[] } {
  if (pool.length === 0) return { hard: [], easy: [] };
  if (pool.length === 1) return { hard: [String(pool[0].id)], easy: [String(pool[0].id)] };
  const hard = pool.filter((q) => q.difficulty === "hard");
  const easy = pool.filter((q) => q.difficulty !== "hard");
  const hardIds = (hard.length ? hard : pool.slice(0, Math.ceil(pool.length / 2))).map((q) => String(q.id));
  const easyIds = (easy.length ? easy : pool.slice(Math.ceil(pool.length / 2))).map((q) => String(q.id));
  return { hard: hardIds, easy: easyIds };
}

export async function publishPracticeTestDraft(input: {
  draftId: string;
  title: string;
  sequence: number;
}): Promise<AdminActionResult> {
  const context = await adminContext();
  if (!context) return { ok: false, message: "Admin access required." };
  if (!isUuid(input.draftId)) return { ok: false, message: "Invalid draft." };
  const sequence = Math.floor(input.sequence);
  if (!Number.isFinite(sequence) || sequence < 1 || sequence > 100) {
    return { ok: false, message: "Sequence must be 1–100." };
  }
  const { data: draft, error: loadError } = await context.supabase
    .from("practice_test_drafts")
    .select("id, title, questions, status")
    .eq("id", input.draftId)
    .maybeSingle();
  if (loadError || !draft || draft.status !== "draft") return { ok: false, message: "Draft not found or already published." };

  const questions = (draft.questions ?? []) as (BuilderQuestion & { id?: string })[];
  const withAnswers = questions
    .filter((q) => q.correct_answer && q.question_text)
    .map((q) => ({ ...q, id: String(q.id ?? "") }));
  if (withAnswers.length < 40) {
    return { ok: false, message: `Only ${withAnswers.length} answered questions — a practice form needs at least 40. Check the answer-key pages and re-extract.` };
  }

  const formId = `real-${input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 34) || `test-${sequence}`}`;
  const sourceId = (n: number) => `real:${formId}:q${n}`;

  // Upsert the question rows (is_official so they join the standard pools).
  const rows = withAnswers.map((q) => ({
    source_id: sourceId(q.number),
    section: q.section,
    domain: q.domain || (q.section === "math" ? "Algebra" : "Information and Ideas"),
    skill: q.skill || null,
    difficulty: q.difficulty,
    passage: q.passage || null,
    question_text: q.question_text,
    choices: q.is_grid_in ? null : q.choices,
    correct_answer: q.correct_answer,
    is_grid_in: q.is_grid_in,
    is_official: true,
    usable: true,
  }));
  const { data: inserted, error: insertError } = await context.supabase
    .from("questions")
    .upsert(rows, { onConflict: "source_id" })
    .select("id, source_id");
  if (insertError || !inserted) return { ok: false, message: `Could not insert questions: ${insertError?.message ?? "unknown"}` };

  const idBySource = new Map(inserted.map((row) => [row.source_id as string, String(row.id)]));
  const withIds = withAnswers
    .map((q) => ({ ...q, id: idBySource.get(sourceId(q.number)) ?? "" }))
    .filter((q): q is QuestionWithId => Boolean(q.id));

  const rw = withIds.filter((q) => q.section === "reading_writing");
  const math = withIds.filter((q) => q.section === "math");
  if (rw.length < 10 || math.length < 10) {
    return { ok: false, message: `Extraction found only ${rw.length} R&W and ${math.length} Math questions — a full form needs both sections. Re-extract with better page coverage.` };
  }
  const rw1 = rw.slice(0, 27).map((q) => String(q.id));
  const math1 = math.slice(0, 22).map((q) => String(q.id));
  const rwRest = splitBranch(rw.slice(27));
  const mathRest = splitBranch(math.slice(22));
  const modules = {
    rw1,
    rw2Easy: rwRest.easy,
    rw2Hard: rwRest.hard,
    math1,
    math2Easy: mathRest.easy,
    math2Hard: mathRest.hard,
  };

  const { error: formError } = await context.supabase
    .from("practice_forms")
    .upsert({ id: formId, title: input.title.slice(0, 120), sequence, modules, published: true }, { onConflict: "id" });
  if (formError) return { ok: false, message: `Could not register the form: ${formError.message}` };

  await context.supabase
    .from("practice_test_drafts")
    .update({ status: "published", form_id: formId })
    .eq("id", input.draftId);
  await audit(context, "publish", "practice_form", formId, { questions: withIds.length, sequence });
  complete(`Published ${input.title} with ${withIds.length} questions.`);
  return { ok: true, message: `Published “${input.title}” — ${withIds.length} questions, form id ${formId}. It is live in the practice-test library.` };
}

export async function addVocabWord(form: FormData): Promise<AdminActionResult> {
  const context = await adminContext();
  if (!context) return { ok: false, message: "Admin access required." };
  const word = clean(form.get("word"), 80);
  const definition = clean(form.get("definition"), 800);
  const example = clean(form.get("example"), 800);
  const tags = clean(form.get("tags"), 200).split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 8);
  if (word.length < 2 || definition.length < 3) return { ok: false, message: "A word and definition are required." };
  const { data, error } = await context.supabase.from("vocab_words").insert({
    word,
    definition,
    example_sentence: example,
    tags,
  }).select("id").single();
  if (error) return { ok: false, message: `Vocabulary was not added: ${error.message}` };
  await audit(context, "create", "vocab_word", data.id, { word });
  return complete("Vocabulary word published.");
}

export async function addPracticeTest(form: FormData): Promise<AdminActionResult> {
  const context = await adminContext();
  if (!context) return { ok: false, message: "Admin access required." };
  const id = clean(form.get("id"), 80).toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  const title = clean(form.get("title"), 160);
  const year = clean(form.get("year"), 12);
  const storagePath = clean(form.get("storage_path"), 500);
  const filename = storagePath.split("/").pop() || clean(form.get("filename"), 180);
  const mediaPath = clean(form.get("media_path"), 500);
  const mediaUrl = questionMediaUrl(clean(form.get("media_url"), 1200));
  if (id.length < 3 || title.length < 3 || !year || !storagePath) return { ok: false, message: "ID, title, year, and storage path are required." };
  const { error } = await context.supabase.from("practice_test_catalog").insert({
    id,
    title,
    year,
    filename,
    storage_path: storagePath,
    size: Math.max(0, Number(clean(form.get("size"), 20)) || 0),
    answer_key: form.get("answer_key") === "on",
    published: form.get("published") === "on",
    manifest: mediaPath ? { supplemental_media: [{ path: mediaPath, url: mediaUrl || null }] } : null,
  });
  if (error) return { ok: false, message: `Practice test was not added: ${error.message}` };
  await audit(context, "create", "practice_test", id, { title });
  return complete("Practice test added to the catalog.");
}

export async function deleteAdminEntity(entity: string, id: string): Promise<AdminActionResult> {
  const context = await adminContext();
  if (!context) return { ok: false, message: "Admin access required." };
  const allowed = {
    question: "questions",
    vocab_word: "vocab_words",
    practice_test: "practice_test_catalog",
    community_post: "community_posts",
    community_comment: "community_comments",
    community_group: "community_groups",
  } as const;
  const table = allowed[entity as keyof typeof allowed];
  if (!table || !/^[a-zA-Z0-9_-]{1,120}$/.test(id)) return { ok: false, message: "Invalid delete request." };
  const { error } = await context.supabase.from(table).delete().eq("id", id);
  if (error) return { ok: false, message: `Could not delete this item: ${error.message}` };
  await audit(context, "delete", entity, id);
  return complete("Item deleted.");
}

export async function reviewVocabSuggestion(id: string, decision: "approved" | "rejected"): Promise<AdminActionResult> {
  const context = await adminContext();
  if (!context || !isUuid(id)) return { ok: false, message: "Invalid review request." };
  const { data: suggestion, error: readError } = await context.supabase
    .from("vocab_suggestions")
    .select("id,word,definition,example_sentence,tags,status")
    .eq("id", id)
    .single();
  if (readError || !suggestion || suggestion.status !== "pending") return { ok: false, message: "This suggestion is no longer pending." };
  if (decision === "approved") {
    const { error } = await context.supabase.from("vocab_words").insert({
      word: suggestion.word,
      definition: suggestion.definition,
      example_sentence: suggestion.example_sentence,
      tags: suggestion.tags,
    });
    if (error) return { ok: false, message: `Could not publish this word: ${error.message}` };
  }
  const { error } = await context.supabase.from("vocab_suggestions").update({
    status: decision,
    reviewer_id: context.user.id,
    reviewed_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) return { ok: false, message: "Could not save the review." };
  await audit(context, decision, "vocab_suggestion", id, { word: suggestion.word });
  return complete(decision === "approved" ? "Suggestion published." : "Suggestion rejected.");
}

export async function resolveCommunityReport(id: string, resolution: "resolved" | "dismissed"): Promise<AdminActionResult> {
  const context = await adminContext();
  if (!context || !isUuid(id)) return { ok: false, message: "Invalid report." };
  const { error } = await context.supabase.from("community_reports").update({
    status: resolution,
    resolved_at: new Date().toISOString(),
    resolved_by: context.user.id,
  }).eq("id", id);
  if (error) return { ok: false, message: `Could not resolve the report: ${error.message}` };
  await audit(context, resolution, "community_report", id);
  return complete("Report updated.");
}

export async function updateUserAccess(userId: string, operation: "promote" | "demote" | "suspend" | "restore"): Promise<AdminActionResult> {
  const context = await adminContext();
  if (!context || !isUuid(userId)) return { ok: false, message: "Invalid user." };
  if (context.user.id === userId && operation === "demote") return { ok: false, message: "You cannot remove your own admin access." };
  // Role and suspension columns are revoked from `authenticated`; the definer
  // RPC re-checks is_admin() in the database rather than trusting this action.
  const { error } = await context.supabase.rpc("admin_set_user_access", {
    p_user: userId,
    p_operation: operation,
  });
  if (error) return { ok: false, message: `Could not update the user: ${error.message}` };
  await audit(context, operation, "user", userId);
  return complete("User access updated.");
}

export async function generateVocabDraft(wordValue: string): Promise<AdminActionResult> {
  const context = await adminContext();
  if (!context) return { ok: false, message: "Admin access required." };
  const word = wordValue.trim().slice(0, 80);
  if (word.length < 2) return { ok: false, message: "Enter a word first." };
  const raw = await chatCompletion(
    `For the SAT vocabulary word "${word}", return JSON only with keys definition, example, tags. Keep the definition precise, the example natural, and tags an array of at most 4 short strings.`,
    { json: true, temperature: 0.2 },
  );
  try {
    const value = JSON.parse(raw) as { definition?: string; example?: string; tags?: string[] };
    if (!value.definition) throw new Error("missing definition");
    return {
      ok: true,
      message: "AI draft ready. Review it before publishing.",
      data: {
        definition: value.definition.slice(0, 800),
        example: (value.example ?? "").slice(0, 800),
        tags: (value.tags ?? []).slice(0, 4).join(", "),
      },
    };
  } catch {
    return { ok: false, message: "AI could not draft this word. You can still enter it manually." };
  }
}

export async function resolveQuestionReport(
  id: string,
  resolution: "resolved" | "dismissed",
): Promise<AdminActionResult> {
  const context = await adminContext();
  if (!context || !isUuid(id) || !["resolved", "dismissed"].includes(resolution)) {
    return { ok: false, message: "Invalid report." };
  }
  const { error } = await context.supabase
    .from("question_reports")
    .update({
      status: resolution,
      resolved_at: new Date().toISOString(),
      resolved_by: context.user.id,
    })
    .eq("id", id);
  if (error) return { ok: false, message: `Could not update the report: ${error.message}` };
  await audit(context, resolution, "question_report", id);
  revalidatePath("/admin/reports");
  return complete("Question report updated.");
}

export async function setQuestionDifficulty(
  id: string,
  difficulty: "easy" | "medium" | "hard",
): Promise<AdminActionResult> {
  const context = await adminContext();
  if (!context || !isUuid(id) || !["easy", "medium", "hard"].includes(difficulty)) {
    return { ok: false, message: "Invalid difficulty change." };
  }
  const { error } = await context.supabase
    .from("questions")
    .update({ difficulty })
    .eq("id", id);
  if (error) return { ok: false, message: `Could not update the question: ${error.message}` };
  await audit(context, "update_difficulty", "question", id, { difficulty });
  revalidatePath("/admin/calibration");
  revalidatePath(`/admin/questions/${id}`);
  return complete("Question difficulty updated.");
}
