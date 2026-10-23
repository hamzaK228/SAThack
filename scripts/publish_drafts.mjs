#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { auditPracticeDraft } from "./audit_practice_draft.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const dir = path.join(ROOT, "Practise tests", "extracted");
const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
  }),
);
const URL = `${env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "")}/functions/v1/bulk-ingest-form`;
const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const formIds = process.argv.slice(2).length
  ? process.argv.slice(2)
  : fs.readdirSync(dir).filter((f) => f.startsWith("real-") && f.endsWith(".draft.json")).map((f) => f.replace(".draft.json", ""));

for (const formId of formIds) {
  const draftPath = path.join(dir, `${formId}.draft.json`);
  if (!fs.existsSync(draftPath)) { console.log(`${formId}: no draft, skipping`); continue; }
  const draft = JSON.parse(fs.readFileSync(draftPath, "utf8"));
  const auditErrors = auditPracticeDraft(draft);
  if (auditErrors.length) {
    console.error(`${formId}: NOT PUBLISHED — source fidelity check failed`);
    for (const error of auditErrors) console.error(`  - ${error}`);
    process.exitCode = 1;
    continue;
  }
  const questions = draft.questions.map((q) => ({
    module_index: q.module_index,
    number: q.number,
    section: q.section,
    domain: q.domain,
    skill: q.skill || "",
    difficulty: q.difficulty,
    passage: q.passage || "",
    question_text: q.question_text,
    choices: (q.choices || []).map((c) => ({ label: c.label, text: c.text })),
    correct_answer: q.correct_answer,
    is_grid_in: !!q.is_grid_in,
  }));
  const res = await fetch(URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ formId, title: draft.title, questions }),
  });
  const body = await res.text();
  console.log(`${formId}: HTTP ${res.status} ${body.slice(0, 300)}`);
}
