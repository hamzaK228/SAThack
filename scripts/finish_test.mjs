#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const PDF_DIR = path.join(ROOT, "Practise tests");
const PDFS = {
  "real-sat-august-2025-v1-international": "SAT August 2025 v1 Int. Full.pdf",
  "real-sat-dec-2025-v1": "SAT Dec 2025 V1 Full.pdf",
  "real-sat-dec-2025-v2": "SAT Dec 2025 V2 Full.pdf",
  "real-sat-dec-2025-v3": "SAT Dec 2025 V3 Full.pdf",
  "real-sat-nov-2025-international-v1": "SAT Nov 2025 Int V1 Full.pdf",
  "real-sat-nov-2025-international-v2": "SAT Nov 2025 Int V2 Full.pdf",
  "real-sat-march-2026-v1": "SAT March 2026 V1 Full.pdf",
  "real-sat-march-2026-v2": "SAT March 2026 V2 Full.pdf",
  "real-sat-may-2026-v1": "SAT May 2026 V1 Full.pdf",
  "real-sat-may-2026-v2": "SAT May 2026 V2 Full.pdf",
  "real-sat-may-2026-v3": "SAT May 2026 V3 Full.pdf",
  "real-sat-june-2026-v1": "SAT June 2026 V1 Full.pdf",
  "real-sat-june-2026-v2": "SAT June 2026 V2 Full.pdf",
};

const targets = process.argv.slice(2).length
  ? process.argv.slice(2)
  : Object.keys(PDFS).filter((id) => !fs.existsSync(path.join(ROOT, "Practise tests", "extracted", `${id}.draft.json`)));

for (const formId of targets) {
  const pdf = path.join(PDF_DIR, PDFS[formId]);
  console.log(`\n=== ${formId} ===`);
  const run = (script, args) => {
    console.log(`$ node scripts/${script} ${args.join(" ")}`);
    execFileSync("node", [path.join(ROOT, "scripts", script), ...args], { stdio: "inherit", cwd: ROOT });
  };
  run("parse_answer_key.mjs", [formId]);
  run("fix_lowres_pages.mjs", [formId, pdf]);
  run("structure_test.mjs", [formId]);
}
console.log("\nALL DONE");
