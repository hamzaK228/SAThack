#!/usr/bin/env node
// Crop the graph/table/figure region for every flagged real-test question.
// Output: /tmp/figure_crops/<formId>-m<m>-q<n>.jpg  (checkpointed, resumable)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const EXTRACTED = path.join(ROOT, "Practise tests", "extracted");
const OUT_DIR = path.join(ROOT, "Practise tests", "figure_crops");
fs.mkdirSync(OUT_DIR, { recursive: true });

const PDFS = {
  "real-sat-2025-nov-international-v3": "2025 SAT Nov Int V3 Full.pdf",
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

const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
  }),
);

// --- collect flagged questions from drafts -----------------------------------
function figureSpanInfo(q) {
  const passage = q.passage || "";
  const text = q.question_text || "";
  const bracketRe = /\[(?:Graph|Table|Figure|Scatterplot|chart|Chart|Image|Bar graph|pie chart)[^\]]*\]/;
  const choiceTable = (q.choices || []).some((c) => /\[Table/.test(c.text));
  const inPassage = bracketRe.test(passage);
  const inText = bracketRe.test(text);
  const pipesIn = (s) => {
    const lines = s.split(/\n+/).filter((l) => l.includes("|"));
    return lines.length >= 2 ? s : "";
  };
  const htmlIn = (s) => (/<table[\s\S]*<\/table>/.test(s) ? s : "");
  if (choiceTable) return { kind: "choice-table", field: "question_text" };
  if (inPassage) return { kind: "bracket", field: "passage", alt: passage.match(bracketRe)[0].slice(1, -1) };
  if (inText) return { kind: "bracket", field: "question_text", alt: text.match(bracketRe)[0].slice(1, -1) };
  if (htmlIn(passage) || htmlIn(text)) return { kind: "html", field: htmlIn(passage) ? "passage" : "question_text" };
  if (pipesIn(passage) || pipesIn(text)) return { kind: "pipes", field: pipesIn(passage) ? "passage" : "question_text" };
  if (passage.includes("![](page=") || text.includes("![](page=")) return { kind: "marker", field: passage ? "passage" : "question_text" };
  return null;
}

const jobs = [];
for (const [formId, pdfName] of Object.entries(PDFS)) {
  const draftPath = path.join(EXTRACTED, `${formId}.draft.json`);
  if (!fs.existsSync(draftPath)) continue;
  const draft = JSON.parse(fs.readFileSync(draftPath, "utf8"));
  for (const q of draft.questions) {
    const info = figureSpanInfo(q);
    if (!info) continue;
    const outFile = path.join(OUT_DIR, `${formId}-m${q.module_index + 1}-q${q.number}.jpg`);
    if (fs.existsSync(outFile)) continue;
    jobs.push({ formId, pdf: path.join(ROOT, "Practise tests", pdfName), page: q.source_page, m: q.module_index + 1, n: q.number, kind: info.kind, alt: (info.alt || "").slice(0, 120), outFile, draftPath, moduleIndex: q.module_index, number: q.number });
  }
}
console.log(`${jobs.length} figures to crop`);

// --- vision bbox --------------------------------------------------------------
async function bbox(b64, job) {
  const what = job.kind === "choice-table"
    ? "the four small answer-choice tables labeled A, B, C, and D"
    : job.alt
      ? `the figure/graph/table described as: ${job.alt}`
      : "the data table or graph/figure that belongs to this question (rows and columns of data, chart, graph, or diagram)";
  const res = await fetch(`${env.SAT_AI_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.SAT_AI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.SAT_AI_MODEL, temperature: 0, max_tokens: 400,
      ...(env.SAT_AI_MODEL.toLowerCase().startsWith("glm-5.3") ? { thinking: { type: "enabled" }, reasoning_effort: "low" } : {}),
      response_format: { type: "json_object" },
      messages: [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
          { type: "text", text: `This is one page of a Digital SAT exam. Locate ${what}. Return ONLY JSON {"top":number,"left":number,"width":number,"height":number} — percentages (0-100) of the image dimensions for the TIGHT bounding box around that element including its title/labels/axis labels but excluding question text and answer choices. No prose.` },
        ],
      }],
    }),
    signal: AbortSignal.timeout(240_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  let out = JSON.parse((j.choices[0].message.content ?? "{}").replace(/^```(?:json)?\s*|\s*```$/g, ""));
  if (out && typeof out.answer === "string") out = JSON.parse(out.answer);
  if (out && out.answer && typeof out.answer === "object") out = out.answer;
  const labels = ["A", "B", "C", "D"];
  if (out && labels.every((k) => out[k] && typeof out[k].top === "number")) {
    const l = Math.min(...labels.map((k) => out[k].left));
    const t = Math.min(...labels.map((k) => out[k].top));
    const r = Math.max(...labels.map((k) => out[k].left + out[k].width));
    const b = Math.max(...labels.map((k) => out[k].top + out[k].height));
    out = { top: t, left: l, width: r - l, height: b - t };
  }
  if (typeof out.top !== "number" || typeof out.left !== "number" || typeof out.width !== "number" || typeof out.height !== "number") throw new Error("non-JSON bbox");
  if (out.width < 3 || out.height < 3 || out.width > 98 || out.height > 98) throw new Error(`implausible bbox ${JSON.stringify(out)}`);
  return out;
}

const failures = [];
for (const job of jobs) {
  const tmp = path.join(OUT_DIR, `_page-${job.formId}-${job.page}.jpg`);
  try {
    execFileSync("gs", ["-dNOPAUSE", "-dBATCH", "-sDEVICE=jpeg", "-dJPEGQ=85", "-r150", `-dFirstPage=${job.page}`, `-dLastPage=${job.page}`, `-sOutputFile=${tmp}`, job.pdf], { timeout: 60_000, stdio: "pipe" });
    const b64 = fs.readFileSync(tmp).toString("base64");
    let b = null;
    for (let attempt = 1; attempt <= 3 && !b; attempt++) {
      try { b = await bbox(b64, job); } catch (e) { if (attempt === 3) throw e; await new Promise((r) => setTimeout(r, 4000)); }
    }
    const meta = await sharp(tmp).metadata();
    const pad = Math.round(meta.width * 0.02);
    const l = Math.max(0, Math.round(meta.width * b.left / 100) - pad);
    const t = Math.max(0, Math.round(meta.height * b.top / 100) - pad);
    const w = Math.min(meta.width - l, Math.round(meta.width * b.width / 100) + 2 * pad);
    const h = Math.min(meta.height - t, Math.round(meta.height * b.height / 100) + 2 * pad);
    await sharp(tmp).extract({ left: l, top: t, width: w, height: h }).jpeg({ quality: 88 }).toFile(job.outFile);
    console.log(`ok ${path.basename(job.outFile)} (${w}x${h})`);
  } catch (e) {
    console.log(`FAIL ${path.basename(job.outFile)}: ${e.message}`);
    failures.push(job);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}
fs.writeFileSync(path.join(OUT_DIR, "failures.json"), JSON.stringify(failures, null, 1));
console.log(`\ndone: ${jobs.length - failures.length} cropped, ${failures.length} failed`);
