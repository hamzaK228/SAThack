#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const formId = "real-sat-2025-nov-international-v3";
const dir = path.join(ROOT, "Practise tests", "extracted");
const draftPath = path.join(dir, `${formId}.draft.json`);
const draft = JSON.parse(fs.readFileSync(draftPath, "utf8"));
const pages = JSON.parse(fs.readFileSync(path.join(dir, `${formId}.split-pages.json`), "utf8"));
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n").filter((line) => line.includes("=") && !line.trim().startsWith("#")).map((line) => {
  const at = line.indexOf("=");
  return [line.slice(0, at), line.slice(at + 1).replace(/^["']|["']$/g, "")];
}));

async function extract(text) {
  const response = await fetch(`${env.SAT_AI_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.SAT_AI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.SAT_AI_MODEL, temperature: 0, max_tokens: 3500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Extract this one Digital SAT question exactly. Return JSON only with passage, question_text, and choices as exactly four objects with label and text. Preserve wording, punctuation, values, and $...$ LaTeX. Ignore interface labels and watermarks." },
        { role: "user", content: text },
      ],
    }),
    signal: AbortSignal.timeout(240_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const json = await response.json();
  return JSON.parse(String(json.choices?.[0]?.message?.content ?? "{}").replace(/^```(?:json)?\s*|\s*```$/g, ""));
}

for (const question of draft.questions) {
  if (question.is_grid_in || (question.choices.length === 4 && question.choices.every((choice) => choice.text))) continue;
  const page = pages[`page-${String(question.source_page).padStart(3, "0")}.jpg`];
  const repaired = await extract(page);
  if (!Array.isArray(repaired.choices) || repaired.choices.length !== 4 || repaired.choices.some((choice) => !choice.text)) {
    throw new Error(`Could not repair module ${question.module_index + 1} question ${question.number}`);
  }
  question.passage = String(repaired.passage ?? question.passage ?? "").trim();
  question.question_text = String(repaired.question_text ?? question.question_text).trim();
  question.choices = repaired.choices.map((choice, index) => ({ label: ["A", "B", "C", "D"][index], text: String(choice.text).trim() }));
  fs.writeFileSync(draftPath, JSON.stringify(draft, null, 2));
  console.log(`Repaired module ${question.module_index + 1} question ${question.number}`);
}

console.log("All multiple-choice options are complete.");
