#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const EXTRACTED = path.join(ROOT, "Practise tests", "extracted");
const formId = process.argv[2];
if (!formId) {
  console.error("usage: node scripts/structure_test.mjs <formId>");
  process.exit(1);
}

const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, ".env.local"), "utf8")
    .split("\n")
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at).trim(), line.slice(at + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const baseUrl = (env.SAT_AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
const model = env.SAT_AI_MODEL || "glm-5.3-flash";

const pages = JSON.parse(fs.readFileSync(path.join(EXTRACTED, `${formId}.split-pages.json`), "utf8"));
const keys = Object.keys(pages).filter((k) => /^page-\d{3}\.jpg$/.test(k)).sort();
const totalPages = keys.length;

// Module layout comes from <formId>.config.json: {starts:[...], counts?, pages?}
const cfgPath = path.join(EXTRACTED, `${formId}.config.json`);
const cfg = fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, "utf8")) : null;
let startPage = 1;
if (cfg?.starts) startPage = cfg.starts[0];
else for (const k of keys) { if (/\b1\s+Mark\s+for\s+Review\b/i.test(pages[k])) { startPage = Number(k.match(/page-(\d+)\.jpg/)?.[1] ?? 1); break; } }

const answers = JSON.parse(fs.readFileSync(path.join(EXTRACTED, `${formId}.answers.json`), "utf8")).modules;
if (answers.length !== 4) throw new Error("answers.json must have 4 modules");

const counts = cfg?.counts ?? [27, 27, 22, 22];
const modulePages = [];
for (let i = 0; i < 4; i++) {
  if (cfg?.pages?.[i]) modulePages.push(cfg.pages[i]);
  else {
    const s = i === 0 ? startPage : cfg.starts[i];
    modulePages.push(Array.from({ length: counts[i] }, (_, j) => s + j));
  }
}
const moduleSpecs = modulePages.map((pgs, i) => ({
  index: i,
  section: i < 2 ? "reading_writing" : "math",
  start: pgs[0],
  count: pgs.length,
  label: `Module ${i + 1}`,
}));
console.log(`total pages ${totalPages}; module page counts ${modulePages.map((p) => p.length).join(",")}`);

const system = `Convert OCR from Digital SAT question pages into exact structured questions. Each source page contains one complete question. Return JSON only: {"questions":[...]}. Each item must have: page (the supplied source page number), printed_number (the question number shown in the black badge, integer, if visible), passage (the complete stimulus, notes, paired texts, or introductory prose before the actual question; empty for standalone math), question_text (only the question/task after the stimulus), choices (A-D with exact visible text, or [] for student-produced responses), domain, skill, difficulty, is_grid_in. Preserve all names, punctuation, values, equations, and units. Use $...$ LaTeX for math. Never solve a question. Ignore watermarks, Mark for Review, image crop markers, Answer Preview, and interface chrome. If a chart, graph, or geometry figure is represented only by an OCR image marker, add a concise bracketed description of only the visible/explicit figure context; do not invent measurements. Domains must be one of Information and Ideas, Craft and Structure, Expression of Ideas, Standard English Conventions, Algebra, Advanced Math, Problem-Solving and Data Analysis, Geometry and Trigonometry.`;

function normalizeChoices(raw) {
  if (!raw) return [];
  if (!Array.isArray(raw)) {
    if (typeof raw === "object") {
      // {"A":"text","B":"text",...}
      raw = ["A", "B", "C", "D"].map((k) => ({ label: k, text: raw[k] ?? raw[k.toLowerCase()] ?? "" }));
    } else return [];
  }
  return raw.slice(0, 4).map((choice, i) => {
    if (typeof choice === "string") return { label: ["A", "B", "C", "D"][i], text: choice.trim() };
    if (choice && typeof choice === "object") {
      const key = Object.keys(choice).find((k) => ["A", "B", "C", "D"].includes(String(k).toUpperCase()));
      const text = choice.text ?? choice[key] ?? "";
      return { label: ["A", "B", "C", "D"][i], text: String(text).trim() };
    }
    return { label: ["A", "B", "C", "D"][i], text: "" };
  });
}

// The model varies its output shape (prompt/question_text, number/page); coerce to one shape.
function normalizeQuestion(q) {
  if (!q || typeof q !== "object") return null;
  return {
    ...q,
    page: Number.isFinite(Number(q.page)) ? Number(q.page) : Number(q.number),
    question_text: String(q.question_text ?? q.prompt ?? q.stem ?? "").trim(),
    passage: String(q.passage ?? "").trim(),
  };
}

async function call(chunk, attempt = 1) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.SAT_AI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 8000,
      ...(model.toLowerCase().startsWith("glm-5.3") ? { thinking: { type: "enabled" }, reasoning_effort: "low" } : {}),
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: chunk }],
    }),
    signal: AbortSignal.timeout(240_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 240)}`);
  const json = await response.json();
  const text = String(json.choices?.[0]?.message?.content ?? "{}").replace(/^```(?:json)?\s*|\s*```$/g, "");
  try {
    return JSON.parse(text);
  } catch (error) {
    if (attempt >= 2) throw error;
    return call(chunk, attempt + 1);
  }
}

async function callVision(spec, pageNumber) {
  const imgPath = path.join(EXTRACTED, formId, `page-${String(pageNumber).padStart(3, "0")}.jpg`);
  const b64 = fs.readFileSync(imgPath).toString("base64");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.SAT_AI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 4000,
      ...(model.toLowerCase().startsWith("glm-5.3") ? { thinking: { type: "enabled" }, reasoning_effort: "low" } : {}),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
            { type: "text", text: `Section: ${spec.section}. Extract the single complete question shown on this page, including its printed badge number. Return page = ${pageNumber}.` },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(240_000),
  });
  if (!response.ok) throw new Error(`vision HTTP ${response.status}: ${(await response.text()).slice(0, 240)}`);
  const json = await response.json();
  const text = String(json.choices?.[0]?.message?.content ?? "{}").replace(/^```(?:json)?\s*|\s*```$/g, "");
  return JSON.parse(text);
}

const printedFromText = (pageNo) => {
  const text = pages[`page-${String(pageNo).padStart(3, "0")}.jpg`] ?? "";
  const m = text.match(/#{0,4}\s*(\d{1,2})\s*\|?\s*\|?\s*Mark for Review/i);
  return m ? Number(m[1]) : null;
};

const checkpointPath = path.join(EXTRACTED, `${formId}.structured-partial.json`);
const questions = fs.existsSync(checkpointPath) ? JSON.parse(fs.readFileSync(checkpointPath, "utf8")) : [];

for (const spec of moduleSpecs) {
  const pgs = modulePages[spec.index];
  for (let offset = 0; offset < pgs.length; offset += 4) {
    const group = pgs.slice(offset, offset + 4);
    if (group.every((pageNumber) => questions.some((q) => q.source_page === pageNumber))) {
      console.log(`${spec.label}: ${Math.min(offset + 4, pgs.length)}/${pgs.length} (cached)`);
      continue;
    }
    const input = group
      .map((pageNumber) => `--- SOURCE PAGE ${pageNumber} ---\n${pages[`page-${String(pageNumber).padStart(3, "0")}.jpg`]}`)
      .join("\n\n");
    const parsed = await call(`Section: ${spec.section}. Extract exactly source pages ${group.join(", ")}.\n\n${input}`);
    const byPage = new Map((parsed.questions ?? []).map((q) => [Number(q.page), q]));
    for (const pageNumber of group) {
      const raw = byPage.get(pageNumber);
      if (!raw?.question_text) {
        let fallback = null;
        try {
          const single = await call(`Section: ${spec.section}. Extract exactly source page ${pageNumber}.\n\n--- SOURCE PAGE ${pageNumber} ---\n${pages[`page-${String(pageNumber).padStart(3, "0")}.jpg`]}`);
          fallback = normalizeQuestion((single.questions ?? [])[0]);
        } catch (e) {
          console.log(`single extract failed for page ${pageNumber}: ${e.message}`);
        }
        if (!fallback?.question_text) {
          try {
            const vision = await callVision(spec, pageNumber);
            fallback = normalizeQuestion((vision.questions ?? [])[0]);
            if (fallback?.question_text) console.log(`vision extracted page ${pageNumber}`);
          } catch (e) {
            console.log(`vision extract failed for page ${pageNumber}: ${e.message}`);
          }
        }
        if (fallback?.question_text) byPage.set(pageNumber, fallback);
      }
      const structured = byPage.get(pageNumber);
      if (!structured) {
        console.log(`NO QUESTION extracted from page ${pageNumber} — skipping page`);
        continue;
      }
      const printed = Number.isFinite(Number(structured.printed_number)) && Number(structured.printed_number) > 0 ? Number(structured.printed_number) : printedFromText(pageNumber);
      const positionInModule = pgs.indexOf(pageNumber);
      const answerSet = answers[spec.index];
      const correct = printed && printed <= answerSet.length ? answerSet[printed - 1] : answerSet[positionInModule];
      const choices = normalizeChoices(structured.choices);
      questions.push({
        module_index: spec.index,
        module_label: spec.label,
        number: positionInModule + 1,
        printed_number: printed ?? null,
        section: spec.section,
        domain: String(structured.domain || (spec.section === "math" ? "Algebra" : "Information and Ideas")),
        skill: String(structured.skill || ""),
        difficulty: ["easy", "medium", "hard"].includes(structured.difficulty) ? structured.difficulty : "medium",
        is_grid_in: Boolean(structured.is_grid_in) || choices.length === 0,
        passage: String(structured.passage || "").trim(),
        question_text: String(structured.question_text).trim(),
        choices,
        correct_answer: correct,
        source_page: pageNumber,
      });
    }
    fs.writeFileSync(checkpointPath, JSON.stringify(questions, null, 2));
    console.log(`${spec.label}: ${Math.min(offset + 4, pgs.length)}/${pgs.length}`);
  }
}

const finalQuestions = [...new Map(questions.map((q) => [q.source_page, q])).values()].sort((a, b) => a.source_page - b.source_page);
const countsCheck = moduleSpecs.map((spec) => finalQuestions.filter((q) => q.module_index === spec.index).length);
if (countsCheck.join(",") !== modulePages.map((p) => p.length).join(",")) {
  throw new Error(`Unexpected module counts: ${countsCheck.join(",")} (expected ${modulePages.map((p) => p.length).join(",")})`);
}

// Answer key is the source of truth: letter answer => multiple-choice (4 complete choices).
const isMc = (q) => /^[A-D]$/.test(String(q.correct_answer).trim());

for (const q of finalQuestions) {
  if (!isMc(q)) {
    q.is_grid_in = true;
    q.choices = [];
    continue;
  }
  if (q.choices.length === 4 && q.choices.every((c) => c.text)) {
    q.is_grid_in = false;
    continue;
  }
  const page = pages[`page-${String(q.source_page).padStart(3, "0")}.jpg`];
  const spec = moduleSpecs[q.module_index];
  let repaired = null;
  for (let attempt = 1; attempt <= 2 && !repaired; attempt++) {
    try {
      const fixed = await call(`Section: ${q.section}. Extract exactly source page ${q.source_page}.\n\n--- SOURCE PAGE ${q.source_page} ---\n${page}`);
      const candidate = normalizeQuestion((fixed.questions ?? [])[0]);
      const normalized = candidate ? normalizeChoices(candidate.choices) : [];
      if (normalized.length === 4 && normalized.every((c) => c.text)) repaired = candidate;
    } catch (e) {
      console.log(`text repair attempt ${attempt} failed for module ${q.module_index + 1} Q${q.number}: ${e.message}`);
    }
  }
  for (let attempt = 1; attempt <= 4 && !repaired; attempt++) {
    try {
      const parsed = await callVision(spec, q.source_page);
      const candidate = normalizeQuestion((parsed.questions ?? [])[0]);
      const normalized = candidate ? normalizeChoices(candidate.choices) : [];
      if (normalized.length === 4 && normalized.every((c) => c.text)) repaired = candidate;
    } catch (e) {
      console.log(`vision repair attempt ${attempt} failed for module ${q.module_index + 1} Q${q.number}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 15_000));
    }
  }
  if (!repaired) throw new Error(`Could not repair module ${q.module_index + 1} Q${q.number}`);
  q.passage = String(repaired.passage ?? q.passage ?? "").trim();
  q.question_text = String(repaired.question_text ?? q.question_text).trim();
  q.choices = normalizeChoices(repaired.choices);
  q.is_grid_in = false;
  console.log(`repaired module ${q.module_index + 1} Q${q.number}`);
  fs.writeFileSync(checkpointPath, JSON.stringify(finalQuestions, null, 2));
}

// Replace OCR-unreadable equations/figures using the page image (vision fallback)
const unreadable = /\[(?:equation|figure|image|graph|table)?[^\]]*(?:not visible|not captured|illegible|unclear|missing)/i;
for (const q of finalQuestions) {
  if (!unreadable.test(q.question_text) && !unreadable.test(q.passage) && q.question_text.trim()) continue;
  const spec = moduleSpecs[q.module_index];
  let fixed = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const parsed = await callVision(spec, q.source_page);
      const candidate = normalizeQuestion((parsed.questions ?? [])[0]);
      if (candidate?.question_text && !unreadable.test(String(candidate.question_text)) && !unreadable.test(String(candidate.passage ?? ""))) {
        fixed = candidate;
        break;
      }
    } catch (e) {
      console.log(`vision attempt ${attempt} failed for module ${q.module_index + 1} Q${q.number}: ${e.message}`);
    }
  }
  if (fixed) {
    q.passage = String(fixed.passage ?? q.passage ?? "").trim();
    q.question_text = String(fixed.question_text).trim();
    const visionChoices = normalizeChoices(fixed.choices);
    if (visionChoices.length === 4 && visionChoices.every((c) => c.text) && !q.is_grid_in) q.choices = visionChoices;
    console.log(`vision-fixed module ${q.module_index + 1} Q${q.number}`);
    fs.writeFileSync(checkpointPath, JSON.stringify(finalQuestions, null, 2));
  } else {
    console.log(`VISION UNRESOLVED module ${q.module_index + 1} Q${q.number}`);
  }
}

for (const q of finalQuestions) {
  if (isMc(q)) {
    q.is_grid_in = false;
    if (q.choices.length !== 4 || q.choices.some((c) => !c.text)) {
      throw new Error(`Module ${q.module_index + 1} Q${q.number} has ${q.choices.length} choices`);
    }
  } else {
    q.is_grid_in = true;
    q.choices = [];
  }
  if (!q.correct_answer) throw new Error(`Module ${q.module_index + 1} Q${q.number} has no key`);
  if (!q.question_text.trim()) throw new Error(`Module ${q.module_index + 1} Q${q.number} has empty question_text`);
}

function titleFromFormId(id) {
  const parts = id.replace(/^real-/, "").split("-");
  return parts.map((p) => (p === "sat" ? "SAT" : p[0].toUpperCase() + p.slice(1))).join(" ");
}

const draft = {
  title: titleFromFormId(formId),
  formId,
  sourceFile: `${titleFromFormId(formId)} Full.pdf`,
  pageCount: totalPages,
  questionCount: finalQuestions.length,
  unanswered: 0,
  extractedAt: new Date().toISOString(),
  modules: moduleSpecs.map(({ index, section, label }) => ({ index, section, label })),
  questions: finalQuestions,
};
fs.writeFileSync(path.join(EXTRACTED, `${formId}.draft.json`), JSON.stringify(draft, null, 2));
fs.writeFileSync(checkpointPath, JSON.stringify(finalQuestions, null, 2));
console.log(`Wrote ${finalQuestions.length} verified questions.`);
