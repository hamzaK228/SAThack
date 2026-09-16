import { readFileSync } from "fs";
import path from "path";

export type KnowledgeChunk = { book: string; page: number; chunk: number; text: string };

let cache: KnowledgeChunk[] | null = null;

/**
 * The corpus files sit at the project root (see outputFileTracingIncludes in
 * next.config.ts). Every read keeps its path as an inline literal — a computed
 * path in the argument of readFileSync makes Turbopack trace the *entire
 * project* into the serverless bundle ("Dynamic filesystem access causes
 * tracing of the whole project"). Add a new corpus by adding a thunk here.
 */
const CORPUS_FILES = [
  () => readFileSync(path.join(process.cwd(), "sat-corpus.json"), "utf-8"),
  () => readFileSync(path.join(process.cwd(), "sat-corpus-official.json"), "utf-8"),
];

/** Load the SAT book corpus (built by scripts/extract_books.py + ocr_official.py). */
export function loadCorpus(): KnowledgeChunk[] {
  if (cache) return cache;
  const chunks: KnowledgeChunk[] = [];
  for (const read of CORPUS_FILES) {
    try {
      chunks.push(...(JSON.parse(read()) as KnowledgeChunk[]));
    } catch {
      // file missing — ignore
    }
  }
  cache = chunks;
  return cache;
}

const STOP = new Set(["the", "and", "for", "that", "with", "this", "are", "was", "has", "have", "from", "your", "will", "what", "which", "when", "where", "about", "each", "they", "them", "their"]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

/** Lexical search over the corpus (TF-ish overlap scoring). */
export function searchKnowledge(query: string, topK = 6): KnowledgeChunk[] {
  const corpus = loadCorpus();
  const qTokens = new Set(tokenize(query));
  if (qTokens.size === 0 || corpus.length === 0) return [];

  return corpus
    .map((c) => {
      let score = 0;
      for (const w of tokenize(c.text)) if (qTokens.has(w)) score += 1;
      return { c, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((x) => x.c);
}

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  "Algebra": ["linear equation", "linear function", "system of equations", "linear inequality", "slope", "intercept", "variable"],
  "Advanced Math": ["quadratic", "polynomial", "exponential", "radical", "absolute value", "nonlinear", "equivalent expression", "rational"],
  "Problem-Solving and Data Analysis": ["ratio", "percentage", "percent", "probability", "statistic", "scatterplot", "margin of error", "data", "unit"],
  "Geometry and Trigonometry": ["area", "volume", "triangle", "circle", "angle", "trigonometry", "sine", "cosine", "pythagorean"],
  "Information and Ideas": ["central idea", "main idea", "inference", "evidence", "support", "detail", "graph", "table"],
  "Craft and Structure": ["words in context", "vocabulary", "text structure", "purpose", "cross text", "tone"],
  "Expression of Ideas": ["transition", "rhetorical synthesis", "note", "combine sentence", "logical"],
  "Standard English Conventions": ["grammar", "punctuation", "subject verb", "verb tense", "pronoun", "modifier", "sentence boundary"],
};

/** Retrieve book knowledge relevant to a set of domains/skills. */
export function knowledgeForTopic(domains: string[], skills: string[] = [], topK = 5): KnowledgeChunk[] {
  const queries: string[] = [];
  for (const d of domains) queries.push(...(DOMAIN_KEYWORDS[d] ?? [d]));
  for (const s of skills) queries.push(s);
  if (queries.length === 0) return [];

  const results = new Map<string, { c: KnowledgeChunk; score: number }>();
  for (const q of queries.slice(0, 40)) {
    for (const c of searchKnowledge(q, topK)) {
      const key = `${c.book}#${c.page}#${c.chunk}`;
      const prev = results.get(key);
      const s = prev ? prev.score + 1 : 1;
      results.set(key, { c, score: s });
    }
  }
  return [...results.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((x) => x.c);
}
