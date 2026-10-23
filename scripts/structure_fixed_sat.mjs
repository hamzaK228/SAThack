#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const FORM_ID = "real-sat-2025-nov-international-v3";
const EXTRACTED = path.join(ROOT, "Practise tests", "extracted");
const pages = JSON.parse(fs.readFileSync(path.join(EXTRACTED, `${FORM_ID}.split-pages.json`), "utf8"));
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n").filter((line) => line.includes("=") && !line.trim().startsWith("#")).map((line) => {
  const at = line.indexOf("=");
  return [line.slice(0, at).trim(), line.slice(at + 1).trim().replace(/^["']|["']$/g, "")];
}));
const baseUrl = (env.SAT_AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
const model = env.SAT_AI_MODEL || "glm-5.3-flash";

const answers = [
  "DBADACDDCBDBACCABACACCDBDDD",
  "ABCABDCDCDDBABABCBABBCBCBDD",
  ["19","D","D","A","A","C","20","A","9/50","A","C","13/4","B","C","B","100","D","C","D","B","D","D"],
  ["B","3/2","C","B","-9","B","A","B","C","312","D","A","C","D","2","C","198.9","72/7","D","D","C","D"],
];
const moduleSpecs = [
  { index: 0, section: "reading_writing", start: 1, count: 27, label: "Reading & Writing - Module 1" },
  { index: 1, section: "reading_writing", start: 28, count: 27, label: "Reading & Writing - Module 2" },
  { index: 2, section: "math", start: 55, count: 22, label: "Math - Module 1" },
  { index: 3, section: "math", start: 77, count: 22, label: "Math - Module 2" },
];

const system = `Convert OCR from Digital SAT question pages into exact structured questions. Each source page contains one complete question. Return JSON only: {"questions":[...]}. Each item must have: page (the supplied source page number), passage (the complete stimulus, notes, paired texts, or introductory prose before the actual question; empty for standalone math), question_text (only the question/task after the stimulus), choices (A-D with exact visible text, or [] for student-produced responses), domain, skill, difficulty, is_grid_in. Preserve all names, punctuation, values, equations, and units. Use $...$ LaTeX for math. Never solve a question. Ignore watermarks, Mark for Review, image crop markers, Answer Preview, and interface chrome. If a chart, graph, or geometry figure is represented only by an OCR image marker, add a concise bracketed description of only the visible/explicit figure context; do not invent measurements. Domains must be one of Information and Ideas, Craft and Structure, Expression of Ideas, Standard English Conventions, Algebra, Advanced Math, Problem-Solving and Data Analysis, Geometry and Trigonometry.`;

async function call(chunk, attempt = 1) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.SAT_AI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model, temperature: 0, max_tokens: 8000,
      ...(model.toLowerCase().startsWith("glm-5.3") ? { thinking: { type: "enabled" }, reasoning_effort: "low" } : {}),
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: chunk }],
    }),
    signal: AbortSignal.timeout(240_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 240)}`);
  const json = await response.json();
  const text = String(json.choices?.[0]?.message?.content ?? "{}").replace(/^```(?:json)?\s*|\s*```$/g, "");
  try { return JSON.parse(text); }
  catch (error) {
    if (attempt >= 2) throw error;
    return call(chunk, attempt + 1);
  }
}

const checkpointPath = path.join(EXTRACTED, `${FORM_ID}.structured-partial.json`);
const questions = fs.existsSync(checkpointPath) ? JSON.parse(fs.readFileSync(checkpointPath, "utf8")) : [];
for (const spec of moduleSpecs) {
  for (let offset = 0; offset < spec.count; offset += 4) {
    const group = Array.from({ length: Math.min(4, spec.count - offset) }, (_, i) => spec.start + offset + i);
    if (group.every((pageNumber) => questions.some((question) => question.source_page === pageNumber))) {
      console.log(`${spec.label}: ${Math.min(offset + 4, spec.count)}/${spec.count} (cached)`);
      continue;
    }
    const input = group.map((pageNumber) => `--- SOURCE PAGE ${pageNumber} ---\n${pages[`page-${String(pageNumber).padStart(3, "0")}.jpg`]}`).join("\n\n");
    const parsed = await call(`Section: ${spec.section}. Extract exactly source pages ${group.join(", ")}.\n\n${input}`);
    const byPage = new Map((parsed.questions ?? []).map((question) => [Number(question.page), question]));
    for (const pageNumber of group) {
      const raw = byPage.get(pageNumber);
      if (!raw?.question_text) {
        const single = await call(`Section: ${spec.section}. Extract exactly source page ${pageNumber}.\n\n--- SOURCE PAGE ${pageNumber} ---\n${pages[`page-${String(pageNumber).padStart(3, "0")}.jpg`]}`);
        const fallback = (single.questions ?? [])[0];
        byPage.set(pageNumber, fallback?.question_text ? fallback : {
          passage: "",
          question_text: String(pages[`page-${String(pageNumber).padStart(3, "0")}.jpg`])
            .replace(/\b\d+\s+Mark for Review\b/gi, "")
            .replace(/Answer Preview:\s*/gi, "")
            .trim(),
          choices: [], domain: "Algebra", skill: "", difficulty: "medium", is_grid_in: true,
        });
      }
      const structured = byPage.get(pageNumber);
      const number = pageNumber - spec.start + 1;
      const answerSet = answers[spec.index];
      const correct = Array.isArray(answerSet) ? answerSet[number - 1] : answerSet[number - 1];
      const choices = Array.isArray(structured.choices) ? structured.choices.slice(0, 4).map((choice, i) => ({
        label: ["A","B","C","D"][i],
        text: String(typeof choice === "string" ? choice : choice?.text ?? "").trim(),
      })) : [];
      questions.push({
        module_index: spec.index,
        module_label: spec.label,
        number,
        section: spec.section,
        domain: String(structured.domain || (spec.section === "math" ? "Algebra" : "Information and Ideas")),
        skill: String(structured.skill || ""),
        difficulty: ["easy","medium","hard"].includes(structured.difficulty) ? structured.difficulty : "medium",
        is_grid_in: Boolean(structured.is_grid_in) || choices.length === 0,
        passage: String(structured.passage || "").trim(),
        question_text: String(structured.question_text).trim(),
        choices,
        correct_answer: correct,
        source_page: pageNumber,
      });
    }
    fs.writeFileSync(checkpointPath, JSON.stringify(questions, null, 2));
    console.log(`${spec.label}: ${Math.min(offset + 4, spec.count)}/${spec.count}`);
  }
}

const finalQuestions = [...new Map(questions.map((question) => [question.source_page, question])).values()]
  .sort((a, b) => a.source_page - b.source_page);
const counts = moduleSpecs.map((spec) => finalQuestions.filter((question) => question.module_index === spec.index).length);
if (counts.join(",") !== "27,27,22,22") throw new Error(`Unexpected module counts: ${counts.join(",")}`);
for (const question of finalQuestions) {
  if (!question.is_grid_in && question.choices.length !== 4) throw new Error(`Module ${question.module_index + 1} Q${question.number} has ${question.choices.length} choices`);
  if (!question.correct_answer) throw new Error(`Module ${question.module_index + 1} Q${question.number} has no key`);
}

const draft = {
  title: "SAT November 2025 International V3",
  formId: FORM_ID,
  sourceFile: "2025 SAT Nov Int V3 Full.pdf",
  pageCount: 102,
  questionCount: finalQuestions.length,
  unanswered: 0,
  extractedAt: new Date().toISOString(),
  modules: moduleSpecs.map(({ index, section, label }) => ({ index, section, label })),
  questions: finalQuestions,
};
fs.writeFileSync(path.join(EXTRACTED, `${FORM_ID}.draft.json`), JSON.stringify(draft, null, 2));
fs.writeFileSync(checkpointPath, JSON.stringify(finalQuestions, null, 2));
console.log(`Wrote ${finalQuestions.length} verified questions.`);
