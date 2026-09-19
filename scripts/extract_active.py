#!/usr/bin/env python3
"""
Extract the 459 "active" (practice-test) SAT Math questions.

These questions have null `external_id` in the question list, but their
`ibn` value works as the `external_id` for the get-question endpoint. Their
math is stored as base64 PNG images with a spoken `alt` text (not MathML),
which we convert to LaTeX via math_alt.alt_to_latex().
"""

import argparse
import concurrent.futures
import html
import json
import os
import re
import sys
import time

sys.path.insert(0, __file__.rsplit("/", 1)[0] + "/../scripts")
from extract_questions import post, GET_QUESTIONS, GET_QUESTION  # noqa: E402
from math_alt import alt_to_latex  # noqa: E402
from rich_html import sanitize_rich  # noqa: E402

DIFF_MAP = {"E": "easy", "M": "medium", "H": "hard"}

IMG_RE = re.compile(r"<img[^>]*>", re.DOTALL)
ALT_RE = re.compile(r'alt="([^"]*)"')


def process_img(tag: str) -> str:
    am = ALT_RE.search(tag)
    alt = am.group(1) if am else ""
    if "math-img" in tag or 'role="math"' in tag:
        latex = alt_to_latex(alt)
        latex = latex.replace("$", r"\$")
        return f"${latex}$"
    # figure image -> keep the prose description as text
    return alt


def html_to_latex_text(html_text: str) -> str:
    if not html_text:
        return ""
    s = html_text
    s = IMG_RE.sub(lambda m: process_img(m.group(0)), s)
    s = re.sub(r"</(p|li|div|h[1-6]|tr)>", "\n", s, flags=re.IGNORECASE)
    s = re.sub(r"<(br|/br)\s*/?>", "\n", s, flags=re.IGNORECASE)
    s = re.sub(r"<[^>]+>", "", s)
    s = html.unescape(s)
    # strip zero-width / invisible watermark characters
    s = re.sub(r"[\u200b\u200c\u200d\u2060\ufeff]", "", s)
    lines = [re.sub(r"[ \t\f\v]+", " ", line).strip() for line in s.split("\n")]
    s = "\n".join(line for line in lines if line)
    return s.strip()


def rich_question_html(html_text: str) -> str | None:
    # Convert equation images, but retain the original diagrams and tables.
    markup = IMG_RE.sub(
        lambda m: html.escape(process_img(m.group(0)))
        if "math-img" in m.group(0) or 'role="math"' in m.group(0)
        else m.group(0),
        html_text or "",
    )
    return sanitize_rich(markup)


def build_question(meta: dict, detail: dict) -> dict:
    ans = detail.get("answer") or {}
    style = ans.get("style")

    stem = html_to_latex_text(detail.get("prompt", ""))
    stimulus = html_to_latex_text(detail.get("body", "")) or None

    choices = None
    answer = None
    if style == "Multiple Choice":
        letters = {"a": "A", "b": "B", "c": "C", "d": "D", "e": "E"}
        choices = []
        for key in ["a", "b", "c", "d", "e"]:
            opt = (ans.get("choices") or {}).get(key)
            if opt is None:
                continue
            choices.append({
                "label": letters[key],
                "text": html_to_latex_text(opt.get("body", "")),
                "html": rich_question_html(opt.get("body", "")),
            })
        answer = ans.get("correct_choice")
        if answer:
            answer = letters.get(answer.lower(), answer)
        else:
            # some MC questions omit correct_choice; it's stated in the rationale
            cm = re.search(r"Choice\s+([A-Ea-e])\s+is", ans.get("rationale", ""))
            if cm:
                answer = cm.group(1).upper()

    rationale = html_to_latex_text(ans.get("rationale", ""))

    # For grid-in (SPR), the numeric answer is inside the rationale
    # ("The correct answer is X."). It may be a math image or plain text.
    if style == "SPR":
        m = re.search(r"The correct answer is\s*(.*?)\.(?:\s|$)", ans.get("rationale", ""), re.DOTALL)
        if m:
            fragment = m.group(1).strip()
            am = re.search(r'alt="([^"]*)"', fragment)
            if am:
                answer = alt_to_latex(am.group(1))
            else:
                answer = html_to_latex_text(fragment)

    return {
        "id": meta.get("questionId"),
        "external_id": detail.get("item_id"),
        "section": "math",
        "domain": meta.get("primary_class_cd_desc"),
        "domain_code": meta.get("primary_class_cd"),
        "skill": meta.get("skill_desc"),
        "skill_code": meta.get("skill_cd"),
        "difficulty": DIFF_MAP.get(meta.get("difficulty"), meta.get("difficulty")),
        "score_band": meta.get("score_band_range_cd"),
        "type": "multiple_choice" if style == "Multiple Choice" else "grid_in",
        "stem": stem,
        "stem_html": rich_question_html(detail.get("prompt", "")),
        "stimulus": stimulus,
        "stimulus_html": rich_question_html(detail.get("body", "")),
        "choices": choices,
        "answer": answer,
        "accepted_answers": [answer] if answer else [],
        "rationale": rationale,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="active-questions.json")
    parser.add_argument("--workers", type=int, default=6)
    args = parser.parse_args()

    nulls = []
    for test, domain in [(2, "H"), (2, "P"), (2, "Q"), (2, "S")]:
        metas = post(GET_QUESTIONS, {"asmtEventId": 99, "test": test, "domain": domain})
        for m in metas:
            if not m.get("external_id"):
                nulls.append(m)

    print(f"[active] {len(nulls)} null-external_id questions", file=sys.stderr)

    questions = []
    if os.path.exists(args.out):
        with open(args.out, encoding="utf-8") as fh:
            questions = json.load(fh)
    done = {q["id"] for q in questions}
    nulls = [m for m in nulls if m["questionId"] not in done]
    print(f"[resume] {len(done)} saved, {len(nulls)} to fetch", file=sys.stderr)

    def fetch(m):
        try:
            d = post(GET_QUESTION, {"external_id": m["ibn"]}, retries=2)
            return build_question(m, d)
        except Exception as exc:  # noqa: BLE001
            print(f"  ! failed {m['questionId']}: {exc}", file=sys.stderr)
            return None

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as ex:
        for q in ex.map(fetch, nulls):
            if q:
                questions.append(q)

    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(questions, fh, ensure_ascii=False, indent=1)

    print(f"Done. Wrote {len(questions)} active questions to {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
