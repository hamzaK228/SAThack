#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const dir = path.join(ROOT, "Practise tests", "extracted");
const [formId, pageNo, expected] = process.argv.slice(2);
if (!formId || !pageNo || !expected) {
  console.error("usage: node scripts/vision_key_page.mjs <formId> <pageNo> <expectedCount>");
  process.exit(1);
}

const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
  }),
);

const workDir = path.join(dir, formId);
const hiPath = path.join(workDir, `keyhi-${pageNo}.jpg`);
const srcPage = path.join(workDir, `page-${String(pageNo).padStart(3, "0")}.jpg`);
const pdfPath = process.argv[5]; // optional higher-quality pdf re-render
if (pdfPath) {
  execFileSync("gs", ["-dNOPAUSE", "-dBATCH", "-sDEVICE=jpeg", "-dJPEGQ=92", "-r200", `-dFirstPage=${pageNo}`, `-dLastPage=${pageNo}`, `-sOutputFile=${hiPath}`, path.resolve(pdfPath)], { timeout: 60_000, stdio: "pipe" });
}
const imgPath = fs.existsSync(hiPath) ? hiPath : srcPage;
const b64 = fs.readFileSync(imgPath).toString("base64");

async function ask() {
  const res = await fetch(`${env.SAT_AI_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.SAT_AI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.SAT_AI_MODEL,
      temperature: 0,
      max_tokens: 3000,
      ...(env.SAT_AI_MODEL.toLowerCase().startsWith("glm-5.3") ? { thinking: { type: "enabled" }, reasoning_effort: "low" } : {}),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `This image is an SAT answer key page. Read every numbered answer. Return ONLY JSON: {"answers":{"<question number>":"<answer>"}} for ALL numbered items visible. Answers are A-D or numeric/grid-in values. If several equivalent forms are shown, use the first. Do not skip items. Do not invent items.` },
        { role: "user", content: [{ type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } }, { type: "text", text: `Extract the answer key. There should be ${expected} items.` }] },
      ],
    }),
    signal: AbortSignal.timeout(240_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  return JSON.parse((json.choices?.[0]?.message?.content ?? "{}").replace(/^```(?:json)?\s*|\s*```$/g, ""));
}

let parsed = await ask();
if (Object.keys(parsed.answers ?? {}).length < Number(expected) * 0.9) {
  parsed = await ask(); // one retry
}
const out = {};
for (const [k, v] of Object.entries(parsed.answers ?? {})) out[String(Number(k))] = String(v).split(/[,;]/)[0].replace(/[^A-Za-z0-9.\/-]+$/, "").trim();
const outPath = path.join(dir, `${formId}.key-${pageNo}.json`);
fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
fs.rmSync(hiPath, { force: true });
console.log(`${formId} page ${pageNo}: ${Object.keys(out).length} answers (expected ${expected}) -> ${path.basename(outPath)}`);
console.log(JSON.stringify(out));
