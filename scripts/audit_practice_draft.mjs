#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const EXTRACTED = path.join(ROOT, "Practise tests", "extracted");
const EXPECTED_MODULE_COUNTS = [27, 27, 22, 22];
const VALID_SECTIONS = ["reading_writing", "math"];
const VALID_DIFFICULTIES = ["easy", "medium", "hard"];
const FIGURE_MARKER = /\[(?:graph|table|figure|diagram|triangle|scatterplot|plot|coordinate plane|line segment|chart|image|bar graph|pie chart)\b[^\]]*\]|!\[\]\(page=|<table\b|(?:^|\n)[^\n]*\|[^\n]*(?:\n[^\n]*\|[^\n]*)+/i;

export function auditPracticeDraft(draft, { requireResolvedFigures = true } = {}) {
  const errors = [];
  const questions = Array.isArray(draft?.questions) ? draft.questions : [];

  if (!String(draft?.title ?? "").trim()) errors.push("missing test title");
  if (questions.length !== 98) errors.push(`expected 98 questions, found ${questions.length}`);

  for (let moduleIndex = 0; moduleIndex < EXPECTED_MODULE_COUNTS.length; moduleIndex += 1) {
    const expected = EXPECTED_MODULE_COUNTS[moduleIndex];
    const moduleQuestions = questions
      .filter((question) => Number(question.module_index) === moduleIndex)
      .sort((a, b) => Number(a.number) - Number(b.number));
    if (moduleQuestions.length !== expected) {
      errors.push(`module ${moduleIndex + 1}: expected ${expected} questions, found ${moduleQuestions.length}`);
    }
    const numbers = moduleQuestions.map((question) => Number(question.number));
    const expectedNumbers = Array.from({ length: expected }, (_, index) => index + 1);
    if (numbers.join(",") !== expectedNumbers.join(",")) {
      errors.push(`module ${moduleIndex + 1}: question numbering is incomplete or duplicated`);
    }
  }

  const sourcePages = new Set();
  for (const question of questions) {
    const label = `module ${Number(question.module_index) + 1}, question ${question.number}`;
    if (!VALID_SECTIONS.includes(question.section)) errors.push(`${label}: invalid section`);
    if (!VALID_DIFFICULTIES.includes(question.difficulty)) errors.push(`${label}: invalid difficulty`);
    if (!String(question.question_text ?? "").trim()) errors.push(`${label}: missing question text`);
    if (!String(question.correct_answer ?? "").trim()) errors.push(`${label}: missing answer key`);

    const choices = Array.isArray(question.choices) ? question.choices : [];
    if (question.is_grid_in) {
      if (choices.length) errors.push(`${label}: grid-in question unexpectedly has choices`);
    } else {
      if (choices.length !== 4) errors.push(`${label}: expected four choices, found ${choices.length}`);
      const choiceLabels = choices.map((choice) => choice.label).join("");
      if (choiceLabels !== "ABCD") errors.push(`${label}: choices are not labeled A-D`);
      if (choices.some((choice) => !String(choice.text ?? "").trim())) errors.push(`${label}: has an empty choice`);
    }

    const content = [question.passage, question.question_text, ...choices.map((choice) => choice.text)].join("\n");
    if (requireResolvedFigures && FIGURE_MARKER.test(content)) {
      errors.push(`${label}: unresolved graph/table/figure marker`);
    }

    if (question.source_page != null) {
      const sourceKey = String(question.source_page);
      if (sourcePages.has(sourceKey)) errors.push(`${label}: source page ${sourceKey} is duplicated`);
      sourcePages.add(sourceKey);
    }
  }

  return [...new Set(errors)];
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const inputs = process.argv.slice(2);
  const files = inputs.length
    ? inputs.map((input) => input.endsWith(".json") ? path.resolve(input) : path.join(EXTRACTED, `${input}.draft.json`))
    : fs.readdirSync(EXTRACTED).filter((file) => file.endsWith(".draft.json")).sort().map((file) => path.join(EXTRACTED, file));
  let failed = false;
  for (const file of files) {
    const draft = JSON.parse(fs.readFileSync(file, "utf8"));
    const errors = auditPracticeDraft(draft);
    if (!errors.length) {
      console.log(`PASS ${path.basename(file)}`);
      continue;
    }
    failed = true;
    console.error(`FAIL ${path.basename(file)}`);
    for (const error of errors) console.error(`  - ${error}`);
  }
  if (failed) process.exitCode = 1;
}
