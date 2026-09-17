#!/usr/bin/env python3
"""
Extract the full official SAT question bank from the College Board public API.

The College Board "SAT Suite Educator Question Bank" exposes an unauthenticated
JSON API that returns every question with math as MathML. This script:

  1. Lists all questions across the 8 domain groups (SAT, Math + Reading & Writing).
  2. Fetches each question's full payload (stem, stimulus, choices, answer, rationale).
  3. Converts MathML <math> blocks to LaTeX (rendered client-side with KaTeX).
  4. Normalizes into a single JSON file, ready to seed a database.

Usage:
  python3 scripts/extract_questions.py --limit 10 --out question-bank.json
  python3 scripts/extract_questions.py --out question-bank.json      # full run
"""

import argparse
import concurrent.futures
import html
import json
import os
import re
import sys
import time
import unicodedata
import urllib.request
import xml.etree.ElementTree as ET

from rich_html import sanitize_rich

BASE = "https://qbank-api.collegeboard.org/msreportingquestionbank-prod/questionbank"
GET_QUESTIONS = BASE + "/digital/get-questions"
GET_QUESTION = BASE + "/digital/get-question"

# (section, test, domain_code) for SAT (asmtEventId=99)
GROUPS = [
    ("math",             2, "H"),    # Algebra
    ("math",             2, "P"),    # Advanced Math
    ("math",             2, "Q"),    # Problem-Solving and Data Analysis
    ("math",             2, "S"),    # Geometry and Trigonometry
    ("reading_writing",  1, "INI"),  # Information and Ideas
    ("reading_writing",  1, "CAS"),  # Craft and Structure
    ("reading_writing",  1, "EOI"),  # Expression of Ideas
    ("reading_writing",  1, "SEC"),  # Standard English Conventions
]

DIFF_MAP = {"E": "easy", "M": "medium", "H": "hard"}


def post(url: str, payload: dict, retries: int = 4) -> dict:
    data = json.dumps(payload).encode("utf-8")
    last_err = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                url,
                data=data,
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "User-Agent": "Mozilla/5.0 (compatible; SAT-prep-extractor/1.0)",
                },
            )
            with urllib.request.urlopen(req, timeout=40) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"Request failed after {retries} attempts: {last_err}")


# ---------------------------------------------------------------------------
# MathML -> LaTeX
# ---------------------------------------------------------------------------

MATH_BLOCK_RE = re.compile(r"<math\b[^>]*>(.*?)</math>", re.DOTALL)

MO_MAP = {
    "\u2212": "-",         # − minus
    "\u00d7": r"\times",   # ×
    "\u00f7": r"\div",     # ÷
    "\u00b7": r"\cdot",    # ·
    "\u2264": r"\le",      # ≤
    "\u2265": r"\ge",      # ≥
    "\u2260": r"\ne",      # ≠
    "\u00b1": r"\pm",      # ±
    "\u221e": r"\infty",   # ∞
    "\u221a": r"\sqrt",    # √
    "\u03c0": r"\pi",      # π
    "\u03b8": r"\theta",   # θ
    "\u00b0": r"^\circ",   # °
}

FUNCTION_NAMES = {"sin", "cos", "tan", "log", "ln", "sec", "csc", "cot", "arcsin", "arccos", "arctan"}


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _text(elem: ET.Element) -> str:
    parts = []
    if elem.text:
        parts.append(elem.text)
    for child in elem:
        parts.append(_text(child))
        if child.tail:
            parts.append(child.tail)
    s = "".join(parts)
    return unicodedata.normalize("NFKC", s).strip()


def _convert(elem: ET.Element) -> str:
    tag = _local(elem.tag)

    if tag == "mi":
        v = _text(elem)
        if v in FUNCTION_NAMES:
            return "\\" + v
        return v
    if tag == "mn":
        return _text(elem)
    if tag == "mo":
        v = _text(elem)
        return "".join(MO_MAP.get(c, c) for c in v)
    if tag == "mtext":
        return r"\text{" + _text(elem) + "}"
    if tag in ("mrow", "mstyle", "math", "semantics", "mphantom"):
        return "".join(_convert(c) for c in elem)
    if tag == "mfrac":
        children = [c for c in elem]
        num = _convert(children[0]) if len(children) > 0 else ""
        den = _convert(children[1]) if len(children) > 1 else ""
        return r"\frac{" + num + "}{" + den + "}"
    if tag == "msqrt":
        return r"\sqrt{" + "".join(_convert(c) for c in elem) + "}"
    if tag == "mroot":
        children = [c for c in elem]
        base = _convert(children[0]) if len(children) > 0 else ""
        idx = _convert(children[1]) if len(children) > 1 else ""
        return r"\sqrt[" + idx + "]{" + base + "}"
    if tag == "msup":
        children = [c for c in elem]
        base = _convert(children[0]) if len(children) > 0 else ""
        exp = _convert(children[1]) if len(children) > 1 else ""
        exp = exp if len(exp) == 1 else "{" + exp + "}"
        return base + "^" + exp
    if tag == "msub":
        children = [c for c in elem]
        base = _convert(children[0]) if len(children) > 0 else ""
        sub = _convert(children[1]) if len(children) > 1 else ""
        sub = sub if len(sub) == 1 else "{" + sub + "}"
        return base + "_" + sub
    if tag == "msubsup":
        children = [c for c in elem]
        base = _convert(children[0]) if len(children) > 0 else ""
        sub = _convert(children[1]) if len(children) > 1 else ""
        sup = _convert(children[2]) if len(children) > 2 else ""
        sub = sub if len(sub) == 1 else "{" + sub + "}"
        sup = sup if len(sup) == 1 else "{" + sup + "}"
        return base + "_" + sub + "^" + sup
    if tag == "mover":
        children = [c for c in elem]
        base = _convert(children[0]) if len(children) > 0 else ""
        return r"\overline{" + base + "}"
    if tag == "munder":
        children = [c for c in elem]
        base = _convert(children[0]) if len(children) > 0 else ""
        return base
    if tag == "mfenced":
        open_c = elem.get("open", "(")
        close_c = elem.get("close", ")")
        inner = ",".join(_convert(c) for c in elem)
        return open_c + inner + close_c
    if tag == "mspace":
        return r"\ "
    if tag == "mtable":
        rows = []
        for tr in elem:
            cells = [_convert(td) for td in tr]
            rows.append(" & ".join(cells))
        return r"\begin{matrix} " + r" \\ ".join(rows) + r" \end{matrix}"
    if tag in ("mtr", "mtd"):
        return "".join(_convert(c) for c in elem)
    if tag in ("annotation", "annotation-xml"):
        return ""
    return "".join(_convert(c) for c in elem)


def mathml_to_latex(mathml_inner: str) -> str:
    candidates = [
        '<math xmlns="http://www.w3.org/1998/Math/MathML">' + mathml_inner + "</math>",
        "<math>" + mathml_inner + "</math>",
    ]
    for wrapped in candidates:
        try:
            root = ET.fromstring(wrapped)
            return _convert(root)
        except ET.ParseError:
            continue
    return re.sub(r"<[^>]+>", "", mathml_inner).strip()


def convert_math_in_html(html_text: str) -> str:
    if not html_text:
        return ""

    def repl(match: re.Match) -> str:
        latex = mathml_to_latex(match.group(1))
        latex = latex.replace("$", r"\$")
        return f"${latex}$"

    return MATH_BLOCK_RE.sub(repl, html_text)


def html_to_text(html_text: str) -> str:
    if not html_text:
        return ""
    s = html_text

    # Replace <svg> figures with their accessible aria-label (drop vector path noise).
    def _svg_repl(match: re.Match) -> str:
        attrs = match.group(1)
        am = re.search(r'aria-label="([^"]*)"', attrs)
        return am.group(1) if am else ""

    s = re.sub(r"<svg([^>]*)>(.*?)</svg>", _svg_repl, s, flags=re.DOTALL)

    # Remove <style>/<script> blocks including their contents.
    s = re.sub(r"<(style|script)\b[^>]*>.*?</\1>", "", s, flags=re.DOTALL | re.IGNORECASE)

    s = re.sub(r"</(p|li|div|h[1-6]|tr|figure|figcaption)>", "\n", s, flags=re.IGNORECASE)
    s = re.sub(r"<(br|/br)\s*/?>", "\n", s, flags=re.IGNORECASE)
    s = re.sub(r"<[^>]+>", "", s)
    s = html.unescape(s)
    lines = [re.sub(r"[ \t\f\v]+", " ", line).strip() for line in s.split("\n")]
    s = "\n".join(line for line in lines if line)
    return s.strip()


def clean_latex_text(html_text: str) -> str:
    with_math = convert_math_in_html(html_text)
    return html_to_text(with_math)


# ---------------------------------------------------------------------------
# Question assembly
# ---------------------------------------------------------------------------

def build_question(meta: dict, detail: dict, section: str) -> dict:
    q_type = detail.get("type")
    stem = clean_latex_text(detail.get("stem", ""))
    stimulus = clean_latex_text(detail.get("stimulus", "")) or None
    # The plain-text columns above lose every graph/table the question carries;
    # these keep a sanitized copy of the markup (see rich_html.py). NULL when
    # plain text already says everything, which is most questions.
    stem_html = sanitize_rich(convert_math_in_html(detail.get("stem", "")))
    stimulus_html = sanitize_rich(convert_math_in_html(detail.get("stimulus", "")))

    choices = None
    if q_type == "mcq":
        letters = ["A", "B", "C", "D", "E", "F"]
        options = detail.get("answerOptions") or []
        choices = []
        for i, opt in enumerate(options):
            content = opt.get("content", "")
            choice_html = sanitize_rich(convert_math_in_html(content))
            entry = {
                "label": letters[i] if i < len(letters) else str(i + 1),
                "text": clean_latex_text(content),
            }
            if choice_html:
                entry["html"] = choice_html
            choices.append(entry)

    accepted = [a for a in (detail.get("correct_answer") or detail.get("keys") or []) if a is not None]
    answer = None
    accepted_norm = []
    for a in accepted:
        s = str(a)
        if s.startswith("."):
            s = "0" + s
        accepted_norm.append(s)
    if accepted_norm:
        frac = next((s for s in accepted_norm if "/" in s), None)
        answer = frac if frac is not None else accepted_norm[0]

    return {
        "id": meta.get("questionId"),
        "external_id": meta.get("external_id"),
        "section": section,
        "domain": meta.get("primary_class_cd_desc"),
        "domain_code": meta.get("primary_class_cd"),
        "skill": meta.get("skill_desc"),
        "skill_code": meta.get("skill_cd"),
        "difficulty": DIFF_MAP.get(meta.get("difficulty"), meta.get("difficulty")),
        "score_band": meta.get("score_band_range_cd"),
        "type": "multiple_choice" if q_type == "mcq" else "grid_in",
        "stem": stem,
        "stem_html": stem_html,
        "stimulus": stimulus,
        "stimulus_html": stimulus_html,
        "choices": choices,
        "answer": answer,
        "accepted_answers": accepted_norm,
        "rationale": clean_latex_text(detail.get("rationale", "")),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract the College Board SAT question bank.")
    parser.add_argument("--out", default="question-bank.json", help="Output JSON path")
    parser.add_argument("--limit", type=int, default=None, help="Only fetch this many questions (for testing)")
    parser.add_argument("--delay", type=float, default=0.02, help="Seconds between requests (per worker)")
    parser.add_argument("--workers", type=int, default=8, help="Concurrent workers")
    args = parser.parse_args()

    # 1. Collect all question metadata across the 8 domain groups.
    all_metas = []
    for section, test, domain in GROUPS:
        print(f"[list] section={section} domain={domain}", file=sys.stderr)
        metas = post(GET_QUESTIONS, {"asmtEventId": 99, "test": test, "domain": domain})
        if not isinstance(metas, list):
            print(f"  ! unexpected response: {str(metas)[:120]}", file=sys.stderr)
            continue
        print(f"  -> {len(metas)} questions", file=sys.stderr)
        for m in metas:
            all_metas.append((section, m))

    # 2. Resume from checkpoint if present.
    checkpoint_path = args.out + ".part.jsonl"
    done = {}
    if os.path.exists(checkpoint_path):
        with open(checkpoint_path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                q = json.loads(line)
                done[q["external_id"]] = q
        print(f"[resume] {len(done)} already done", file=sys.stderr)

    todo = [(section, m) for section, m in all_metas if m.get("external_id") not in done]
    # Some "active" (practice-test) questions have null external_id and no S3 object;
    # they cannot be fetched via get-question, so skip them and report the count.
    skipped = [m for section, m in all_metas if not m.get("external_id")]
    todo = [(section, m) for section, m in todo if m.get("external_id")]
    if args.limit is not None:
        todo = todo[: args.limit]

    print(f"[fetch] {len(todo)} to fetch with {args.workers} workers "
          f"(skipping {len(skipped)} active questions with no external_id)", file=sys.stderr)

    # 3. Fetch concurrently, checkpointing as each completes.
    def fetch(item):
        section, m = item
        time.sleep(args.delay)
        detail = post(GET_QUESTION, {"external_id": m["external_id"]})
        return build_question(m, detail, section)

    checkpoint_fh = open(checkpoint_path, "a", encoding="utf-8")
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as ex:
            futures = {ex.submit(fetch, item): item for item in todo}
            for i, fut in enumerate(concurrent.futures.as_completed(futures), start=1):
                q = fut.result()
                done[q["external_id"]] = q
                checkpoint_fh.write(json.dumps(q, ensure_ascii=False) + "\n")
                if i % 100 == 0:
                    checkpoint_fh.flush()
                    print(f"    ... {len(done)} done", file=sys.stderr)
    finally:
        checkpoint_fh.close()

    # 4. Assemble final output in deterministic order.
    ordered = [done[m["external_id"]] for section, m in all_metas if m.get("external_id") in done]
    output = {
        "meta": {
            "source": "College Board SAT Suite Educator Question Bank (public API)",
            "total": len(ordered),
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        },
        "questions": ordered,
    }

    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(output, fh, ensure_ascii=False, indent=1)

    print(f"\nDone. Wrote {len(ordered)} questions to {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
