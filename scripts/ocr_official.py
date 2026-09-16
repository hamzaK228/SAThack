#!/usr/bin/env python3
"""OCR the scanned Official Digital SAT Study Guide into the knowledge corpus."""
import fitz, subprocess, os, tempfile, re, json, sys

PDF = "Resoure for study/The Official Digital SAT Study Guide @DSATuz.pdf"
BOOK = "Official Digital SAT Study Guide"
DPI = 200

doc = fitz.open(PDF)
out = []
for i, page in enumerate(doc):
    pix = page.get_pixmap(dpi=DPI)
    png = pix.tobytes("png")
    fd, tmp = tempfile.mkstemp(suffix=".png")
    with os.fdopen(fd, "wb") as f:
        f.write(png)
    try:
        r = subprocess.run(
            ["tesseract", tmp, "stdout", "-l", "eng", "--psm", "3"],
            capture_output=True, text=True, timeout=120,
        )
        text = r.stdout
    finally:
        os.unlink(tmp)

    text = re.sub(r"\s+", " ", text).strip()
    if len(text) < 25:
        continue
    chunks = [text[j:j + 700] for j in range(0, len(text), 550)]
    for ci, c in enumerate(chunks):
        if len(c.strip()) < 25:
            continue
        out.append({"book": BOOK, "page": i + 1, "chunk": ci, "text": c.strip()})

    if (i + 1) % 25 == 0:
        print(f"  page {i + 1}/{doc.page_count} ({len(out)} chunks)", file=sys.stderr, flush=True)

doc.close()
with open("sat-corpus-official.json", "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False)
print(f"Wrote {len(out)} chunks -> sat-corpus-official.json", file=sys.stderr)
