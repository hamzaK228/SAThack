#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const PDF_DIR = path.join(ROOT, "Practise tests");
const OUT_DIR = path.join(PDF_DIR, "extracted");

function titleFromFilename(name) {
  const months = {
    january: "January", february: "February", march: "March", april: "April",
    may: "May", june: "June", july: "July", august: "August",
    september: "September", october: "October", november: "November", december: "December",
  };
  let t = name.replace(/\.pdf$/i, "").replace(/\bFull\b/ig, "").replace(/\bInt\.?\b/ig, "International");
  t = t.replace(/(\d{4})\s+SAT/i, "SAT $1");
  for (const [abbr, full] of Object.entries(months)) {
    t = t.replace(new RegExp(`\\b${abbr}\\.?\\b`, "ig"), full);
  }
  t = t.replace(/\bv(?:ersion)?\s*(\d)\b/ig, (_m, d) => `V${d}`);
  return t.replace(/\s+/g, " ").trim();
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 38);
}

const pdfs = fs.readdirSync(PDF_DIR).filter((f) => f.toLowerCase().endsWith(".pdf")).sort();
const only = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const rerender = process.argv.includes("--rerender");
const targets = only
  ? pdfs.filter((f) => f.toLowerCase().includes(only.toLowerCase()))
  : pdfs;

for (const pdf of targets) {
  const title = titleFromFilename(path.basename(pdf, ".pdf"));
  const formId = `real-${slugify(title)}`;
  const workDir = path.join(OUT_DIR, formId);
  fs.mkdirSync(workDir, { recursive: true });
  const existing = fs.readdirSync(workDir).filter((f) => f.startsWith("page-") && f.endsWith(".jpg"));
  if (existing.length > 0 && !rerender) {
    console.log(`${formId}: ${existing.length} images already — skipping`);
    continue;
  }
  if (rerender) {
    for (const f of existing) fs.rmSync(path.join(workDir, f), { force: true });
  }
  console.log(`${formId}: rendering ${pdf} with Ghostscript…`);
  execFileSync("gs", [
    "-dNOPAUSE", "-dBATCH", "-sDEVICE=jpeg",
    "-dJPEGQ=80", "-r110",
    `-sOutputFile=${path.join(workDir, "page-%03d.jpg")}`,
    path.join(PDF_DIR, pdf),
  ], { timeout: 10 * 60_000, stdio: "pipe" });
  const count = fs.readdirSync(workDir).filter((f) => f.startsWith("page-") && f.endsWith(".jpg")).length;
  console.log(`  -> ${count} pages`);
}
