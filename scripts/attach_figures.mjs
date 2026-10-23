#!/usr/bin/env node
// Upload figure crops to Storage and attach them to the questions via
// passage_html / question_text_html, then re-ingest each affected form.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const EXTRACTED = path.join(ROOT, "Practise tests", "extracted");
const CROPS = path.join(ROOT, "Practise tests", "figure_crops");
const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
  }),
);
const BASE = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const badCropsPath = path.join(CROPS, "still_bad.json");
const badCrops = new Set(fs.existsSync(badCropsPath) ? JSON.parse(fs.readFileSync(badCropsPath, "utf8")) : []);
const verifiedSourcePagesPath = path.join(CROPS, "verified_source_pages.json");
const verifiedSourcePages = new Set(fs.existsSync(verifiedSourcePagesPath) ? JSON.parse(fs.readFileSync(verifiedSourcePagesPath, "utf8")) : []);

const escapeHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const bracketRe = /\[(?:Graph|Table|Figure|Diagram|Triangle|Scatterplot|Plot|Coordinate plane|Line segment|chart|Chart|Image|Bar graph|pie chart)[^\]]*\]/gi;
const hasBracketRe = new RegExp(bracketRe.source, "i");
const pipesRe = /(?:^|\n)[^\n]*\|[^\n]*(?:\n[^\n]*\|[^\n]*)+/g;
const htmlTableRe = /<table[\s\S]*?<\/table>/g;
const choiceVisualRe = /\[(?:Graph|Table|Figure|Diagram|Plot|Chart)[^\]]*\]/i;

function stripFigure(text) {
  return String(text || "")
    .replace(bracketRe, "")
    .replace(htmlTableRe, "")
    .replace(pipesRe, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function upload(formId, file) {
  const b64 = fs.readFileSync(file).toString("base64");
  const objPath = `figures/${formId}/${path.basename(file)}`;
  const res = await fetch(`${BASE}/functions/v1/store-figure`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ path: objPath, dataUrl: `data:image/jpeg;base64,${b64}` }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`upload ${objPath}: ${body.error}`);
  return body.url;
}

const requestedForms = new Set(process.argv.slice(2));
const files = fs.readdirSync(CROPS).filter((f) =>
  f.endsWith(".jpg")
  && !f.startsWith("_")
  && (!requestedForms.size || [...requestedForms].some((formId) => f.startsWith(`${formId}-m`)))
);
const selectedBadCrops = files.filter((file) => badCrops.has(file) && !verifiedSourcePages.has(file));
if (selectedBadCrops.length) {
  console.error(`Refusing to publish: ${selectedBadCrops.length} figure crops are incomplete.`);
  for (const file of selectedBadCrops) console.error(`  - ${file}`);
  console.error("Repair and re-run figure verification before attaching figures.");
  process.exit(1);
}
const byForm = new Map();
for (const f of files) {
  const m = f.match(/^(real-sat-.+)-m(\d)-q(\d+)\.jpg$/);
  if (!m) continue;
  const formId = m[1];
  if (!byForm.has(formId)) byForm.set(formId, new Map());
  byForm.get(formId).set(`${m[2]}-${m[3]}`, path.join(CROPS, f));
}
console.log(`crops for ${byForm.size} forms`);

const uploadedUrls = new Map();
for (const [formId, qs] of byForm) {
  const draftPath = path.join(EXTRACTED, `${formId}.draft.json`);
  if (!fs.existsSync(draftPath)) { console.log(`${formId}: no draft, skipping`); continue; }
  const draft = JSON.parse(fs.readFileSync(draftPath, "utf8"));
  const questions = await Promise.all(draft.questions.map(async (q) => {
    const cropFile = qs.get(`${q.module_index + 1}-${q.number}`);
    const out = {
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
      is_official: false,
    };
    if (!cropFile) return out;
    const key = `${formId}-m${q.module_index + 1}-q${q.number}`;
    let url = uploadedUrls.get(key);
    if (!url) { url = await upload(formId, cropFile); uploadedUrls.set(key, url); }
    const img = `<figure class="exam-figure"><img src="${url}" alt="Figure from the exam paper" loading="lazy" /></figure>`;

    if ((q.choices || []).some((c) => choiceVisualRe.test(c.text))) {
      // One complete source image contains every graphical answer option.
      out.question_text = stripFigure(q.question_text);
      out.question_text_html = `${img}<p>${escapeHtml(out.question_text)}</p>`;
      out.choices = out.choices.map((c) => ({ label: c.label, text: `Option ${c.label} — shown above` }));
      return out;
    }

    const passageHas = hasBracketRe.test(q.passage || "") || pipesRe.test(q.passage || "") || htmlTableRe.test(q.passage || "") || /!\[\]\(page=/.test(q.passage || "");
    const textHas = hasBracketRe.test(q.question_text || "") || pipesRe.test(q.question_text || "") || htmlTableRe.test(q.question_text || "") || /!\[\]\(page=/.test(q.question_text || "");
    if (passageHas) {
      out.passage = stripFigure(q.passage);
      out.passage_html = `${img}${out.passage ? `<p>${escapeHtml(out.passage).replace(/\n/g, "<br />")}</p>` : ""}`;
    } else if (textHas) {
      out.question_text = stripFigure(q.question_text);
      out.question_text_html = `${img}<p>${escapeHtml(out.question_text)}</p>`;
    } else {
      // description sat in the other field than where the figure belongs; attach alongside text
      out.passage_html = `${img}${out.passage ? `<p>${escapeHtml(out.passage).replace(/\n/g, "<br />")}</p>` : ""}`;
    }
    return out;
  }));

  const res = await fetch(`${BASE}/functions/v1/bulk-ingest-form`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ formId, title: draft.title, questions }),
  });
  const body = await res.text();
  console.log(`${formId}: HTTP ${res.status} ${body.slice(0, 200)}`);
}
console.log("attach done");
