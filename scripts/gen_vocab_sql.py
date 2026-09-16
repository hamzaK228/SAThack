#!/usr/bin/env python3
"""Generate chunked vocab-seed SQL files from vocab.json."""
import json, os

words = json.load(open("vocab.json"))

def esc(s):
    return s.replace("'", "''") if s else None

# Build one multi-row INSERT per chunk of ROWS_PER.
ROWS_PER = 120
chunks = []
batch = []
for w in words:
    ex = esc(w.get("example_sentence"))
    tags = esc(json.dumps(w.get("tags") or []))
    row = (
        "('" + esc(w["word"]) + "', '"
        + esc(w["definition"]) + "', "
        + ("NULL" if ex is None else "'" + ex + "'")
        + ", '" + (tags or "{}") + "'::text[])"
    )
    batch.append(row)
    if len(batch) >= ROWS_PER:
        chunks.append(batch)
        batch = []
if batch:
    chunks.append(batch)

os.makedirs("/tmp/vocabchunks", exist_ok=True)
for i, batch in enumerate(chunks):
    stmt = (
        "insert into public.vocab_words (word, definition, example_sentence, tags) values\n"
        + ",\n".join(batch)
        + ";"
    )
    open(f"/tmp/vocabchunks/{i}.sql", "w").write(stmt)
    print(f"/tmp/vocabchunks/{i}.sql: {len(stmt)} bytes ({len(batch)} rows)")

print(f"TOTAL chunks: {len(chunks)}, rows: {len(words)}")
