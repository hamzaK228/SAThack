#!/usr/bin/env node
/**
 * Convert an extracted draft (Practise tests/extracted/<formId>.draft.json)
 * into SQL: an upsert of the question rows. The practice_forms row is written
 * separately by the caller once question ids are known (see publish flow).
 *
 * Usage: node scripts/draft_to_sql.mjs <formId> [minAnswered=40]
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "Practise tests", "extracted");
const formId = process.argv[2];
const minAnswered = Number(process.argv[3] ?? 40);
if (!formId) {
  console.error("usage: node scripts/draft_to_sql.mjs <formId>");
  process.exit(1);
}
const draft = JSON.parse(fs.readFileSync(path.join(OUT_DIR, `${formId}.draft.json`), "utf8"));

function sqlText(value) {
  return `'${String(value ?? "").replaceAll("'", "''")}'`;
}

const answered = draft.questions.filter((q) => q.correct_answer && q.question_text);
if (answered.length < minAnswered) {
  console.error(`REFUSE: only ${answered.length} answered questions (need ${minAnswered}).`);
  process.exit(2);
}

const rows = answered.map((q) => {
  const choices = q.is_grid_in
    ? "'[]'::jsonb"
    : sqlText(JSON.stringify(
        q.choices.map((c) => ({ label: c.label, text: c.text })),
      )) + "::jsonb";
  return [
    `(${sqlText(`real:${formId}:m${Number(q.module_index ?? 0) + 1}:q${q.number}`)}, ` +
      `${sqlText(q.section)}::question_section, ` +
      `${sqlText(q.domain || (q.section === "math" ? "Algebra" : "Information and Ideas"))}, ` +
      `${q.skill ? sqlText(q.skill) : "null"}, ` +
      `${sqlText(q.difficulty)}::question_difficulty, ` +
      `${q.passage ? sqlText(q.passage) : "null"}, ` +
      `${sqlText(q.question_text)}, ` +
      `${choices}, ` +
      `${sqlText(q.correct_answer)}, ` +
      `${q.is_grid_in ? "true" : "false"}, ` +
      `true, true)`,
  ].join("");
});

function moduleJson(moduleIndex) {
  const sourceIds = answered
    .filter((q) => Number(q.module_index) === moduleIndex)
    .sort((a, b) => a.number - b.number)
    .map((q) => `real:${formId}:m${moduleIndex + 1}:q${q.number}`);
  const values = sourceIds.map(sqlText).join(",");
  return `(select jsonb_agg(id order by array_position(array[${values}]::text[], source_id)) from public.questions where source_id = any(array[${values}]::text[]))`;
}

const sql = `-- ${draft.title} — ${answered.length} questions from ${draft.sourceFile}
begin;

insert into public.questions
  (source_id, section, domain, skill, difficulty, passage, question_text, choices, correct_answer, is_grid_in, is_official, usable)
values
  ${rows.join(",\n  ")}
on conflict (source_id) do update set
  section = excluded.section,
  domain = excluded.domain,
  skill = excluded.skill,
  difficulty = excluded.difficulty,
  passage = excluded.passage,
  question_text = excluded.question_text,
  choices = excluded.choices,
  correct_answer = excluded.correct_answer,
  is_grid_in = excluded.is_grid_in,
  is_official = true,
  usable = true;

insert into public.practice_forms (id, title, sequence, modules, published)
values (
  ${sqlText(formId)},
  ${sqlText(draft.title)},
  coalesce((select max(sequence) + 1 from public.practice_forms), 1),
  jsonb_build_object(
    'rw1', ${moduleJson(0)},
    'rw2Easy', ${moduleJson(1)},
    'rw2Hard', ${moduleJson(1)},
    'math1', ${moduleJson(2)},
    'math2Easy', ${moduleJson(3)},
    'math2Hard', ${moduleJson(3)}
  ),
  true
)
on conflict (id) do update set
  title = excluded.title,
  modules = excluded.modules,
  published = true;

do $$
declare module_sizes int[];
begin
  select array[
    jsonb_array_length(modules->'rw1'),
    jsonb_array_length(modules->'rw2Hard'),
    jsonb_array_length(modules->'math1'),
    jsonb_array_length(modules->'math2Hard')
  ] into module_sizes from public.practice_forms where id = ${sqlText(formId)};
  if module_sizes <> array[${[0, 1, 2, 3].map((i) => draft.questions.filter((q) => q.module_index === i).length).join(",")}] then
    raise exception 'Practice form module validation failed: %', module_sizes;
  end if;
end $$;

commit;
`;
const out = path.join(OUT_DIR, `${formId}.questions.sql`);
fs.writeFileSync(out, sql);
console.log(`wrote ${out} (${answered.length} questions, ${draft.unanswered} skipped)`);

// Emit two MCP-sized parts: part1 = begin + first rows; part2 = rest + forms + validation + commit.
const ROWS_PER_PART = 50;
if (rows.length > ROWS_PER_PART) {
  const upsert = `insert into public.questions
  (source_id, section, domain, skill, difficulty, passage, question_text, choices, correct_answer, is_grid_in, is_official, usable)
values
`;
  const onConflict = `on conflict (source_id) do update set
  section = excluded.section, domain = excluded.domain, skill = excluded.skill,
  difficulty = excluded.difficulty, passage = excluded.passage, question_text = excluded.question_text,
  choices = excluded.choices, correct_answer = excluded.correct_answer, is_grid_in = excluded.is_grid_in,
  is_official = true, usable = true;`;
  const mid = Math.ceil(rows.length / 2);
  const p1 = `-- ${formId} part1\nbegin;\n\n${upsert}  ${rows.slice(0, mid).join(",\n  ")}\n${onConflict}\n`;
  const formsBlock = sql.slice(sql.indexOf("insert into public.practice_forms"));
  const p2 = `-- ${formId} part2\n${upsert}  ${rows.slice(mid).join(",\n  ")}\n${onConflict}\n\n${formsBlock}`;
  fs.writeFileSync(path.join(OUT_DIR, `${formId}.sql-part1`), p1);
  fs.writeFileSync(path.join(OUT_DIR, `${formId}.sql-part2`), p2);
  console.log(`wrote ${formId}.sql-part1 (${mid} rows) and .sql-part2 (${rows.length - mid} rows + forms)`);
}
