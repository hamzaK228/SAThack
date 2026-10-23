#!/usr/bin/env node
// Verify each figure crop is complete; re-crop clipped ones with an adjusted bbox.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "Practise tests", "figure_crops");
const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
  }),
);
const PDFS = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts", "figure_pdfs.json"), "utf8"));
const PLAN = null;

const draftCache = new Map();
function questionFor(formId, m, n) {
  if (!draftCache.has(formId)) draftCache.set(formId, JSON.parse(fs.readFileSync(path.join(ROOT, "Practise tests", "extracted", `${formId}.draft.json`), "utf8")));
  const d = draftCache.get(formId);
  return d.questions.find((q) => q.module_index + 1 === m && q.number === n);
}

function figureSpanInfo(q) {
  const passage = q.passage || "";
  const text = q.question_text || "";
  const bracketRe = /\[(?:Graph|Table|Figure|Diagram|Triangle|Scatterplot|Plot|Coordinate plane|Line segment|chart|Chart|Image|Bar graph|pie chart)[^\]]*\]/i;
  const choiceTable = (q.choices || []).some((c) => /\[Table/.test(c.text));
  const inPassage = bracketRe.test(passage);
  const inText = bracketRe.test(text);
  if (choiceTable) return { kind: "choice-table", alt: "" };
  if (inPassage) return { kind: "bracket", alt: passage.match(bracketRe)[0].slice(1, -1) };
  if (inText) return { kind: "bracket", alt: text.match(bracketRe)[0].slice(1, -1) };
  if (/<table[\s\S]*<\/table>/.test(passage) || /<table[\s\S]*<\/table>/.test(text)) return { kind: "html", alt: "" };
  if ((passage.match(/\|/g) || []).length >= 6 || (text.match(/\|/g) || []).length >= 6) return { kind: "pipes", alt: "" };
  return { kind: "marker", alt: "" };
}

async function vision(images, text, maxTokens = 400) {
  const res = await fetch(`${env.SAT_AI_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.SAT_AI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.SAT_AI_MODEL, temperature: 0, max_tokens: maxTokens,
      ...(env.SAT_AI_MODEL.toLowerCase().startsWith("glm-5.3") ? { thinking: { type: "enabled" }, reasoning_effort: "low" } : {}),
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: [...images.map((b64) => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } })), { type: "text", text }] }],
    }),
    signal: AbortSignal.timeout(240_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  return JSON.parse((j.choices[0].message.content ?? "{}").replace(/^```(?:json)?\s*|\s*```$/g, ""));
}

function describe(info) {
  return info.kind === "choice-table"
    ? "the four small answer-choice tables labeled A, B, C, and D"
    : info.alt
      ? `the figure/graph/table described as: ${info.alt}`
      : "the data table or graph/figure that belongs to this question";
}

async function bboxOnPage(b64, desc, warn) {
  const out = await vision([b64], `This is one page of a Digital SAT exam. Locate ${desc}. Return ONLY JSON {"top":number,"left":number,"width":number,"height":number} — percentages (0-100) of the image dimensions for the TIGHT bounding box around that element including its title, labels, axes and legend, but excluding question text and answer choices.${warn ? ` A previous attempt cut off: ${warn}. Expand the box so NOTHING of the element is cut.` : ""} No prose.`);
  let o = out;
  if (o && typeof o.answer === "string") o = JSON.parse(o.answer);
  if (o && o.answer && typeof o.answer === "object") o = o.answer;
  const labels = ["A", "B", "C", "D"];
  if (o && labels.every((k) => o[k] && typeof o[k].top === "number")) {
    const l = Math.min(...labels.map((k) => o[k].left));
    const t = Math.min(...labels.map((k) => o[k].top));
    const r = Math.max(...labels.map((k) => o[k].left + o[k].width));
    const b = Math.max(...labels.map((k) => o[k].top + o[k].height));
    o = { top: t, left: l, width: r - l, height: b - t };
  }
  if (typeof o.top !== "number") throw new Error("non-JSON bbox");
  return o;
}

const crops = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith(".jpg") && !f.startsWith("_"));
console.log(`${crops.length} crops to verify`);
const stillBad = [];
for (const file of crops) {
  const m = file.match(/^(real-sat-.+)-m(\d)-q(\d+)\.jpg$/);
  if (!m) continue;
  const [, formId, ms, ns] = m;
  const q = questionFor(formId, Number(ms), Number(ns));
  const info = figureSpanInfo(q);
  const desc = describe(info);
  const cropPath = path.join(OUT_DIR, file);
  try {
    const cropB64 = fs.readFileSync(cropPath).toString("base64");
    let verdict = null;
    for (let a = 1; a <= 3 && !verdict; a++) {
      try {
        verdict = await vision([cropB64], `This is a cropped element from a Digital SAT question: ${desc}. Is the element COMPLETE in this crop — title, all rows/columns, axes, labels, legend, all data — with nothing cut off at any edge? Return ONLY JSON {"complete":boolean,"missing":"what is cut off or missing, empty if complete"}.`);
        if (typeof verdict.complete !== "boolean") verdict = null;
      } catch (e) { if (a === 3) throw e; await new Promise((r) => setTimeout(r, 4000)); }
    }
    if (!verdict) throw new Error("no verdict");
    if (verdict.complete) { process.stdout.write("."); continue; }

    // Re-crop with the warning
    const page = q.source_page;
    const pdf = path.join(ROOT, "Practise tests", PDFS[formId]);
    const tmp = path.join(OUT_DIR, `_v-${file}`);
    execFileSync("gs", ["-dNOPAUSE", "-dBATCH", "-sDEVICE=jpeg", "-dJPEGQ=85", "-r150", `-dFirstPage=${page}`, `-dLastPage=${page}`, `-sOutputFile=${tmp}`, pdf], { timeout: 60_000, stdio: "pipe" });
    const pageB64 = fs.readFileSync(tmp).toString("base64");
    let done = false;
    for (let pass = 1; pass <= 2 && !done; pass++) {
      const b = await bboxOnPage(pageB64, desc, pass === 1 ? verdict.missing : verdict.missing + " (still cut off in the last attempt; be generous)");
      const meta = await sharp(tmp).metadata();
      const pad = Math.round(meta.width * 0.025);
      const l = Math.max(0, Math.round(meta.width * b.left / 100) - pad);
      const t = Math.max(0, Math.round(meta.height * b.top / 100) - pad);
      const w = Math.min(meta.width - l, Math.round(meta.width * b.width / 100) + 2 * pad);
      const h = Math.min(meta.height - t, Math.round(meta.height * b.height / 100) + 2 * pad);
      const newBuf = await sharp(tmp).extract({ left: l, top: t, width: w, height: h }).jpeg({ quality: 88 }).toBuffer();
      const check = await vision([newBuf.toString("base64")], `Is this a complete ${desc} with nothing cut off? Return ONLY JSON {"complete":boolean,"missing":"..."}`);
      if (check.complete) {
        fs.writeFileSync(cropPath, newBuf);
        console.log(`\nRE-CROPPED ${file} (${w}x${h})`);
        done = true;
      }
    }
    if (!done) { stillBad.push(file); console.log(`\nSTILL CLIPPED ${file}`); }
    fs.rmSync(tmp, { force: true });
  } catch (e) {
    stillBad.push(file);
    console.log(`\nERROR ${file}: ${e.message}`);
  }
}
fs.writeFileSync(path.join(OUT_DIR, "still_bad.json"), JSON.stringify(stillBad, null, 1));
console.log(`\nverify done: ${crops.length - stillBad.length} ok, ${stillBad.length} flagged`);
