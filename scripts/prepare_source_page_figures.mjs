#!/usr/bin/env node
/**
 * Replace OCR/AI figure crops with a scaled copy of the complete source page.
 * This is intentionally conservative: a little duplicated question text is
 * preferable to a clipped axis, missing table column, or absent answer graph.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const EXTRACTED = path.join(ROOT, "Practise tests", "extracted");
const CROPS = path.join(ROOT, "Practise tests", "figure_crops");
const requestedForms = new Set(process.argv.slice(2));
const visualMarker = /\[(?:graph|table|figure|diagram|triangle|scatterplot|plot|coordinate plane|line segment|chart|image|bar graph|pie chart)\b[^\]]*\]|!\[\]\(page=|<table\b|(?:^|\n)[^\n]*\|[^\n]*(?:\n[^\n]*\|[^\n]*)+/i;

const drafts = fs.readdirSync(EXTRACTED)
  .filter((file) => file.endsWith(".draft.json"))
  .filter((file) => !requestedForms.size || requestedForms.has(file.replace(".draft.json", "")))
  .sort();

const verified = new Set();
for (const file of drafts) {
  const formId = file.replace(".draft.json", "");
  const draft = JSON.parse(fs.readFileSync(path.join(EXTRACTED, file), "utf8"));
  let count = 0;
  for (const question of draft.questions ?? []) {
    const content = [
      question.passage,
      question.question_text,
      ...(question.choices ?? []).map((choice) => choice.text),
    ].join("\n");
    if (!visualMarker.test(content) || !question.source_page) continue;

    const source = path.join(
      EXTRACTED,
      formId,
      `page-${String(question.source_page).padStart(3, "0")}.jpg`,
    );
    if (!fs.existsSync(source)) throw new Error(`Missing source page: ${source}`);
    const outputName = `${formId}-m${Number(question.module_index) + 1}-q${question.number}.jpg`;
    await sharp(source)
      .resize({ width: 1100, withoutEnlargement: true })
      .jpeg({ quality: 88, mozjpeg: true })
      .toFile(path.join(CROPS, outputName));
    verified.add(outputName);
    count += 1;
  }
  console.log(`${formId}: ${count} exact source visuals`);
}

fs.writeFileSync(
  path.join(CROPS, "verified_source_pages.json"),
  `${JSON.stringify([...verified].sort(), null, 2)}\n`,
);
console.log(`${verified.size} visuals prepared across ${drafts.length} forms`);
