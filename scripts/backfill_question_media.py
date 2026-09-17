#!/usr/bin/env python3
"""
Backfill the rich-media columns on `public.questions`.

~15% of the College Board questions carry an embedded graph (<svg>) or data
table (<table>) inside their stem/stimulus. The original import collapsed every
field to plain text and dropped all of it, so those questions render without the
thing they are actually asking about.

This script re-fetches each question, sanitizes the rich markup (rich_html.py),
and writes it to the columns added by migrations/2026-09-17-question-media.sql:

    question_text_html  <- stem      (graphs/tables preserved)
    passage_html        <- stimulus  (figures/tables preserved)
    choices[].html      <- per-choice media, inside the existing jsonb

Only questions that actually have media are written; the plain-text columns and
everything else are left untouched, and no question is ever deleted, so
practice history (practice_attempts.question_id) stays linked.

Usage
  # 1. fetch every question and cache the media locally (resumable)
  python3 scripts/backfill_question_media.py --fetch

  # 2. push it to Supabase (needs NEXT_PUBLIC_SUPABASE_* in .env.local, and the
  #    temporary rpc that --print-rpc-sql prints, or --sql-out for the SQL editor)
  python3 scripts/backfill_question_media.py --push

  # or emit SQL to run in the Supabase SQL editor instead of --push
  python3 scripts/backfill_question_media.py --sql-out media-seed.sql
"""

import argparse
import concurrent.futures
import json
import os
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from extract_questions import (  # noqa: E402
    GET_QUESTION,
    GET_QUESTIONS,
    GROUPS,
    convert_math_in_html,
    post,
)
from rich_html import sanitize_rich  # noqa: E402

BATCH_ROWS = 20  # ~0.5 MB per request


def build_row(meta: dict, detail: dict) -> dict | None:
    """One question's media, or None when it has nothing worth storing."""
    stem_html = sanitize_rich(convert_math_in_html(detail.get("stem") or ""))
    passage_html = sanitize_rich(convert_math_in_html(detail.get("stimulus") or ""))

    choices = None
    options = detail.get("answerOptions") or []
    if options:
        enriched = []
        has_media = False
        for i, opt in enumerate(options):
            html = sanitize_rich(convert_math_in_html(opt.get("content") or ""))
            if html:
                has_media = True
            enriched.append({"label": chr(ord("A") + i), "html": html})
        if has_media:
            choices = enriched

    if not stem_html and not passage_html and not choices:
        return None
    return {
        # NB: `questions.source_id` holds the API's `questionId` (e.g. "ac472881"),
        # not its `external_id` (a UUID) — the seeder writes meta["questionId"].
        "source_id": meta.get("questionId"),
        "question_text_html": stem_html,
        "passage_html": passage_html,
        "choices": choices,
    }


def fetch(args) -> None:
    metas = []
    for section, test, domain in GROUPS:
        rows = post(GET_QUESTIONS, {"asmtEventId": 99, "test": test, "domain": domain})
        rows = rows if isinstance(rows, list) else []
        metas += [(section, m) for m in rows if m.get("external_id")]
        print(f"[list] {section} {domain}: {len(rows)}", file=sys.stderr)

    done = set()
    if os.path.exists(args.cache):
        with open(args.cache, encoding="utf-8") as fh:
            for line in fh:
                if line.strip():
                    done.add(json.loads(line)["source_id"])
        print(f"[resume] {len(done)} already cached", file=sys.stderr)

    todo = [item for item in metas if item[1]["external_id"] not in done]
    print(f"[fetch] {len(todo)} to fetch", file=sys.stderr)

    found = 0
    with open(args.cache, "a", encoding="utf-8") as out, \
            concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as ex:
        def work(item):
            _section, meta = item
            time.sleep(0.02)
            return meta, post(GET_QUESTION, {"external_id": meta["external_id"]})

        for i, (meta, detail) in enumerate(ex.map(work, todo), start=1):
            row = build_row(meta, detail)
            if row:
                out.write(json.dumps(row, ensure_ascii=False) + "\n")
                found += 1
            if i % 250 == 0:
                out.flush()
                print(f"    ... {i}/{len(todo)} fetched, {found} with media", file=sys.stderr)
    print(f"[fetch] done: {found} questions with media -> {args.cache}", file=sys.stderr)


def load_cache(path: str) -> list[dict]:
    rows = []
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            if line.strip():
                rows.append(json.loads(line))
    return rows


def env(name: str) -> str:
    """Read a value from the environment or .env.local (never printed)."""
    value = os.environ.get(name)
    if value:
        return value
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    path = os.path.join(root, ".env.local")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line.startswith(name + "="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit(f"{name} is not set (environment or .env.local)")


def push(args) -> None:
    base = env("NEXT_PUBLIC_SUPABASE_URL").rstrip("/")
    key = env("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    rows = load_cache(args.cache)
    print(f"[push] {len(rows)} rows in {args.cache}", file=sys.stderr)

    sent = 0
    updated = 0
    for i in range(0, len(rows), BATCH_ROWS):
        batch = rows[i : i + BATCH_ROWS]
        body = json.dumps({"payload": batch}).encode("utf-8")
        req = urllib.request.Request(
            f"{base}/rest/v1/rpc/tmp_apply_question_media",
            data=body,
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                updated += int((resp.read() or b"0").decode().strip() or 0)
        except urllib.error.HTTPError as exc:
            print(f"[push] HTTP {exc.code}: {exc.read().decode()[:300]}", file=sys.stderr)
            raise
        sent += len(batch)
        if (i // BATCH_ROWS) % 10 == 0:
            print(f"    ... {sent}/{len(rows)} sent, {updated} matched", file=sys.stderr)
    print(f"[push] done: {sent} rows sent, {updated} questions matched", file=sys.stderr)
    # The loader matches on source_id; zero matches means the ids are wrong, and
    # silently "succeeding" there is how a backfill appears to work but doesn't.
    if updated == 0:
        raise SystemExit(
            "no questions matched — check that source_id values line up "
            "(the loader matches questions.source_id)"
        )


def sql_out(args) -> None:
    rows = load_cache(args.cache)
    chunk = 40
    with open(args.sql_out, "w", encoding="utf-8") as fh:
        fh.write("-- Generated by scripts/backfill_question_media.py\n")
        fh.write("-- Safe to re-run: it only sets the rich-media columns.\n\n")
        for i in range(0, len(rows), chunk):
            payload = json.dumps(rows[i : i + chunk], ensure_ascii=False).replace("'", "''")
            fh.write("select public.tmp_apply_question_media('" + payload + "'::jsonb);\n")
    print(f"[sql] wrote {len(rows)} rows -> {args.sql_out}", file=sys.stderr)


RPC_SQL = """
-- Temporary loader for scripts/backfill_question_media.py --push.
-- Narrow on purpose: it can only touch the media columns, and it is dropped
-- again once the backfill has run.
create or replace function public.tmp_apply_question_media(payload jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  update public.questions q
     set question_text_html = coalesce(t.question_text_html, q.question_text_html),
         passage_html       = coalesce(t.passage_html, q.passage_html),
         choices            = coalesce(t.choices, q.choices)
    from jsonb_to_recordset(payload) as t(
      source_id text, question_text_html text, passage_html text, choices jsonb
    )
   where q.source_id = t.source_id;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.tmp_apply_question_media(jsonb) from public;
grant execute on function public.tmp_apply_question_media(jsonb) to anon, authenticated;
"""

DROP_RPC_SQL = "drop function if exists public.tmp_apply_question_media(jsonb);"


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--fetch", action="store_true", help="fetch question media into the cache")
    parser.add_argument("--push", action="store_true", help="push the cache to Supabase")
    parser.add_argument("--sql-out", help="write the cache as SQL instead of pushing")
    parser.add_argument("--cache", default="question-media.jsonl", help="cache file path")
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--print-rpc-sql", action="store_true", help="print the temporary rpc SQL")
    parser.add_argument("--print-drop-sql", action="store_true", help="print the cleanup SQL")
    args = parser.parse_args()

    if args.print_rpc_sql:
        print(RPC_SQL)
    if args.print_drop_sql:
        print(DROP_RPC_SQL)
    if args.fetch:
        fetch(args)
    if args.push:
        push(args)
    if args.sql_out:
        sql_out(args)
    if not (args.fetch or args.push or args.sql_out or args.print_rpc_sql or args.print_drop_sql):
        parser.print_help()


if __name__ == "__main__":
    main()
