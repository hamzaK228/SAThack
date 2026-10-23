import { readFileSync } from "fs";
import path from "path";
import { EXPERT_CHUNKS } from "./sat-expertise";

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

/** Load the SAT knowledge corpus (books + the curated tutor handbook). */
export function loadCorpus(): KnowledgeChunk[] {
  if (cache) return cache;
  const chunks: KnowledgeChunk[] = [...EXPERT_CHUNKS];
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

const STOP = new Set(["the", "and", "for", "that", "with", "this", "are", "was", "has", "have", "from", "your", "will", "what", "which", "when", "where", "about", "each", "they", "them", "their", "how", "does", "did", "can", "you", "should", "into", "onto", "than", "then", "there", "these", "those", "been", "being", "its", "it's", "over", "under", "also", "just", "very", "much", "more", "most", "some", "any", "all", "not", "but", "out", "one", "two", "get", "got", "put", "use", "used", "using",
  // Corpus-wide furniture: present on nearly every page of an SAT book, so
  // they carry almost no signal — but their IDF is high enough to let answer
  // grids and page headers out-rank real teaching text.
  "question", "answer", "choice", "chapter", "page", "sat", "exam", "practice", "test"]);

/**
 * Tokenize with a conservative plural stem ("equations" → "equation").
 * Verb endings are deliberately left alone — stripping "ing"/"ed" merges
 * words like "base"/"based" into different stems and loses more matches
 * than the plurals gain.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map(stem);
}

function stem(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us") && !word.endsWith("is")) {
    return word.slice(0, -1);
  }
  return word;
}

/**
 * BM25 index over the corpus, built once per serverless instance.
 *
 * Replaced the previous per-request scan: the old search tokenized every
 * chunk for every query and scored by raw token overlap, so frequent words
 * ("solve", "question", "answer") dominated and chunk length went uncounted.
 * A proper inverted index with IDF weighting and length normalization ranks
 * rare, topical terms first — and a query is now O(matching docs), not
 * O(whole corpus).
 */
type Index = {
  chunks: KnowledgeChunk[];
  /** term → [docIdx, termFreq, docIdx, termFreq, …] */
  postings: Map<string, number[]>;
  docLen: number[];
  /** per-chunk authority multiplier (curated handbook > OCR'd book pages) */
  docWeight: number[];
  avgLen: number;
};

let indexCache: Index | null = null;

const K1 = 1.4;
const B = 0.75;
const HANDBOOK_WEIGHT = 1.15;

/**
 * OCR pages of tables and answer grids turn into keyword-dense junk ("READING
 * AND READING AND READING…") that out-scores real teaching text on every
 * related query, and a sixth of the corpus is under 40 words (headers,
 * fragments, page numbers) that exists only to win length normalization.
 * Repetition (low unique-token ratio) catches the grids; the word floor
 * catches the fragments.
 */
const MIN_INDEX_WORDS = 40;

function isJunk(text: string): boolean {
  const words = text.toLowerCase().match(/[a-z']{3,}/g) ?? [];
  if (words.length < MIN_INDEX_WORDS) return true;
  return new Set(words).size / words.length < 0.35;
}

function buildIndex(): Index {
  const chunks = loadCorpus().filter((c) => !isJunk(c.text));
  const postings = new Map<string, number[]>();
  const docLen: number[] = new Array(chunks.length);
  const docWeight: number[] = new Array(chunks.length);
  let totalLen = 0;

  chunks.forEach((c, docIdx) => {
    const tf = new Map<string, number>();
    for (const w of tokenize(c.text)) tf.set(w, (tf.get(w) ?? 0) + 1);
    docLen[docIdx] = tf.size;
    docWeight[docIdx] = c.book === "SAThack Tutor Handbook" ? HANDBOOK_WEIGHT : 1;
    totalLen += tf.size;
    for (const [term, count] of tf) {
      let list = postings.get(term);
      if (!list) postings.set(term, (list = []));
      list.push(docIdx, count);
    }
  });

  return { chunks, postings, docLen, docWeight, avgLen: chunks.length ? totalLen / chunks.length : 1 };
}

/**
 * Query-time de-inflection: a student asks "how is it scored", the books say
 * "score". Expansion only ever produces terms that exist in the index, so it
 * can't merge unrelated words the way index-time stemming can.
 */
function expandQuery(tokens: string[], postings: Map<string, number[]>): Map<string, number> {
  const qtf = new Map<string, number>();
  const add = (term: string, weight: number) => {
    if (postings.has(term)) qtf.set(term, Math.max(qtf.get(term) ?? 0, weight));
  };
  for (const t of tokens) {
    add(t, 1);
    if (t.endsWith("ing") && t.length > 5) {
      add(t.slice(0, -3), 0.7);
      add(t.slice(0, -3) + "e", 0.7);
    }
    if (t.endsWith("ed") && t.length > 4) {
      add(t.slice(0, -2), 0.7);
      add(t.slice(0, -1), 0.7);
    }
    if (t.endsWith("s") && t.length > 3) add(t.slice(0, -1), 0.8);
  }
  return qtf;
}

function getIndex(): Index {
  if (!indexCache) indexCache = buildIndex();
  return indexCache;
}

function idf(df: number, n: number): number {
  return Math.log(1 + (n - df + 0.5) / (df + 0.5));
}

/** Lexical search over the corpus (BM25 + an exact-phrase bonus). */
export function searchKnowledge(query: string, topK = 6): KnowledgeChunk[] {
  const index = getIndex();
  const tokens = tokenize(query);
  if (tokens.length === 0 || index.chunks.length === 0) return [];

  const qtf = expandQuery(tokens, index.postings);
  if (qtf.size === 0) return [];

  const n = index.chunks.length;
  const scores = new Map<number, number>();
  for (const [term, qWeight] of qtf) {
    const list = index.postings.get(term);
    if (!list) continue;
    const weight = idf(list.length / 2, n) * qWeight;
    for (let i = 0; i < list.length; i += 2) {
      const docIdx = list[i];
      const tf = list[i + 1];
      const norm = tf * (K1 + 1) / (tf + K1 * (1 - B + B * (index.docLen[docIdx] / index.avgLen)));
      const scored = weight * norm * index.docWeight[docIdx];
      scores.set(docIdx, (scores.get(docIdx) ?? 0) + scored);
    }
  }

  // Exact-phrase bonus: a chunk containing the query verbatim is very likely
  // the one a student is asking about ("margin of error", "soh-cah-toa").
  const phrase = query.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  if (phrase.length > 6) {
    for (const [docIdx, score] of scores) {
      if (index.chunks[docIdx].text.toLowerCase().includes(phrase)) {
        scores.set(docIdx, score + 2);
      }
    }
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([docIdx]) => index.chunks[docIdx]);
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

/**
 * Retrieve knowledge relevant to a set of domains/skills. Each domain expands
 * to several keyword queries so one weak hit can't starve the topic; chunks
 * are merged by how many queries surfaced them (with rank strength), so a
 * chunk that matches the topic from several angles floats to the top.
 */
export function knowledgeForTopic(domains: string[], skills: string[] = [], topK = 5): KnowledgeChunk[] {
  const queries: string[] = [];
  for (const d of domains) queries.push(...(DOMAIN_KEYWORDS[d] ?? [d]));
  for (const s of skills) queries.push(s);
  if (queries.length === 0) return [];

  const results = new Map<string, { chunk: KnowledgeChunk; score: number }>();
  for (const q of queries.slice(0, 40)) {
    searchKnowledge(q, topK * 2).forEach((c, rank) => {
      const key = `${c.book}#${c.page}#${c.chunk}`;
      const contribution = 1 / (rank + 1);
      const prev = results.get(key);
      if (prev) prev.score += contribution;
      else results.set(key, { chunk: c, score: contribution });
    });
  }
  return [...results.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((x) => x.chunk);
}

/**
 * Blend topic-driven retrieval (domains/skills) with raw-text retrieval (the
 * student's actual question). The two signals cover each other's blind spots:
 * the question text finds what the student is literally asking about, the
 * domain keywords find what the topic is really about. Used by the tutor chat.
 */
export function blendKnowledge(query: string, domains: string[], skills: string[], topK = 6): KnowledgeChunk[] {
  const merged = new Map<string, { chunk: KnowledgeChunk; score: number }>();
  const add = (chunks: KnowledgeChunk[], weight: number) => {
    chunks.forEach((c, rank) => {
      const key = `${c.book}#${c.page}#${c.chunk}`;
      const contribution = weight / (rank + 1);
      const prev = merged.get(key);
      if (prev) prev.score += contribution;
      else merged.set(key, { chunk: c, score: contribution });
    });
  };
  const text = query.trim();
  if (text) add(searchKnowledge(text, topK * 2), 1);
  if (domains.length || skills.length) add(knowledgeForTopic(domains, skills, topK), 1.2);
  return [...merged.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((x) => x.chunk);
}

/** Render chunks for a prompt: attributed, attributed, and ready to paste. */
export function formatKnowledge(chunks: KnowledgeChunk[]): string {
  return chunks.map((c) => `[${c.book} p.${c.page}] ${c.text}`).join("\n\n");
}
