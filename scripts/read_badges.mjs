#!/usr/bin/env node
// Read printed question-number badges for a page range via vision (batches of 6 crops).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const dir = path.join(ROOT, "Practise tests", "extracted");
const [formId, pdfArg, fromArg, toArg] = process.argv.slice(2);
const from = Number(fromArg), to = Number(toArg);
if (!formId || !from || !to) { console.error("usage: read_badges.mjs <formId> <pdf> <from> <to>"); process.exit(1); }
const pdfPath = path.resolve(pdfArg);

const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));
const workDir = path.join(dir, formId);
fs.mkdirSync(workDir, { recursive: true });

async function ask(images) {
  const content = images.map((b64) => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } }));
  content.push({ type: "text", text: `These are ${images.length} cropped header strips from consecutive pages of a Digital SAT PDF. Each contains a black badge with a white question number (1-27 or 1-22). Return ONLY JSON: {"numbers":[<int per image in order>]}. Use -1 if unreadable.` });
  const res = await fetch(`${env.SAT_AI_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.SAT_AI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: env.SAT_AI_MODEL, temperature: 0, max_tokens: 500, ...(env.SAT_AI_MODEL.toLowerCase().startsWith("glm-5.3") ? { thinking: { type: "enabled" }, reasoning_effort: "low" } : {}), response_format: { type: "json_object" }, messages: [{ role: "user", content }] }),
    signal: AbortSignal.timeout(240_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  return JSON.parse((j.choices?.[0]?.message?.content ?? "{}").replace(/^```(?:json)?\s*|\s*```$/g, "")).numbers ?? [];
}

const crops = [];
for (let p = from; p <= to; p++) {
  const tmp = path.join(workDir, `badge-${p}.jpg`);
  execFileSync("gs", ["-dNOPAUSE", "-dBATCH", "-sDEVICE=jpeg", "-dJPEGQ=85", "-r120", `-dFirstPage=${p}`, `-dLastPage=${p}`, `-sOutputFile=${tmp}`, pdfPath], { timeout: 60_000, stdio: "pipe" });
  const meta = await sharp(tmp).metadata();
  const left = Math.floor(meta.width * 0.52), top = 0, width = meta.width - left, height = Math.floor(meta.height * 0.22);
  const buf = await sharp(tmp).extract({ left, top, width, height }).jpeg({ quality: 85 }).toBuffer();
  fs.rmSync(tmp, { force: true });
  crops.push({ page: p, b64: buf.toString("base64") });
}

const result = {};
for (let i = 0; i < crops.length; i += 6) {
  const batch = crops.slice(i, i + 6);
  let numbers = [];
  try { numbers = await ask(batch.map((c) => c.b64)); } catch (e) { console.log(`batch failed: ${e.message}`); }
  if (!Array.isArray(numbers) || numbers.length !== batch.length) numbers = batch.map(() => -1);
  batch.forEach((c, k) => { result[c.page] = numbers[k]; });
}
fs.writeFileSync(path.join(dir, `${formId}.badges.json`), JSON.stringify(result, null, 1));
console.log(JSON.stringify(result));
