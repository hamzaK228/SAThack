#!/usr/bin/env node
// Split <formId>.questions.sql into part1 (rows) + part2 (rows + practice_forms + validation)
// sized for Supabase MCP execution. Usage: node scripts/split_sql.mjs <formId>
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const dir = path.join(ROOT, "Practise tests", "extracted");
const formId = process.argv[2];
const src = fs.readFileSync(path.join(dir, `${formId}.questions.sql`), "utf8");

// Rows are the lines starting with "  (real:" inside the values block.
const lines = src.split("\n");
const rowIdx = lines.map((l, i) => (l.startsWith("  (real:") ? i : -1)).filter((i) => i >= 0);
const rows = rowIdx.map((i) => lines[i].replace(/,$/, ""));
const head = lines.slice(0, rowIdx[0]);
const tail = lines.slice(rowIdx[rowIdx.length - 1] + 1); // everything after last row

const chunkSize = Math.ceil(rows.length / 2);
const p1rows = rows.slice(0, chunkSize).map((r) => `${r},`).join("\n");
const p2rows = rows.slice(chunkSize).map((r, i, a) => `${r}${i === a.length - 1 ? "" : ","}`).join("\n");

const part1 = `-- ${formId} part 1 (rows 1-${p1rows ? chunkSize : 0})
begin;
insert into public.questions
  (source_id, section, domain, skill, difficulty, passage, question_text, choices, correct_answer, is_grid_in, is_official, usable)
values
  ${p1rows}
on conflict (source_id) do update set
  section = excluded.section, domain = excluded.domain, skill = excluded.skill,
  difficulty = excluded.difficulty, passage = excluded.passage, question_text = excluded.question_text,
  choices = excluded.choices, correct_answer = excluded.correct_answer, is_grid_in = excluded.is_grid_in,
  is_official = true, usable = true;
`;
const part2 = `-- ${formId} part 2 (rows + practice_forms)
insert into public.questions
  (source_id, section, domain, skill, difficulty, passage, question_text, choices, correct_answer, is_grid_in, is_official, usable)
values
  ${p2rows}
on conflict (source_id) do update set
  section = excluded.section, domain = excluded.domain, skill = excluded.skill,
  difficulty = excluded.difficulty, passage = excluded.passage, question_text = excluded.question_text,
  choices = excluded.choices, correct_answer = excluded.correct_answer, is_grid_in = excluded.is_grid_in,
  is_official = true, usable = true;

insert into public.practice_forms (id, title, sequence, modules, published)
values (
  '${formId}',
  (select 1),
  coalesce((select max(sequence) + 1 from public.practice_forms), 1),
  '{}',
  true
) on conflict (id) do nothing;
${tail.join("\n")}
`;

fs.writeFileSync(path.join(dir, `${formId}.sql-part1`), part1);
fs.writeFileSync(path.join(dir, `${formId}.sql-part2`), part2);
console.log(`${formId}: ${rows.length} rows -> part1=${chunkSize}, part2=${rows.length - chunkSize}`);
