#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "Practise tests", "extracted");

const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

async function ocr(b64, attempt = 1) {
  try {
    const res = await fetch("https://open.bigmodel.cn/api/paas/v4/layout_parsing", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.GLM_OCR_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "glm-ocr", file: `data:image/jpeg;base64,${b64}` }),
      signal: AbortSignal.timeout(90_000),
    });
    const json = await res.json();
    const err = typeof json.error === "string" ? json.error : json.error?.message;
    if (!res.ok) throw new Error(err ?? json.message ?? `HTTP ${res.status}`);
    let md = json.md_results;
    if (!md && Array.isArray(json.layout_details)) {
      md = json.layout_details.flat().map((b) => b?.content ?? "").filter(Boolean).join("\n\n");
    }
    return (md ?? "").replace(/\\\[([\s\S]*?)\\\]/g, (_m, math) => `$${math.trim()}$`).replace(/\\\(([\s\S]*?)\\\)/g, (_m, math) => `$${math.trim()}$`).replace(/\$\$([\s\S]*?)\$\$/g, (_m, math) => `$${math.trim()}$`).trim();
  } catch (e) {
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 1500 * attempt));
      return ocr(b64, attempt + 1);
    }
    throw e;
  }
}

const formIds = process.argv.slice(2);
if (formIds.length === 0) {
  console.error("usage: node scripts/split_ocr_fast.mjs <formId> [formId2 ...]");
  process.exit(1);
}

const tasks = [];
for (const formId of formIds) {
  const cachePath = path.join(OUT_DIR, `${formId}.split-pages.json`);
  const workDir = path.join(OUT_DIR, formId);
  if (!fs.existsSync(workDir)) {
    console.error(`${formId}: no image directory`);
    continue;
  }
  const cache = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, "utf8")) : {};
  fs.writeFileSync(cachePath, JSON.stringify(cache));
  const keys = fs.readdirSync(workDir).filter((f) => f.startsWith("page-") && f.endsWith(".jpg")).sort();
  for (const key of keys) {
    if (cache[key]) continue;
    tasks.push({ formId, cachePath, cache, workDir, key });
  }
  console.log(`${formId}: ${keys.length} pages, ${keys.filter((k) => !cache[k]).length} to OCR`);
}

const CONCURRENCY = 8;
let cursor = 0;
async function worker() {
  while (cursor < tasks.length) {
    const task = tasks[cursor++];
    const imgPath = path.join(task.workDir, task.key);
    const image = sharp(imgPath);
    const metadata = await image.metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (!width || !height) {
      console.error(`bad image ${imgPath}`);
      continue;
    }
    const split = Math.floor(width / 2);
    const left = await sharp(imgPath).extract({ left: 0, top: 0, width: split + 24, height }).jpeg({ quality: 88 }).toBuffer();
    const right = await sharp(imgPath).extract({ left: Math.max(0, split - 24), top: 0, width: width - split + 24, height }).jpeg({ quality: 88 }).toBuffer();
    const [lText, rText] = await Promise.all([ocr(left.toString("base64")), ocr(right.toString("base64"))]);
    task.cache[task.key] = `${lText}\n\n${rText}`.trim();
    fs.writeFileSync(task.cachePath, JSON.stringify(task.cache));
    process.stdout.write(`.`);
  }
}

await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, () => worker()));
console.log(`\nOCR complete for ${formIds.length} tests`);
