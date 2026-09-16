#!/usr/bin/env python3
"""Extract text from the SAT prep books into a searchable JSON corpus."""
import fitz, json, re, sys

BOOKS = [
    ("Official Digital SAT Study Guide", "Resoure for study/The Official Digital SAT Study Guide @DSATuz.pdf"),
    ("Princeton Review 2026", "Resoure for study/@DSATuz - Princeton review 2026.pdf"),
    ("Digital SAT English Workbook", "Resoure for study/Digital SAT English Workbook@DSATuz.pdf"),
    ("College Panda Math", "Resoure for study/College panda MATH for DSAT @DSATuz.pdf"),
    ("Last Minute SAT Rules", "Resoure for study/LAST MINUTE SAT RULES @DSATuz.pdf"),
]

CHUNK = 700
STEP = 550

out = []
for title, path in BOOKS:
    try:
        doc = fitz.open(path)
    except Exception as e:
        print(f"! open failed {path}: {e}", file=sys.stderr)
        continue
    count = 0
    for i, page in enumerate(doc):
        text = page.get_text("text")
        text = re.sub(r"[\u0000-\u001f]", " ", text)
        text = re.sub(r"[ \t]+", " ", text)
        # split into paragraphs
        paras = [p.strip() for p in text.split("\n") if p.strip()]
        merged = []
        buf = ""
        for p in paras:
            if len(buf) + len(p) + 1 <= CHUNK:
                buf = (buf + " " + p).strip() if buf else p
            else:
                if buf: merged.append(buf)
                buf = p
        if buf: merged.append(buf)
        for ci, c in enumerate(merged):
            if len(c) < 25: continue
            out.append({"book": title, "page": i + 1, "chunk": ci, "text": c})
            count += 1
    doc.close()
    print(f"  {title}: {count} chunks", file=sys.stderr)

with open("sat-corpus.json", "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False)

print(f"Wrote {len(out)} chunks to sat-corpus.json", file=sys.stderr)
