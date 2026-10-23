"use client";

// Test Builder — turns a scanned real-exam PDF into a digital practice form.
// The PDF never leaves the browser as a file: pages are rendered locally with
// pdf.js and sent to the server one at a time for GLM-OCR, then the collected
// OCR text is structured into questions by the chat model and published as a
// practice_forms row.

import { useRef, useState } from "react";
import { FileUp, Loader2, Play, Rocket, X } from "lucide-react";
import {
  extractTestPage,
  publishPracticeTestDraft,
  structureTestQuestions,
} from "@/app/admin/actions";

type Phase = "idle" | "building" | "ready" | "published" | "error";

type PdfjsLike = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (src: { data: ArrayBuffer }) => { promise: Promise<PdfjsDocLike> };
};
type PdfjsDocLike = {
  numPages: number;
  getPage: (n: number) => Promise<PdfjsPageLike>;
};
type PdfjsPageLike = {
  getViewport: (opts: { scale: number }) => { width: number; height: number };
  render: (opts: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> };
};

type PreviewQuestion = {
  number: number;
  section: string;
  domain: string;
  difficulty: string;
  correct_answer: string;
};

const RENDER_WIDTH = 1000;
const JPEG_QUALITY = 0.68;

export default function TestBuilder() {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [sequence, setSequence] = useState("1");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState({ label: "", page: 0, total: 0 });
  const [log, setLog] = useState<string[]>([]);
  const [preview, setPreview] = useState<PreviewQuestion[] | null>(null);
  const [summary, setSummary] = useState<{ draftId: string; count: number; unanswered: number } | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef(false);

  function note(line: string) {
    setLog((lines) => [line, ...lines].slice(0, 40));
  }

  async function build() {
    if (!file || !title.trim()) {
      setError("Choose a PDF and give the test a title first.");
      setPhase("error");
      return;
    }
    setError(null);
    setResult(null);
    setPreview(null);
    setSummary(null);
    setLog([]);
    cancelRef.current = false;
    setPhase("building");

    try {
      note("Loading pdf.js…");
      const pdfjs = (await import("pdfjs-dist/build/pdf.mjs")) as unknown as PdfjsLike;
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
      const bytes = await file.arrayBuffer();
      const doc = await pdfjs.getDocument({ data: bytes }).promise;
      setProgress({ label: "Rendering + OCR", page: 0, total: doc.numPages });
      note(`${doc.numPages} pages. Rendering each page and reading it with GLM-OCR — about 2–6 s per page.`);

      const texts: string[] = [];
      for (let p = 1; p <= doc.numPages; p++) {
        if (cancelRef.current) {
          setPhase("error");
          setError(`Cancelled after page ${p - 1}. Nothing was published.`);
          return;
        }
        setProgress({ label: "Rendering + OCR", page: p, total: doc.numPages });
        const page = await doc.getPage(p);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: RENDER_WIDTH / base.width });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport }).promise;
        const dataUri = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
        const res = await extractTestPage(dataUri);
        if (!res.ok || !res.text) throw new Error(`Page ${p}: ${res.message ?? "OCR failed"}`);
        texts.push(res.text);
        if (p % 5 === 0) note(`Read ${p}/${doc.numPages} pages.`);
      }

      setProgress({ label: "Structuring questions with AI", page: 0, total: 0 });
      note("Structuring questions (sections, domains, choices, answer key)…");
      const structured = await structureTestQuestions({ title: title.trim(), filename: file.name, pageTexts: texts });
      if (!structured.ok || !structured.data) {
        throw new Error(structured.message);
      }
      setSummary({
        draftId: String(structured.data.draftId),
        count: Number(structured.data.count),
        unanswered: Number(structured.data.unanswered),
      });
      setPreview(structured.data.preview as PreviewQuestion[]);
      setPhase("ready");
    } catch (e) {
      setPhase("error");
      setError(e instanceof Error ? e.message : "The build failed — check the log and retry.");
    }
  }

  async function publish() {
    if (!summary) return;
    setError(null);
    setPhase("building");
    setProgress({ label: "Publishing", page: 0, total: 0 });
    try {
      const res = await publishPracticeTestDraft({
        draftId: summary.draftId,
        title: title.trim(),
        sequence: Number(sequence) || 1,
      });
      if (!res.ok) throw new Error(res.message);
      setResult(res.message);
      setPhase("published");
    } catch (e) {
      setPhase("error");
      setError(e instanceof Error ? e.message : "Publishing failed.");
    }
  }

  const building = phase === "building";

  return (
    <section id="builder" className="admin-workspace builder">
      <header className="admin-section-heading">
        <div>
          <p className="eyebrow">Content studio</p>
          <h2>Test Builder — PDF → AI → digital practice test</h2>
          <p>
            Upload a full exam PDF. Pages are rendered in your browser, read by GLM-OCR, structured into
            questions by the AI, and published as an adaptive practice form. Budget ~3–6 minutes per exam.
          </p>
        </div>
      </header>

      <div className="builder-grid">
        <div className="admin-editor">
          <label className="builder-field">
            <span>Exam PDF (scans are fine)</span>
            <span className="builder-file">
              <FileUp size={15} />
              <input
                type="file"
                accept="application/pdf"
                disabled={building}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  if (f && !title.trim()) setTitle(f.name.replace(/\.pdf$/i, "").replace(/\s*Full$/i, ""));
                }}
              />
            </span>
            {file && <small>{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</small>}
          </label>
          <label className="builder-field">
            <span>Test title</span>
            <input
              value={title}
              maxLength={110}
              placeholder="SAT March 2026 V1"
              disabled={building}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="builder-field builder-field-narrow">
            <span>Library order</span>
            <input
              type="number"
              min={1}
              max={100}
              value={sequence}
              disabled={building}
              onChange={(e) => setSequence(e.target.value)}
            />
          </label>

          {building ? (
            <button className="admin-primary builder-cancel" onClick={() => { cancelRef.current = true; }}>
              <X size={15} /> Cancel after this page
            </button>
          ) : (
            <button className="admin-primary" onClick={() => void build()} disabled={!file}>
              <Play size={15} /> Build test
            </button>
          )}
          {building && progress.total > 0 && (
            <p className="builder-progress">
              <Loader2 size={14} className="builder-spin" /> {progress.label}: {progress.page}/{progress.total}
            </p>
          )}
          {building && progress.total === 0 && (
            <p className="builder-progress"><Loader2 size={14} className="builder-spin" /> {progress.label}…</p>
          )}
        </div>

        <div className="admin-editor builder-log">
          <span className="builder-log-title">Progress log</span>
          {log.length === 0 ? (
            <p className="builder-muted">
              Idle. The generated forms were removed — the tests you publish here are what students see in the library.
            </p>
          ) : (
            log.map((line, i) => <p key={`${i}-${line.slice(0, 12)}`}>{line}</p>)
          )}
        </div>
      </div>

      {error && <p className="builder-error" role="alert">{error}</p>}

      {phase === "ready" && summary && (
        <div className="admin-editor builder-review">
          <p>
            <strong>{summary.count}</strong> questions structured · <strong>{summary.unanswered}</strong> missing an
            answer{summary.unanswered > 0 ? " — those are skipped; make sure the answer-key pages were in the PDF" : ""}.
          </p>
          {preview && (
            <div className="builder-preview-list">
              {preview.map((q) => (
                <span key={q.number} className="builder-preview">
                  Q{q.number} · {q.section === "math" ? "Math" : "R&W"} · {q.difficulty} · key {q.correct_answer || "—"}
                </span>
              ))}
            </div>
          )}
          <button className="admin-primary" onClick={() => void publish()} disabled={building}>
            <Rocket size={15} /> Publish “{title.trim()}” to the practice-test library
          </button>
        </div>
      )}

      {phase === "published" && result && <p className="builder-success" role="status">{result}</p>}
    </section>
  );
}
