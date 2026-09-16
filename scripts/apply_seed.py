#!/usr/bin/env python3
"""
Seed the Supabase `questions` table from question-bank.json via the REST API.

Requires a temporary RLS INSERT policy to be in place first (see README in
scripts/ or run this after creating it). Uses the anon key from .env.local.
"""

import json
import sys
import requests


def load_env(path=".env.local"):
    env = {}
    with open(path) as fh:
        for line in fh:
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return env


def main():
    env = load_env()
    url = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
    anon = env["NEXT_PUBLIC_SUPABASE_ANON_KEY"]
    headers = {
        "apikey": anon,
        "Authorization": f"Bearer {anon}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }

    with open("question-bank.json", encoding="utf-8") as fh:
        questions = json.load(fh)["questions"]

    rows = []
    seen = set()
    for q in questions:
        sid = q.get("id")
        if sid in seen:
            continue
        seen.add(sid)
        rows.append({
            "section": q["section"],
            "domain": q["domain"],
            "skill": q.get("skill"),
            "difficulty": q["difficulty"],
            "passage": q.get("stimulus"),
            "question_text": q["stem"],
            "choices": q.get("choices") or [],
            "correct_answer": q["answer"],
            "explanation": q.get("rationale"),
            "source_id": sid,
            "is_grid_in": q["type"] == "grid_in",
            "is_official": True,
        })

    endpoint = f"{url}/rest/v1/questions"
    batch = 200
    for i in range(0, len(rows), batch):
        chunk = rows[i : i + batch]
        resp = requests.post(endpoint, headers=headers, json=chunk, timeout=120)
        if resp.status_code >= 300:
            print(f"FAIL batch starting at {i}: HTTP {resp.status_code} {resp.text[:300]}", file=sys.stderr)
            sys.exit(1)
        print(f"  inserted {min(i + batch, len(rows))}/{len(rows)}", file=sys.stderr)

    print(f"Done. Inserted {len(rows)} questions.", file=sys.stderr)


if __name__ == "__main__":
    main()
