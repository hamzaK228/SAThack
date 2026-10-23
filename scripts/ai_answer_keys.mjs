#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const dir = path.join(ROOT, "Practise tests", "extracted");
const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
  }),
);
const baseUrl = (env.SAT_AI_BASE_URL || "").replace(/\/$/, "");
const model = env.SAT_AI_MODEL || "glm-5.3-flash";

const OVERLAYS = {
  "real-sat-march-2026-v1": { keyFiles: { 1: "real-sat-march-2026-v1.key-100.json" } },
  "real-sat-march-2026-v2": { keyFiles: { 0: "real-sat-march-2026-v2.key-99.json" } },
  "real-sat-may-2026-v1": { keyFiles: { 0: "real-sat-may-2026-v1.key-100.json" }, fixes: { 3: { 21: "527.6" } } },
  "real-sat-dec-2025-v3": { keyFiles: { 2: "real-sat-dec-2025-v3.key-101.json" }, fixes: { 2: { 12: "" } } },
  "real-sat-june-2026-v1": {
    keyFiles: { 0: "real-sat-june-2026-v1.key-104.json", 1: "real-sat-june-2026-v1.key-105.json" },
    hardcoded: {
      2: ["D", "B", "21", "A", "A", "D", "130", "C", "43/3", "C", "B", "B", "B", "D", "5.5", "B", "A", "C", "C", "27", "D", "62951"],
      3: ["10", "A", "48", "C", "A", "C", "170", "C", "C", "D", "D", "C", "D", "D", "B", "B", "D", "17", "60000", "D", "D", "36"],
    },
  },
  "real-sat-june-2026-v2": {
    keyFiles: { 0: "real-sat-june-2026-v2.key-104.json", 1: "real-sat-june-2026-v2.key-105.json" },
    hardcoded: {
      2: ["D", "B", "D", "20", "D", "52", "A", "B", "C", "12.08", "C", "B", "A", "B", "12", "D", "170", "A", "B", "A", "C", "83"],
      3: ["B", "7", "D", "D", "A", "A", "C", "160", "C", "C", "C", "D", "B", "B", "A", "A", "D", "5400", "31", "B", "D", "36"],
    },
  },
};

async function aiParse(text, lengths) {
  const prompt = {
    model,
    temperature: 0,
    max_tokens: 4000,
    ...(model.toLowerCase().startsWith("glm-5.3") ? { thinking: { type: "enabled" }, reasoning_effort: "low" } : {}),
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          'You are given OCR text of the answer-key pages of one Digital SAT exam. The key has four modules in this order: (1) Reading & Writing Module 1, (2) Reading & Writing Module 2, (3) Math Module 1, (4) Math Module 2. Module headers may be missing, out of order, or the text may be scrambled; use question numbering (each module restarts at 1), the stated module sizes, and page boundaries to reconstruct. Return ONLY JSON: {"rw1":[...], "rw2":[...], "math1":[...], "math2":[...]}. rw1 and rw2 must have exactly 27 answers, math1 and math2 exactly 22. Answers are A-D letters or grid-in values; if several equivalent forms are shown for one item, use the first; if an item genuinely does not exist in the key, use "".',
      },
      { role: "user", content: `ANSWER KEY PAGES:\n\n${text}` },
    ],
  };
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.SAT_AI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(prompt),
    signal: AbortSignal.timeout(240_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return JSON.parse((json.choices?.[0]?.message?.content ?? "{}").replace(/^```(?:json)?\s*|\s*```$/g, ""));
}

const tests = process.argv.slice(2).length
  ? process.argv.slice(2)
  : Object.keys(OVERLAYS).concat(["real-sat-dec-2025-v2", "real-sat-nov-2025-international-v1", "real-sat-nov-2025-international-v2", "real-sat-may-2026-v2", "real-sat-may-2026-v3"]);

for (const formId of tests) {
  const splitPath = path.join(dir, `${formId}.split-pages.json`);
  const pagesPath = path.join(dir, `${formId}.pages.json`);
  const parts = [];
  const take = (cache, n) => {
    if (!fs.existsSync(cache)) return;
    const o = JSON.parse(fs.readFileSync(cache, "utf8"));
    const keys = Object.keys(o).filter((k) => /^page-\d{3}\.jpg$/.test(k)).sort().slice(-n);
    parts.push(keys.map((k) => `--- ${k} ---\n${o[k] ?? ""}`).join("\n\n"));
  };
  take(splitPath, 5);
  take(pagesPath, 4);
  const text = parts.join("\n\n=== ALTERNATIVE OCR OF THE SAME PAGES ===\n\n");

  let arrays = null;
  for (let attempt = 1; attempt <= 2 && !arrays; attempt++) {
    try {
      const parsed = await aiParse(text, [27, 27, 22, 22]);
      const cand = [parsed.rw1 ?? [], parsed.rw2 ?? [], parsed.math1 ?? [], parsed.math2 ?? []];
      if (cand.every((a, i) => a.length === (i < 2 ? 27 : 22) && a.every((x) => typeof x === "string"))) arrays = cand;
      else console.log(`${formId}: AI attempt ${attempt} bad lengths ${cand.map((a) => a.length).join(",")}`);
    } catch (e) {
      console.log(`${formId}: AI attempt ${attempt} failed: ${e.message}`);
    }
  }
  if (!arrays) {
    console.log(`${formId}: AI parse failed — keeping regex answers.json if present`);
    continue;
  }

  const ov = OVERLAYS[formId] ?? {};
  if (ov.keyFiles) {
    for (const [idx, file] of Object.entries(ov.keyFiles)) {
      const o = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
      const expected = idx < 2 ? 27 : 22;
      const arr = [];
      for (let n = 1; n <= expected; n++) arr.push(o[String(n)] ?? "");
      arrays[Number(idx)] = arr;
    }
  }
  if (ov.hardcoded) for (const [idx, arr] of Object.entries(ov.hardcoded)) arrays[Number(idx)] = arr;
  if (ov.fixes) for (const [idx, fixes] of Object.entries(ov.fixes)) for (const [pos, val] of Object.entries(fixes)) arrays[Number(idx)][Number(pos)] = val;

  const missing = arrays.map((a) => a.filter((x) => !x).length);
  const out = { formId, modules: arrays, counts: arrays.map((a) => a.length), missingPerModule: missing };
  fs.writeFileSync(path.join(dir, `${formId}.answers.json`), JSON.stringify(out, null, 1));
  console.log(`${formId}: OK lengths=${arrays.map((a) => a.length).join(",")} missing=${missing.join(",")}`);
}
console.log("done");
