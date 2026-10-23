#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const formId = process.argv[2];
if (!formId) {
  console.error("usage: node scripts/parse_answer_key.mjs <formId>");
  process.exit(1);
}

const splitPath = path.join(ROOT, "Practise tests", "extracted", `${formId}.split-pages.json`);
if (!fs.existsSync(splitPath)) {
  console.error(`missing ${splitPath}`);
  process.exit(2);
}
const pages = JSON.parse(fs.readFileSync(splitPath, "utf8"));
const keys = Object.keys(pages).sort();
const keyText = keys.slice(-4).map((k) => pages[k]).join("\n\n");

function clean(text) {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\bModule\s+(\d):/gi, "MODULE $1:")
    .replace(/\s+/g, " ")
    .trim();
}

function parse(text) {
  const t = clean(text);
  // Split into up to 4 sections by module headers
  const headerRegex = /MODULE\s+\d:\s*(Reading and Writing|Math)/gi;
  const positions = [];
  let m;
  while ((m = headerRegex.exec(t)) !== null) positions.push({ index: m.index, header: m[0] });
  const sections = [];
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].index;
    const end = positions[i + 1]?.index ?? t.length;
    sections.push(t.slice(start, end));
  }
  const modules = [];
  for (let i = 0; i < 4; i++) {
    const expected = i < 2 ? 27 : 22;
    const section = sections[i] ?? "";
    const pairs = [];
    const re = /(\d+)\.\s*([^\n]+?)(?=\s+\d+\.|$)/g;
    let mm;
    while ((mm = re.exec(section)) !== null) {
      const num = Number(mm[1]);
      let ans = mm[2].replace(/\s+/g, " ").trim();
      ans = ans.split(/[,;]/)[0].trim();
      // strip trailing markdown/punctuation, keep letters, numbers, fractions, decimals, negatives
      ans = ans.replace(/[^A-Za-z0-9.\/-]+$/, "").trim();
      // if the answer is something like "B (paragraph)", keep only the first token
      const first = ans.split(/\s+/)[0];
      if (/^[A-Da-d]$/.test(first) || (!/^[A-Da-d]$/.test(ans) && first.length > 0)) {
        ans = first;
      }
      pairs.push({ num, ans });
    }
    pairs.sort((a, b) => a.num - b.num);
    const map = new Map();
    for (const p of pairs) if (!map.has(p.num)) map.set(p.num, p.ans);
    const arr = [];
    for (let n = 1; n <= expected; n++) arr.push(map.get(n) ?? "");
    modules.push(arr);
  }
  return modules;
}

const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, ".env.local"), "utf8")
    .split("\n")
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at).trim(), line.slice(at + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const baseUrl = (env.SAT_AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
const model = env.SAT_AI_MODEL || "glm-5.3-flash";

async function parseWithAi(text) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.SAT_AI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 4000,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'You are given the text of the last few pages of a Digital SAT exam, which contain the answer key. Return ONLY JSON: {"rw1":[...27 answers...],"rw2":[...27 answers...],"math1":[...22 answers...],"math2":[...22 answers...]}. Answers are letters A-D or numeric/grid-in values. If multiple acceptable forms are listed for a grid-in, use the first listed form.',
        },
        { role: "user", content: text },
      ],
    }),
    signal: AbortSignal.timeout(240_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const json = await response.json();
  const content = (json.choices?.[0]?.message?.content ?? "{}").replace(/^```(?:json)?\s*|\s*```$/g, "");
  const parsed = JSON.parse(content);
  return [parsed.rw1 ?? [], parsed.rw2 ?? [], parsed.math1 ?? [], parsed.math2 ?? []];
}

let modules = parse(keyText);
const missing = modules.some((m) => m.includes(""));
if (missing) {
  console.log("regex parse incomplete, falling back to AI…");
  try {
    modules = await parseWithAi(keyText);
  } catch (e) {
    console.error(`AI parse failed: ${e.message}`);
  }
}

const out = { formId, modules, counts: modules.map((m) => m.length) };
const outPath = path.join(ROOT, "Practise tests", "extracted", `${formId}.answers.json`);
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`wrote ${outPath}`);
for (let i = 0; i < 4; i++) {
  const missingCount = modules[i].filter((a) => !a).length;
  console.log(`module ${i + 1}: ${modules[i].length} answers, ${missingCount} missing`);
  console.log(modules[i].join(","));
}
