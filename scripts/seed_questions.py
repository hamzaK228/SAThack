#!/usr/bin/env python3
"""
Generate a SQL seed file from question-bank.json, mapped to the existing
`public.questions` table schema in Supabase.

Existing columns (must match):
  section         question_section   (math | reading_writing)
  domain          text
  skill           text
  difficulty      question_difficulty (easy | medium | hard)
  passage         text               <- stimulus
  question_text   text               <- stem (math as $...$ LaTeX)
  choices         jsonb              <- [{label, text}]
  correct_answer  text               <- answer
  explanation     text               <- rationale
  source_id       text               <- College Board question ID
  is_grid_in      boolean
  is_official     boolean

Usage:
  python3 scripts/seed_questions.py question-bank.json --out question-bank-seed.sql
"""

import argparse
import json


def sql_str(value):
    """Escape a string for a SQL single-quoted literal."""
    if value is None:
        return "NULL"
    return "'" + value.replace("'", "''") + "'"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input", help="question-bank.json")
    parser.add_argument("--out", default="question-bank-seed.sql")
    parser.add_argument("--batch", type=int, default=200, help="Rows per INSERT statement")
    args = parser.parse_args()

    with open(args.input, encoding="utf-8") as fh:
        data = json.load(fh)

    questions = data["questions"]

    columns = (
        "section, domain, skill, difficulty, passage, question_text, choices, "
        "correct_answer, explanation, source_id, is_grid_in, is_official"
    )

    lines = []
    # Clear any previously-imported official questions (the broken PDF import).
    lines.append("delete from public.questions where is_official = true;")
    lines.append("")

    batch = []
    for q in questions:
        section = q.get("section", "math")
        choices = json.dumps(q.get("choices") or [], ensure_ascii=False)
        values = (
            f"({sql_str(section)}, {sql_str(q.get('domain'))}, {sql_str(q.get('skill'))}, "
            f"{sql_str(q.get('difficulty'))}, {sql_str(q.get('stimulus'))}, "
            f"{sql_str(q.get('stem'))}, {sql_str(choices)}, {sql_str(q.get('answer'))}, "
            f"{sql_str(q.get('rationale'))}, {sql_str(q.get('id'))}, "
            f"{'true' if q.get('type') == 'grid_in' else 'false'}, true)"
        )
        batch.append(values)
        if len(batch) >= args.batch:
            lines.append(f"insert into public.questions ({columns}) values")
            lines.append(",\n".join(batch) + ";")
            lines.append("")
            batch = []

    if batch:
        lines.append(f"insert into public.questions ({columns}) values")
        lines.append(",\n".join(batch) + ";")
        lines.append("")

    with open(args.out, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))

    print(f"Wrote {len(questions)} questions -> {args.out}")


if __name__ == "__main__":
    main()
