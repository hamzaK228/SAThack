#!/usr/bin/env python3
"""Seed vocab_words from vocab.json via the REST API (RLS must be disabled first)."""
import json, os, sys, requests

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

    words = json.load(open("vocab.json"))
    endpoint = f"{url}/rest/v1/vocab_words"

    batch = 200
    total = 0
    for i in range(0, len(words), batch):
        chunk = words[i : i + batch]
        resp = requests.post(endpoint, headers=headers, json=chunk, timeout=120)
        if resp.status_code >= 300:
            print(f"FAIL at {i}: HTTP {resp.status_code} {resp.text[:300]}", file=sys.stderr)
            sys.exit(1)
        total += len(chunk)
        print(f"  inserted {total}/{len(words)}", file=sys.stderr)

    print(f"Done. Inserted {total} words.", file=sys.stderr)

if __name__ == "__main__":
    main()
