#!/usr/bin/env node
/**
 * Batch-extract real SAT exam PDFs (scans) into structured question drafts.
 *
 * Per PDF: pdftoppm renders pages -> GLM-OCR per page (checkpointed, resumable)
 * -> chat-model JSON structuring in 6-page chunks -> answer-key resolution pass
 * -> Practise tests/extracted/<formId>.draft.json
 *
 * Resumable: per-page OCR text is cached in <formId>.pages.json; a completed
 * draft short-circuits the test on re-run. Failed tests write FAILED-<formId>.txt.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const PDF_DIR = path.join(ROOT, "Practise tests");
const OUT_DIR = path.join(PDF_DIR, "extracted");
fs.mkdirSync(OUT_DIR, { recursive: true });

// --- env ---------------------------------------------------------------------
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(ROOT, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const OCR_KEY = env.GLM_OCR_API_KEY;
const AI_KEY = env.SAT_AI_API_KEY;
const AI_BASE = (env.SAT_AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
const AI_MODEL = env.SAT_AI_MODEL || "glm-5.3-flash";
if (!OCR_KEY || !AI_KEY) {
  console.error("Missing GLM_OCR_API_KEY or SAT_AI_API_KEY in .env.local");
  process.exit(1);
}

// --- helpers -----------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function titleFromFilename(name) {
  const months = {
    january: "January", february: "February", march: "March", april: "April",
    may: "May", june: "June", july: "July", august: "August",
    september: "September", october: "October", november: "November", december: "December",
  };
  let t = name.replace(/\.pdf$/i, "").replace(/\bFull\b/ig, "").replace(/\bInt\.?\b/ig, "International");
  t = t.replace(/(\d{4})\s+SAT/i, "SAT $1"); // "2025 SAT Nov" -> "SAT 2025 Nov"
  for (const [abbr, full] of Object.entries(months)) {
    t = t.replace(new RegExp(`\\b${abbr}\\.?\\b`, "ig"), full);
  }
  t = t.replace(/\bv(?:ersion)?\s*(\d)\b/ig, (_m, d) => `V${d}`);
  return t.replace(/\s+/g, " ").trim();
}

const MONTH_INDEX = { january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11 };

function sortKey(name) {
  const lower = name.toLowerCase();
  const year = Number(lower.match(/(20\d{2})/)?.[1] ?? 9999);
  const month = Object.entries(MONTH_INDEX).find(([m]) => lower.includes(m))?.[1] ?? 12;
  const version = Number(lower.match(/v(?:ersion)?\s*(\d)/)?.[1] ?? 1);
  return year * 10000 + month * 100 + version;
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 38);
}

async function ocrPage(imagePath, attempt = 1) {
  const b64 = fs.readFileSync(imagePath).toString("base64");
  try {
    const res = await fetch("https://open.bigmodel.cn/api/paas/v4/layout_parsing", {
      method: "POST",
      headers: { Authorization: `Bearer ${OCR_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "glm-ocr", file: `data:image/jpeg;base64,${b64}` }),
      signal: AbortSignal.timeout(90_000),
    });
    const json = await res.json();
    const err = typeof json.error === "string" ? json.error : json.error?.message;
    if (!res.ok) throw new Error(err ?? json.message ?? `HTTP ${res.status}`);
    let md = json.md_results;
    // Some pages come back as layout blocks without markdown; reconstruct from
    // the block contents. A page with neither is genuinely blank.
    if (!md && Array.isArray(json.layout_details)) {
      md = json.layout_details
        .flat()
        .map((block) => block?.content ?? "")
        .filter(Boolean)
        .join("\n\n");
    }
    return normalizeMath(md ?? "");
  } catch (e) {
    if (attempt < 3) {
      await sleep(1500 * attempt);
      return ocrPage(imagePath, attempt + 1);
    }
    throw new Error(`OCR failed after 3 tries: ${e.message}`);
  }
}

async function ocrSplitPage(imagePath, tempDir) {
  const image = sharp(imagePath);
  const metadata = await image.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!width || !height) throw new Error(`Could not read image dimensions: ${imagePath}`);
  const split = Math.floor(width / 2);
  const base = path.basename(imagePath, path.extname(imagePath));
  const left = path.join(tempDir, `${base}-left.jpg`);
  const right = path.join(tempDir, `${base}-right.jpg`);
  await sharp(imagePath).extract({ left: 0, top: 0, width: split + 24, height }).jpeg({ quality: 88 }).toFile(left);
  await sharp(imagePath).extract({ left: Math.max(0, split - 24), top: 0, width: width - split + 24, height }).jpeg({ quality: 88 }).toFile(right);
  const [leftText, rightText] = await Promise.all([ocrPage(left), ocrPage(right)]);
  fs.rmSync(left, { force: true });
  fs.rmSync(right, { force: true });
  return `${leftText}\n\n${rightText}`.trim();
}

function normalizeMath(text) {
  return text
    .replace(/\\\[([\s\S]*?)\\\]/g, (_m, math) => `$${math.trim()}$`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_m, math) => `$${math.trim()}$`)
    .replace(/\$\$([\s\S]*?)\$\$/g, (_m, math) => `$${math.trim()}$`)
    .trim();
}

const QUESTION_SYSTEM = `You convert the OCR text of a real Digital SAT exam into structured JSON.
The exam PDF renders roughly one question per page; a question often SPANS pages — the stem (with its short passage) on one page and its choices on the NEXT page, often as an HTML <table> of label/text cells. Two-column pages also occur.

Return ONLY JSON: {"questions":[...]} where each question is:
{"number": <int, the PRINTED question number>,
 "section": "reading_writing" | "math",
 "domain": <"Information and Ideas","Craft and Structure","Expression of Ideas","Standard English Conventions","Algebra","Advanced Math","Problem-Solving and Data Analysis","Geometry and Trigonometry">,
 "skill": <short skill or "">,
 "difficulty": "easy"|"medium"|"hard",
 "is_grid_in": <true only for student-produced response questions>,
 "question_text": <the stem the student reads; math in $...$; keep <table> HTML when a data table IS the figure>,
 "choices": [{"label":"A","text":...},...],
 "correct_answer": <"A"-"D" / grid-in value if an answer key page is visible, else "">}

CRITICAL numbering rule: the printed number appears in the OCR as a heading like "## 10 Mark for Review" or a bold number before the stem. Example:
OCR: "--- PAGE 5 --- ## 10 Mark for Review ![](page=0,...) Creating personas—brief profiles... ___ Which choice completes the text... --- PAGE 6 --- <table><tr><td>A</td><td>each</td></tr>...</table>"
JSON: {"questions":[{"number":10,"section":"reading_writing","domain":"Standard English Conventions","skill":"Subject-verb agreement","difficulty":"medium","is_grid_in":false,"question_text":"Creating personas—brief profiles of imaginary characters that represent key segments of a customer base—can help user experience (UX) designers think like and empathize with those using their products. Fictional yet realistic, $\\underline{\\text{___}}$","choices":[{"label":"A","text":"each"},{"label":"B","text":"these"},{"label":"C","text":"it"},{"label":"D","text":"them"}],"correct_answer":""}]}

More rules:
- Pair each stem with its choices even across pages inside this chunk. Numbering comes ONLY from the printed markers — never renumber, never start at 1.
- NEVER answer the question yourself: correct_answer is "" unless an answer-key section is visibly on these pages.
- A stem whose choices are not in this chunk is skipped (another chunk catches it). Never invent questions.
- Math stems keep $...$ LaTeX; grid-in questions have "choices": [].`;


const PASSAGE_SYSTEM = `You are given the OCR markdown of consecutive SAT exam pages.
Identify every READING PASSAGE (the long text that a group of questions refers to — prose, or the paired texts, or a long argument).
Return ONLY JSON: {"passages":[{"from": <first question number that uses it>, "to": <last question number>, "text": <full passage text>}]}
Rules:
- One entry per distinct passage, even if the questions using it span the chunk edge.
- Include the complete passage text when fully visible; if the passage continues beyond these pages, include the part visible here.
- Ignore tables/graphs (those belong to math questions) and instructions.`;

async function chatJson(system, user, maxTokens) {
  const res = await fetch(`${AI_BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${AI_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: AI_MODEL,
      temperature: 0.1,
      max_tokens: maxTokens,
      // glm-5.3 burns the whole budget on hidden reasoning unless capped the
      // same way the app's own AI layer caps it (see src/lib/ai/llm.ts).
      ...(AI_MODEL.toLowerCase().startsWith("glm-5.3")
        ? { thinking: { type: "enabled" }, reasoning_effort: "low" }
        : {}),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(240_000),
  });
  if (!res.ok) throw new Error(`chat ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  const content = (json.choices?.[0]?.message?.content ?? "{}").replace(/^```(?:json)?\s*|\s*\`\`\`$/g, "");
  try {
    return JSON.parse(content);
  } catch {
    // one retry — truncation or a stray fence
    await sleep(800);
    const res2 = await fetch(`${AI_BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${AI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: AI_MODEL, temperature: 0, max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: AbortSignal.timeout(240_000),
    });
    const json2 = await res2.json();
    return JSON.parse((json2.choices?.[0]?.message?.content ?? "{}").replace(/^```(?:json)?\s*|\s*\`\`\`$/g, ""));
  }
}

// --- per-test pipeline --------------------------------------------------------
async function extractTest(pdfPath) {
  const base = path.basename(pdfPath, ".pdf");
  const title = titleFromFilename(base);
  const formId = `real-${slugify(title)}`;
  const workDir = path.join(OUT_DIR, formId);
  fs.mkdirSync(workDir, { recursive: true });
  const pagesCache = path.join(OUT_DIR, `${formId}.pages.json`);
  const draftPath = path.join(OUT_DIR, `${formId}.draft.json`);
  const failPath = path.join(OUT_DIR, `FAILED-${formId}.txt`);

  console.log(`\n=== ${title} (${path.basename(pdfPath)})`);
  if (fs.existsSync(draftPath)) {
    console.log("draft already exists — skipping");
    return { formId, skipped: true };
  }

  // 1) render pages
  const pageFiles = fs
    .readdirSync(workDir)
    .filter((f) => f.startsWith("page-") && f.endsWith(".jpg"))
    .sort();
  if (pageFiles.length === 0) {
    console.log("rendering pages with pdftoppm…");
    execFileSync("pdftoppm", [
      "-jpeg", "-jpegopt", "quality=80", "-r", "110",
      pdfPath, path.join(workDir, "page"),
    ], { timeout: 10 * 60_000 });
  }
  const pages = fs
    .readdirSync(workDir)
    .filter((f) => f.startsWith("page-") && f.endsWith(".jpg"))
    .sort();
  console.log(`${pages.length} pages rendered`);

  // 2) OCR with per-page checkpoint
  const splitOcr = process.argv.includes("--split-ocr-only");
  const cachePath = splitOcr ? pagesCache.replace(/\.pages\.json$/, ".split-pages.json") : pagesCache;
  const cache = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, "utf8")) : {};
  for (let i = 0; i < pages.length; i++) {
    const key = pages[i];
    if (cache[key]) continue;
    process.stdout.write(`ocr ${i + 1}/${pages.length} \r`);
    cache[key] = splitOcr
      ? await ocrSplitPage(path.join(workDir, key), workDir)
      : await ocrPage(path.join(workDir, key));
    fs.writeFileSync(cachePath, JSON.stringify(cache));
    await sleep(300);
  }
  const pageTexts = pages.map((p) => cache[p]);
  console.log(`\nOCR done (${Object.keys(cache).length} pages cached)`);
  if (process.argv.includes("--ocr-only") || splitOcr) {
    return { formId, ocrOnly: true, pages: pageTexts.length };
  }

  // 3) structure: pass A questions (no passages), pass B passages; attach
  const byNumber = new Map();
  // Overlapping windows: a stem on page N pairs with choices on page N+1, so
  // every adjacent page pair must appear together in at least one window.
  const qWindow = 6;
  const qStep = 3;
  for (let start = 0; start < pageTexts.length; start += qStep) {
    const pageIdx = pageTexts.slice(start, start + qWindow);
    const firstPage = start + 1;
    const chunk = pageIdx
      .map((text, i) => `--- PAGE ${firstPage + i} ---\n${text}`)
      .join("\n\n");
    try {
      const parsed = await chatJson(QUESTION_SYSTEM, `EXAM PAGES:\n\n${chunk}`, 8000);
      for (const q of parsed.questions ?? []) {
        if (typeof q?.number !== "number" || !q?.question_text) continue;
        const candidate = {
          number: q.number,
          section: q.section === "math" ? "math" : "reading_writing",
          domain: String(q.domain ?? "").slice(0, 80),
          skill: String(q.skill ?? "").slice(0, 120),
          difficulty: q.difficulty === "easy" || q.difficulty === "hard" ? q.difficulty : "medium",
          is_grid_in: Boolean(q.is_grid_in),
          passage: "",
          question_text: String(q.question_text).slice(0, 6000),
          choices: Array.isArray(q.choices)
            ? q.choices.slice(0, 5).map((c, i) => ({
                label: ["A", "B", "C", "D", "E"][i] ?? c.label ?? String(i + 1),
                text: String(c?.text ?? "").slice(0, 2000),
              }))
            : [],
          correct_answer: String(q.correct_answer ?? "").slice(0, 40),
        };
        // Overlapping windows see the same question more than once; keep the
        // most complete sighting (choices present, answer filled).
        const existing = byNumber.get(candidate.number);
        const score = (x) => (x.choices.length > 0 ? 2 : 0) + (x.correct_answer ? 1 : 0);
        if (!existing || score(candidate) > score(existing)) byNumber.set(candidate.number, candidate);
      }
      console.log(`questions from pages ${firstPage}-${firstPage + pageIdx.length - 1} (total ${byNumber.size})`);
    } catch (e) {
      console.log(`chunk ${start + 1} question pass failed: ${e.message} — continuing`);
    }
    await sleep(300);
  }

  const passages = [];
  const pWindow = 8;
  const pStep = 4;
  for (let start = 0; start < pageTexts.length; start += pStep) {
    const pageIdx = pageTexts.slice(start, start + pWindow);
    const firstPage = start + 1;
    const chunk = pageIdx
      .map((text, i) => `--- PAGE ${firstPage + i} ---\n${text}`)
      .join("\n\n");
    try {
      const parsed = await chatJson(PASSAGE_SYSTEM, chunk, 6000);
      for (const p of parsed.passages ?? []) {
        if (!p?.text || typeof p.from !== "number") continue;
        passages.push({ from: p.from, to: Number(p.to) || p.from, text: String(p.text).slice(0, 12000) });
      }
      console.log(`passages from pages ${firstPage}-${firstPage + pageIdx.length - 1} (total ${passages.length})`);
    } catch (e) {
      console.log(`chunk ${start + 1} passage pass failed: ${e.message} — continuing`);
    }
    await sleep(300);
  }

  let questions = [...byNumber.values()].sort((a, b) => a.number - b.number);
  for (const q of questions) {
    const candidates = passages.filter((p) => q.number >= p.from && q.number <= p.to && p.text.length > 120);
    if (candidates.length > 0) {
      q.passage = candidates.sort((a, b) => b.text.length - a.text.length)[0].text;
    }
  }

  // 4) answer-key resolution for anything still unanswered
  const unanswered = questions.filter((q) => !q.correct_answer);
  if (unanswered.length > 0) {
    const keyPages = pageTexts
      .map((text, i) => ({ text, page: i + 1 }))
      .filter(({ text }) => /answer\s*key|correct answer|answers?\b\s*[:\d]/i.test(text))
      .slice(-4);
    if (keyPages.length > 0) {
      console.log(`resolving ${unanswered.length} answers from key pages [${keyPages.map((k) => k.page).join(",")}]`);
      try {
        const listing = unanswered.map((q) => `Q${q.number} (${q.section})`).join(", ");
        const res = await fetch(`${AI_BASE}/chat/completions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${AI_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: AI_MODEL,
            temperature: 0,
            max_tokens: 4000,
            response_format: { type: "json_object" },
            messages: [
              {
                role: "system",
                content:
                  'You are given an SAT answer key text and a list of question numbers. Return ONLY {"answers":{"<number>":"<letter or value>"}} for every listed question, using the key. If a number is not in the key, omit it.',
              },
              {
                role: "user",
                content: `QUESTIONS NEEDING ANSWERS: ${listing}\n\nANSWER KEY TEXT:\n${keyPages.map((k) => `--- PAGE ${k.page} ---\n${k.text}`).join("\n")}`,
              },
            ],
          }),
          signal: AbortSignal.timeout(240_000),
        });
        const json = await res.json();
        const parsed = JSON.parse((json.choices?.[0]?.message?.content ?? "{}").replace(/^```(?:json)?\s*|\s*```$/g, ""));
        for (const q of unanswered) {
          const answer = parsed.answers?.[String(q.number)];
          if (answer) q.correct_answer = String(answer).slice(0, 40);
        }
      } catch (e) {
        console.log(`answer-key pass failed: ${e.message}`);
      }
    }
  }

  // 5) draft
  const stillUnanswered = questions.filter((q) => !q.correct_answer).length;
  const draft = {
    title,
    formId,
    sourceFile: path.basename(pdfPath),
    pageCount: pages.length,
    questionCount: questions.length,
    unanswered: stillUnanswered,
    extractedAt: new Date().toISOString(),
    questions,
  };
  fs.writeFileSync(draftPath, JSON.stringify(draft, null, 1));
  console.log(`DRAFT: ${questions.length} questions, ${stillUnanswered} unanswered -> ${path.basename(draftPath)}`);
  return { formId, skipped: false };
}

// --- main ----------------------------------------------------------------------
const externalPdfIndex = process.argv.indexOf("--pdf");
const externalPdf = externalPdfIndex >= 0 ? path.resolve(process.argv[externalPdfIndex + 1] ?? "") : null;
const pdfs = fs
  .readdirSync(PDF_DIR)
  .filter((f) => f.toLowerCase().endsWith(".pdf"))
  .sort((a, b) => sortKey(a) - sortKey(b));
const positional = process.argv.slice(2).find((arg, index, args) => !arg.startsWith("--") && args[index - 1] !== "--pdf");
const only = positional; // optional: run a single test by partial name
const targets = externalPdf
  ? [externalPdf]
  : (only ? pdfs.filter((f) => f.toLowerCase().includes(only.toLowerCase())) : pdfs).map((f) => path.join(PDF_DIR, f));
console.log(`Batch: ${targets.length} of ${pdfs.length} PDFs (model ${AI_MODEL})`);

const results = [];
const CONCURRENCY = 3;
let cursor = 0;
async function worker(workerId) {
  while (cursor < targets.length) {
    const pdf = targets[cursor++];
    try {
      results.push(await extractTest(pdf));
    } catch (e) {
      const formId = `real-${slugify(titleFromFilename(path.basename(pdf, ".pdf")))}`;
      fs.writeFileSync(path.join(OUT_DIR, `FAILED-${formId}.txt`), String(e.stack ?? e));
      console.log(`FAILED ${pdf}: ${e.message}`);
      results.push({ formId, failed: true, error: e.message });
    }
  }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, (_, i) => worker(i)));

console.log("\n=== BATCH COMPLETE ===");
for (const r of results) console.log(JSON.stringify(r));
