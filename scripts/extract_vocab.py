#!/usr/bin/env python3
"""Extract SAT vocabulary from the vocab PDFs into vocab.json."""
import fitz, re, json, sys

POS_MAP = {"v": "verb", "n": "noun", "adj": "adjective", "adv": "adverb", "prep": "preposition"}

WORD_RE = re.compile(r"^[a-z][a-z\-]{1,20}$")
POS_RE = re.compile(r"^\(([a-z]+)\.\)$")

# The 1000-word PDFs repeat a running footer ("SAT Vocabulary A …") inside the
# text layer, so it lands inside a few example sentences. Strip it.
FOOTER_RE = re.compile(r"\s*\)?\s*(?:A\s+)?SAT\s+Vocab(?:ulary)?\b.*$", re.I | re.S)

# The parser sometimes runs past the closing paren straight into the *next*
# entry ("…abide 1. (v.) to put up with …"). Cut that bleed off too.
NEXT_ENTRY_RE = re.compile(r"\s*\)?\s*[a-z][a-z\-]{2,20}\s+[1-9]\.\s*\((?:n|v|adj|adv)\.\).*$", re.I | re.S)


def clean_example(text):
    """Remove PDF running-header/footer artifacts, next-entry bleed, and orphaned parens."""
    if not text:
        return None
    cleaned = FOOTER_RE.sub("", text)
    cleaned = NEXT_ENTRY_RE.sub("", cleaned)
    cleaned = re.sub(r"\s*\)\s*$", "", cleaned).strip()
    return cleaned or None


def extract_1000(path):
    """Parse 'word / (pos.) / definition / (example)' format (word must be followed by a POS)."""
    doc = fitz.open(path)
    text = "\n".join(p.get_text("text") for p in doc)
    doc.close()
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    n = len(lines)
    words = []
    i = 0

    def is_entry(idx):
        return idx < n - 1 and WORD_RE.match(lines[idx]) and POS_RE.match(lines[idx + 1])

    while i < n:
        if is_entry(i):
            word = lines[i]
            pos = POS_RE.match(lines[i + 1]).group(1)
            j = i + 2
            def_parts = []
            while j < n and not lines[j].startswith("(") and not is_entry(j):
                def_parts.append(lines[j])
                j += 1
            definition = " ".join(def_parts).strip()
            example = None
            if j < n and lines[j].startswith("(") and not POS_RE.match(lines[j]):
                ex = []
                while j < n and not is_entry(j):
                    ex.append(lines[j])
                    j += 1
                example = " ".join(ex).strip().strip("()")
            if definition and len(definition) > 2 and not definition.isdigit():
                words.append({"word": word, "pos": pos, "definition": definition, "example": example})
            i = j
        else:
            i += 1
    return words


def extract_numbered(path):
    """Parse 'N | word | [phon] | pos | definition | russian' format."""
    doc = fitz.open(path)
    text = "\n".join(p.get_text("text") for p in doc)
    doc.close()
    pat = re.compile(r"^\d+\s*\|\s*([a-z]+)\s*\|\s*\[[^\]]*\]\s*\|\s*([a-z]+)\s*\|\s*(.*?)\s*\|\s*")
    words = []
    for m in pat.finditer(text):
        word, pos, definition = m.group(1), m.group(2), m.group(3)
        definition = definition.strip()
        if definition and len(definition) > 1:
            words.append({"word": word.lower(), "pos": pos, "definition": definition, "example": None})
    return words


def extract_inline(path):
    """Parse 'word (pos) definition (example)' inline format (example may wrap lines)."""
    doc = fitz.open(path)
    text = "\n".join(p.get_text("text") for p in doc)
    doc.close()
    # definition stays on one line; example ([^()]) may span lines
    pat = re.compile(r"\b([a-z][a-z\-]{2,20})\s*\(([a-z]+)\.\)\s*(.*?)\s*\(([^()]{3,})\)")
    words = []
    for m in pat.finditer(text):
        word, pos, definition, example = m.groups()
        definition = " ".join(definition.split())
        example = " ".join(example.split())
        if definition and len(definition) > 2:
            words.append({
                "word": word.lower(),
                "pos": pos,
                "definition": definition,
                "example": example or None,
            })
    return words


def extract_testverbal(path):
    """Parse the 'N / word / [phon] / pos / english / russian' line-per-field format."""
    doc = fitz.open(path)
    text = "\n".join(p.get_text("text") for p in doc)
    doc.close()
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    num_re = re.compile(r"^\d+$")
    n = len(lines)
    words = []
    i = 0
    while i < n:
        if num_re.match(lines[i]) and i + 4 < n and WORD_RE.match(lines[i + 1]):
            word = lines[i + 1]
            pos = lines[i + 3]
            definition = lines[i + 4]
            if definition and not any("\u0400" <= c <= "\u04ff" for c in definition):
                words.append({"word": word, "pos": pos, "definition": definition, "example": None})
            i += 6
        else:
            i += 1
    return words


def main():
    all_words = {}
    for path, fn in [
        ("Vocabulary/English - 1000 SAT Vocabulary.(.pdf).pdf", extract_1000),
        ("Vocabulary/THE MOST USED 1000 SATvocabulary@DSATuz.pdf", extract_1000),
        ("Vocabulary/English - 1000 SAT Vocabulary.(.pdf).pdf", extract_inline),
        ("Vocabulary/THE MOST USED 1000 SATvocabulary@DSATuz.pdf", extract_inline),
        ("Vocabulary/TestVerbalVocabulary@DSATuz.pdf", extract_testverbal),
    ]:
        try:
            for w in fn(path):
                key = w["word"]
                if key not in all_words:
                    all_words[key] = w
        except Exception as e:
            print(f"! {path}: {e}", file=sys.stderr)

    out = []
    for w in all_words.values():
        definition = w["definition"]
        example = clean_example(w.get("example"))
        if len(definition) > 200:
            definition = definition[:200]
        if example and len(example) > 240:
            example = example[:240]
        out.append({
            "word": w["word"],
            "definition": definition,
            "example_sentence": example,
            "difficulty": "medium",
            "tags": [POS_MAP.get(w.get("pos"), w.get("pos"))] if w.get("pos") else [],
        })

    with open("vocab.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=0)
    print(f"Wrote {len(out)} unique words -> vocab.json", file=sys.stderr)


if __name__ == "__main__":
    main()
