#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const dir = path.join(ROOT, "Practise tests", "extracted");
const formId = process.argv[2];
const pdfPath = path.resolve(process.argv[3]);
const nPages = Number(process.argv[4] ?? 5);

const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => {
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
      signal: AbortSignal.timeout(120_000),
    });
    const json = await res.json();
    const err = typeof json.error === "string" ? json.error : json.error?.message;
    if (!res.ok) throw new Error(err ?? json.message ?? `HTTP ${res.status}`);
    let md = json.md_results;
    if (!md && Array.isArray(json.layout_details)) md = json.layout_details.flat().map((b) => b?.content ?? "").filter(Boolean).join("\n\n");
    return (md ?? "").trim();
  } catch (e) {
    if (attempt < 6) { await new Promise((r) => setTimeout(r, 30_000 * Math.min(attempt, 3))); return ocr(b64, attempt + 1); }
    throw e;
  }
}

const cachePath = path.join(dir, `${formId}.split-pages.json`);
const cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
const keys = Object.keys(cache).filter((k) => /^page-\d{3}\.jpg$/.test(k)).sort();
const workDir = path.join(dir, formId);

for (const key of keys.slice(-nPages)) {
  const pageNo = Number(key.match(/page-(\d+)\.jpg/)[1]);
  const tmp = path.join(workDir, `key-${pageNo}.jpg`);
  execFileSync("gs", ["-dNOPAUSE", "-dBATCH", "-sDEVICE=jpeg", "-dJPEGQ=90", "-r200", `-dFirstPage=${pageNo}`, `-dLastPage=${pageNo}`, `-sOutputFile=${tmp}`, pdfPath], { timeout: 60_000, stdio: "pipe" });
  const buf = await sharp(tmp).jpeg({ quality: 90 }).toBuffer();
  cache[key] = await ocr(buf.toString("base64"));
  fs.rmSync(tmp, { force: true });
  fs.writeFileSync(cachePath, JSON.stringify(cache));
  console.log(`${formId} ${key}: ${cache[key].length} chars`);
}
console.log("key pages re-OCR done");
