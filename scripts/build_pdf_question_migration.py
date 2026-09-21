#!/usr/bin/env python3
"""Build an idempotent Supabase question import from College Board PDF IDs.

The supplied PDFs are useful for selecting a collection, but their math is not
reliably extractable as text.  This script reads only each ``Question ID`` from
the PDFs and resolves the complete, already-sanitized question from the local
College Board question-bank JSON produced by ``extract_questions.py``.

Example:
  python3 scripts/build_pdf_question_migration.py \
    --bank question-bank.json \
    --pdf math:/path/to/math.pdf \
    --pdf reading_writing:/path/to/rw.pdf \
    --out supabase/migrations/20260921120000_add_msdc_question_sets.sql
"""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import re
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path


QUESTION_ID = re.compile(r"Question ID:\s*([0-9a-fA-F-]+)")
SECTIONS = {"math", "reading_writing"}


def ids_from_pdf(path: Path) -> list[str]:
    pdftotext = shutil.which("pdftotext")
    if not pdftotext:
        raise SystemExit("pdftotext is required to read Question IDs from the PDFs")
    with tempfile.TemporaryDirectory(prefix="sathack-pdf-") as directory:
        text_path = Path(directory) / "questions.txt"
        subprocess.run(
            [pdftotext, "-layout", str(path), str(text_path)],
            check=True,
            capture_output=True,
        )
        return QUESTION_ID.findall(text_path.read_text(encoding="utf-8", errors="replace"))


def parse_pdf(value: str) -> tuple[str, Path]:
    section, separator, raw_path = value.partition(":")
    if not separator or section not in SECTIONS or not raw_path:
        raise argparse.ArgumentTypeError("use SECTION:/absolute/path.pdf")
    path = Path(raw_path).expanduser().resolve()
    if not path.is_file():
        raise argparse.ArgumentTypeError(f"PDF not found: {path}")
    return section, path


def database_row(question: dict) -> dict:
    return {
        "source_id": question["id"],
        "section": question["section"],
        "domain": question["domain"],
        "skill": question["skill"],
        "difficulty": question["difficulty"],
        "passage": question.get("stimulus"),
        "passage_html": question.get("stimulus_html"),
        "question_text": question["stem"],
        "question_text_html": question.get("stem_html"),
        "choices": question.get("choices") or [],
        "correct_answer": question["answer"],
        "explanation": question.get("rationale"),
        "is_grid_in": question["type"] == "grid_in",
    }


def validate(question: dict, expected_section: str) -> None:
    question_id = question.get("id", "<unknown>")
    if question.get("section") != expected_section:
        raise SystemExit(
            f"{question_id}: expected section {expected_section}, got {question.get('section')}"
        )
    required = ("domain", "skill", "difficulty", "stem", "answer")
    missing = [field for field in required if question.get(field) in (None, "")]
    if missing:
        raise SystemExit(f"{question_id}: missing required fields: {', '.join(missing)}")
    if question.get("type") == "multiple_choice":
        choices = question.get("choices") or []
        if len(choices) < 2 or question["answer"] not in {choice["label"] for choice in choices}:
            raise SystemExit(f"{question_id}: invalid multiple-choice answer or choices")


def refresh_questions(selected: list[dict], workers: int) -> list[dict]:
    """Fetch fresh structured bodies while retaining the bank's metadata."""
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from extract_questions import GET_QUESTION, build_question, post  # noqa: PLC0415

    difficulty_codes = {"easy": "E", "medium": "M", "hard": "H"}

    def refresh(question: dict) -> dict:
        external_id = question.get("external_id")
        if not external_id:
            raise RuntimeError(f"{question.get('id')}: external_id is missing")
        meta = {
            "questionId": question["id"],
            "external_id": external_id,
            "primary_class_cd_desc": question["domain"],
            "primary_class_cd": question.get("domain_code"),
            "skill_desc": question["skill"],
            "skill_cd": question.get("skill_code"),
            "difficulty": difficulty_codes.get(question["difficulty"], question["difficulty"]),
            "score_band_range_cd": question.get("score_band"),
        }
        time.sleep(0.02)
        detail = post(GET_QUESTION, {"external_id": external_id})
        return build_question(meta, detail, question["section"])

    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
        return list(executor.map(refresh, selected))


def render_sql(rows: list[dict], sources: list[tuple[str, Path]]) -> str:
    payload = json.dumps(rows, ensure_ascii=False, separators=(",", ":"))
    delimiter = "$msdc_questions$"
    if delimiter in payload:
        raise SystemExit("unexpected SQL dollar-quote delimiter in payload")
    source_lines = "\n".join(f"--   {section}: {path.name}" for section, path in sources)
    expected = len(rows)
    return f"""-- Generated by scripts/build_pdf_question_migration.py.
-- The PDFs select the collection by College Board Question ID; the question
-- bodies come from the sanitized structured College Board bank so equations,
-- graphs, tables, answer choices, and rationales remain intact.
-- Sources:
{source_lines}

begin;

create temporary table _sathack_msdc_questions_20260921 on commit drop as
select *
from jsonb_to_recordset(
{delimiter}{payload}{delimiter}::jsonb
) as item(
  source_id text,
  section text,
  domain text,
  skill text,
  difficulty text,
  passage text,
  passage_html text,
  question_text text,
  question_text_html text,
  choices jsonb,
  correct_answer text,
  explanation text,
  is_grid_in boolean
);

do $$
declare
  row_count integer;
  id_count integer;
begin
  select count(*), count(distinct source_id)
    into row_count, id_count
    from _sathack_msdc_questions_20260921;
  if row_count <> {expected} or id_count <> {expected} then
    raise exception 'MSDC import validation failed: expected {expected} unique questions, got % rows and % ids', row_count, id_count;
  end if;
  if exists (
    select 1 from _sathack_msdc_questions_20260921
    where source_id is null or question_text is null or correct_answer is null
  ) then
    raise exception 'MSDC import validation failed: a required field is null';
  end if;
end $$;

-- Repair a partial or older copy without changing the row id, so saved items
-- and practice history keep their foreign-key relationships.
update public.questions as existing
set section = incoming.section::public.question_section,
    domain = incoming.domain,
    skill = incoming.skill,
    difficulty = incoming.difficulty::public.question_difficulty,
    passage = incoming.passage,
    passage_html = incoming.passage_html,
    question_text = incoming.question_text,
    question_text_html = incoming.question_text_html,
    choices = incoming.choices,
    correct_answer = incoming.correct_answer,
    explanation = incoming.explanation,
    is_grid_in = incoming.is_grid_in,
    is_official = true,
    usable = true
from _sathack_msdc_questions_20260921 as incoming
where existing.source_id = incoming.source_id;

insert into public.questions (
  section, domain, skill, difficulty, passage, passage_html, question_text,
  question_text_html, choices, correct_answer, explanation, source_id,
  is_grid_in, is_official, usable
)
select
  incoming.section::public.question_section,
  incoming.domain,
  incoming.skill,
  incoming.difficulty::public.question_difficulty,
  incoming.passage,
  incoming.passage_html,
  incoming.question_text,
  incoming.question_text_html,
  incoming.choices,
  incoming.correct_answer,
  incoming.explanation,
  incoming.source_id,
  incoming.is_grid_in,
  true,
  true
from _sathack_msdc_questions_20260921 as incoming
where not exists (
  select 1 from public.questions as existing
  where existing.source_id = incoming.source_id
);

do $$
declare
  imported_count integer;
begin
  select count(distinct existing.source_id)
    into imported_count
    from public.questions as existing
    join _sathack_msdc_questions_20260921 as incoming
      on incoming.source_id = existing.source_id
   where existing.is_official = true and existing.usable = true;
  if imported_count <> {expected} then
    raise exception 'MSDC import verification failed: expected {expected}, found %', imported_count;
  end if;
end $$;

commit;
"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bank", type=Path, required=True)
    parser.add_argument("--pdf", action="append", type=parse_pdf, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument(
        "--refresh-from-api",
        action="store_true",
        help="refresh selected bodies from College Board before generating SQL",
    )
    parser.add_argument("--workers", type=int, default=8)
    args = parser.parse_args()

    bank_data = json.loads(args.bank.read_text(encoding="utf-8"))
    questions = bank_data["questions"] if isinstance(bank_data, dict) else bank_data
    by_id = {question["id"]: question for question in questions}

    selected: list[dict] = []
    expected_sections: list[str] = []
    seen: set[str] = set()
    for section, pdf_path in args.pdf:
        ids = ids_from_pdf(pdf_path)
        if not ids:
            raise SystemExit(f"no Question IDs found in {pdf_path}")
        for question_id in ids:
            if question_id in seen:
                raise SystemExit(f"duplicate Question ID across PDFs: {question_id}")
            question = by_id.get(question_id)
            if not question:
                raise SystemExit(f"Question ID is absent from {args.bank}: {question_id}")
            validate(question, section)
            selected.append(question)
            expected_sections.append(section)
            seen.add(question_id)

    if args.refresh_from_api:
        selected = refresh_questions(selected, args.workers)
        for question, section in zip(selected, expected_sections, strict=True):
            validate(question, section)

    rows = [database_row(question) for question in selected]
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(render_sql(rows, args.pdf), encoding="utf-8")
    print(f"Wrote {len(rows)} validated questions to {args.out}")


if __name__ == "__main__":
    main()
