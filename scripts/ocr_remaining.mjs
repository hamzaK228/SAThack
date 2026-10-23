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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ocr(b64, attempt = 1) {
  try {
    const res = await fetch("https://open.bigmodel.cn/api/paas/v4/layout_parsing", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.GLM_OCR_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "glm-ocr", file: `data:image/jpeg;base64,${b64}` }),
      signal: AbortSignal.timeout(120_000),
    });
    const json = await res.json();
    const err = typeof json.error === "string" ? json.error : json.error?.message;
    if (!res.ok) throw new Error(err ?? json.message ?? `HTTP ${res.status}`);
    let md = json.md_results;
    if (!md && Array.isArray(json.layout_details)) {
      md = json.layout_details.flat().map((b) => b?.content ?? "").filter(Boolean).join("\n\n");
    }
    return (md ?? "")
      .replace(/\\\[([\s\S]*?)\\\]/g, (_m, math) => `$${math.trim()}$`)
      .replace(/\\\(([\s\S]*?)\\\)/g, (_m, math) => `$${math.trim()}$`)
      .replace(/\$\$([\s\S]*?)\$\$/g, (_m, math) => `$${math.trim()}$`)
      .trim();
  } catch (e) {
    const isRate = /rate|limit|速率/i.test(e.message);
    if (attempt < 10) {
      const wait = isRate ? 45_000 * Math.min(attempt, 3) : 2000 * attempt;
      console.log(`  retry ${attempt} (${e.message.slice(0, 60)}) waiting ${wait / 1000}s`);
      await sleep(wait);
      return ocr(b64, attempt + 1);
    }
    throw e;
  }
}

const formIds = process.argv.slice(2).length
  ? process.argv.slice(2)
  : fs.readdirSync(OUT_DIR).filter((f) => f.startsWith("real-") && fs.existsSync(path.join(OUT_DIR, f)) && fs.statSync(path.join(OUT_DIR, f)).isDirectory());

for (const formId of formIds) {
  const cachePath = path.join(OUT_DIR, `${formId}.split-pages.json`);
  const workDir = path.join(OUT_DIR, formId);
  if (!fs.existsSync(workDir)) {
    console.log(`${formId}: no images, skipping`);
    continue;
  }
  const cache = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, "utf8")) : {};
  const keys = fs.readdirSync(workDir).filter((f) => f.startsWith("page-") && f.endsWith(".jpg")).sort();
  const missing = keys.filter((k) => !cache[k]);
  console.log(`\n=== ${formId}: ${keys.length - missing.length}/${keys.length} cached, ${missing.length} to OCR`);
  for (const key of missing) {
    const imgPath = path.join(workDir, key);
    const meta = await sharp(imgPath).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (!width || !height) {
      console.error(`bad image ${imgPath}`);
      continue;
    }
    const split = Math.floor(width / 2);
    const left = await sharp(imgPath).extract({ left: 0, top: 0, width: split + 24, height }).jpeg({ quality: 88 }).toBuffer();
    const right = await sharp(imgPath).extract({ left: Math.max(0, split - 24), top: 0, width: width - split + 24, height }).jpeg({ quality: 88 }).toBuffer();
    const [lText, rText] = await Promise.all([ocr(left.toString("base64")), ocr(right.toString("base64"))]);
    cache[key] = `${lText}\n\n${rText}`.trim();
    fs.writeFileSync(cachePath, JSON.stringify(cache));
    console.log(`  ${key} done (${Object.keys(cache).length}/${keys.length})`);
  }
}
console.log("\nALL OCR DONE");
