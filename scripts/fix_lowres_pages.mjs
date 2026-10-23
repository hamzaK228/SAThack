#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const formId = process.argv[2];
const pdfPath = path.resolve(process.argv[3]);
if (!formId || !fs.existsSync(pdfPath)) {
  console.error("usage: node scripts/fix_lowres_pages.mjs <formId> <pdf>");
  process.exit(1);
}
const dir = path.join(ROOT, "Practise tests", "extracted");
const cachePath = path.join(dir, `${formId}.split-pages.json`);
const pages = JSON.parse(fs.readFileSync(cachePath, "utf8"));

const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, ".env.local"), "utf8")
    .split("\n")
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at).trim(), line.slice(at + 1).trim().replace(/^["']|["']$/g, "")];
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
    return (md ?? "").trim();
  } catch (e) {
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 1500 * attempt));
      return ocr(b64, attempt + 1);
    }
    throw e;
  }
}

function hasLowChoiceMarkers(text) {
  const re = /!\[\]\(page=0,\s*bbox=\[\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\s*\]\)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const top = Number(m[2]);
    if (top > 100) return true;
  }
  return false;
}

const keys = Object.keys(pages).sort();
const todo = keys.filter((k) => /^page-\d{3}\.jpg$/.test(k) && (hasLowChoiceMarkers(pages[k]) || pages[k].trim().length < 30));
console.log(`${todo.length} pages need high-res re-OCR`);

const workDir = path.join(dir, formId);
fs.mkdirSync(workDir, { recursive: true });

for (const key of todo) {
  const pageNo = Number(key.match(/page-(\d+)\.jpg/)?.[1]);
  if (!pageNo) continue;
  const tmp = path.join(workDir, `hi-${pageNo}.jpg`);
  execFileSync("gs", [
    "-dNOPAUSE", "-dBATCH", "-sDEVICE=jpeg", "-dJPEGQ=90", "-r200",
    `-dFirstPage=${pageNo}`, `-dLastPage=${pageNo}`,
    `-sOutputFile=${tmp}`, pdfPath,
  ], { timeout: 60_000, stdio: "pipe" });
  const meta = await sharp(tmp).metadata();
  const split = Math.floor(meta.width / 2);
  const left = await sharp(tmp).extract({ left: 0, top: 0, width: split + 24, height: meta.height }).jpeg({ quality: 90 }).toBuffer();
  const right = await sharp(tmp).extract({ left: Math.max(0, split - 24), top: 0, width: meta.width - split + 24, height: meta.height }).jpeg({ quality: 90 }).toBuffer();
  const [lText, rText] = await Promise.all([ocr(left.toString("base64")), ocr(right.toString("base64"))]);
  pages[key] = `${lText}\n\n${rText}`.trim();
  fs.rmSync(tmp, { force: true });
  fs.writeFileSync(cachePath, JSON.stringify(pages));
  console.log(`re-OCR page ${pageNo}`);
}

console.log("done");
