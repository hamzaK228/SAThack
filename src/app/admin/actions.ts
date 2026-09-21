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

export async function extractGlmOcrQuestion(form: FormData): Promise<AdminActionResult> {
  const context = await adminContext();
  if (!context) return { ok: false, message: "Admin access required." };
  const apiKey = process.env.GLM_OCR_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, message: "GLM-OCR is not configured. Add GLM_OCR_API_KEY to the server environment." };
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a question screenshot first." };
  if (!new Set(["image/png", "image/jpeg"]).has(file.type)) {
    return { ok: false, message: "GLM-OCR accepts PNG or JPEG screenshots here." };
  }
  if (file.size > 10 * 1024 * 1024) return { ok: false, message: "Keep the GLM-OCR screenshot under 10 MB." };

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const dataUri = `data:${file.type};base64,${bytes.toString("base64")}`;
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
    const text = normalizeOcrText(result.md_results).slice(0, 8000);
    await audit(context, "extract", "glm_ocr_question", undefined, { total_tokens: result.usage?.total_tokens ?? null });
    return {
      ok: true,
      message: "GLM-OCR draft ready. Review the text and LaTeX before publishing.",
      data: { text },
    };
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError" ? "GLM-OCR timed out." : "GLM-OCR is unavailable right now.";
    return { ok: false, message };
  }
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
  const patch = operation === "promote" ? { role: "admin" }
    : operation === "demote" ? { role: "student" }
      : operation === "suspend" ? { community_suspended_until: new Date(Date.now() + 7 * 86_400_000).toISOString() }
        : { community_suspended_until: null };
  const { error } = await context.supabase.from("profiles").update(patch).eq("id", userId);
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
