"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import MathText from "@/components/MathText";
import ReferenceSheet from "./ReferenceSheet";
import DesmosCalculator from "./DesmosCalculator";
import { startTestSession, saveTestProgress, completeTestSession } from "@/app/dashboard/actions";

type Choice = { label: string; text: string };
export type TestQuestion = {
  id: string;
  section: string;
  domain: string;
  skill: string | null;
  difficulty: string;
  is_grid_in: boolean;
  question_text: string;
  passage: string | null;
  choices: Choice[] | null;
  correct_answer: string;
  explanation: string | null;
};
export type TestModule = {
  id: string;
  section: "math" | "reading_writing";
  label: string;
  minutes: number;
  questions: TestQuestion[];
};
export type M2Variants = {
  rw: { easy: TestModule; hard: TestModule };
  math: { easy: TestModule; hard: TestModule };
};
type M1Result = { correct: number; total: number } | null;
export type TestProgress = {
  moduleIdx: number;
  qIdx: number;
  answers: Record<string, string>;
  marked: string[];
  m1: { rw: M1Result; math: M1Result };
};

const MODULE_MINUTES = [32, 32, 35, 35];

function toNumber(s: string): number | null {
  const t = s.trim();
  const n = Number(t);
  if (!Number.isNaN(n)) return n;
  const m = t.match(/^(-?\d+)\s*\/\s*(\d+)$/);
  if (m) return Number(m[1]) / Number(m[2]);
  return null;
}
function isCorrect(selected: string, answer: string): boolean {
  const a = selected.trim().toLowerCase();
  const b = answer.trim().toLowerCase();
  if (a === b) return true;
  const na = toNumber(selected);
  const nb = toNumber(answer);
  if (na !== null && nb !== null) return Math.abs(na - nb) < 1e-6;
  return false;
}
function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
function computeResult(mod: TestModule, answers: Record<string, string>): M1Result {
  const total = mod.questions.length;
  let correct = 0;
  for (const q of mod.questions) {
    const sel = answers[q.id];
    if (sel && isCorrect(sel, q.correct_answer)) correct++;
  }
  return { correct, total };
}

export default function TestExam({
  m1,
  m2,
  sessionId: initialSessionId,
  initialProgress,
}: {
  m1: TestModule[];
  m2: M2Variants;
  sessionId: string | null;
  initialProgress: TestProgress | null;
}) {
  const [phase, setPhase] = useState<"intro" | "exam" | "results">("intro");
  const [moduleIdx, setModuleIdx] = useState(initialProgress?.moduleIdx ?? 0);
  const [qIdx, setQIdx] = useState(initialProgress?.qIdx ?? 0);
  const [answers, setAnswers] = useState<Record<string, string>>(initialProgress?.answers ?? {});
  const [marked, setMarked] = useState<Record<string, boolean>>(
    () => Object.fromEntries((initialProgress?.marked ?? []).map((id) => [id, true]))
  );
  const [m1Results, setM1Results] = useState<{ rw: M1Result; math: M1Result }>(
    initialProgress?.m1 ?? { rw: null, math: null }
  );
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [viewMode, setViewMode] = useState<"question" | "review">("question");
  const [navOpen, setNavOpen] = useState(false);
  const [directionsOpen, setDirectionsOpen] = useState(false);
  const [timerHidden, setTimerHidden] = useState(false);
  const [showRef, setShowRef] = useState(false);
  const [showCalc, setShowCalc] = useState(false);
  const [highlightOn, setHighlightOn] = useState(false);
  const [results, setResults] = useState<{
    rwCorrect: number;
    mathCorrect: number;
    rwScore: number;
    mathScore: number;
    total: number;
  } | null>(null);
  const savedRef = useRef(false);
  const passageRef = useRef<HTMLDivElement>(null);

  const resumable = !!initialSessionId && (moduleIdx > 0 || Object.keys(answers).length > 0);

  const modules = useMemo<(TestModule | null)[]>(() => {
    const m: (TestModule | null)[] = [m1[0], null, m1[1], null];
    if (m1Results.rw) {
      m[1] = m1Results.rw.correct >= Math.ceil(m1Results.rw.total * 0.6) ? m2.rw.hard : m2.rw.easy;
    }
    if (m1Results.math) {
      m[3] =
        m1Results.math.correct >= Math.ceil(m1Results.math.total * 0.6) ? m2.math.hard : m2.math.easy;
    }
    return m;
  }, [m1, m2, m1Results]);

  const mod = modules[moduleIdx];
  const q = mod?.questions[qIdx];
  const currentModuleId = modules[moduleIdx]?.id ?? "done";

  const totalQuestions =
    m1[0].questions.length + m1[1].questions.length + m2.rw.easy.questions.length + m2.math.easy.questions.length;
  const totalMinutes = 134;

  useEffect(() => {
    if (phase !== "exam" || !sessionId) return;
    const t = window.setTimeout(() => {
      saveTestProgress({
        sessionId,
        currentModule: currentModuleId,
        progress: {
          moduleIdx,
          qIdx,
          answers,
          marked: Object.keys(marked).filter((k) => marked[k]),
          m1: m1Results,
        },
      });
    }, 700);
    return () => window.clearTimeout(t);
  }, [sessionId, phase, moduleIdx, qIdx, answers, marked, m1Results, currentModuleId]);

  async function begin(fresh: boolean) {
    let id = sessionId;
    if (fresh || !id) {
      id = await startTestSession();
      setSessionId(id);
    }
    setPhase("exam");
    setViewMode("question");
    setSecondsLeft(MODULE_MINUTES[moduleIdx] * 60 || 32 * 60);
  }

  useEffect(() => {
    if (phase !== "exam" || viewMode !== "question") return;
    const t = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          window.clearInterval(t);
          setViewMode("review");
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, [phase, viewMode]);

  function answer(val: string) {
    if (!q) return;
    setAnswers((a) => ({ ...a, [q.id]: val }));
  }
  function toggleMark() {
    if (!q) return;
    setMarked((m) => ({ ...m, [q.id]: !m[q.id] }));
  }
  function goto(gi: number) {
    if (!mod) return;
    setQIdx(Math.max(0, Math.min(mod.questions.length - 1, gi)));
    setNavOpen(false);
  }
  function next() {
    if (!mod) return;
    if (qIdx < mod.questions.length - 1) setQIdx(qIdx + 1);
    else setViewMode("review");
  }
  function back() {
    if (qIdx > 0) setQIdx(qIdx - 1);
  }
  function nextModule() {
    const cur = modules[moduleIdx];
    if (cur) {
      if (moduleIdx === 0) setM1Results((p) => ({ ...p, rw: computeResult(cur, answers) }));
      else if (moduleIdx === 2) setM1Results((p) => ({ ...p, math: computeResult(cur, answers) }));
    }
    if (moduleIdx < 3) {
      const ni = moduleIdx + 1;
      setModuleIdx(ni);
      setQIdx(0);
      setViewMode("question");
      setSecondsLeft(MODULE_MINUTES[ni] * 60);
    } else {
      finish();
    }
  }

  function finish() {
    const resolved = modules.filter((m): m is TestModule => m !== null);
    let rwCorrect = 0;
    let mathCorrect = 0;
    const attempts: Parameters<typeof completeTestSession>[0]["attempts"] = [];
    for (const md of resolved) {
      for (const qq of md.questions) {
        const sel = answers[qq.id] ?? null;
        const ok = sel !== null && isCorrect(sel, qq.correct_answer);
        if (md.section === "math") {
          if (ok) mathCorrect++;
        } else if (ok) rwCorrect++;
        attempts.push({
          question_id: qq.id,
          selected_answer: sel,
          correct_answer: qq.correct_answer,
          is_correct: ok,
          section: md.section,
          domain: qq.domain,
        });
      }
    }
    const rwTotal = resolved.filter((m) => m.section === "reading_writing").reduce((s, m) => s + m.questions.length, 0);
    const mathTotal = resolved.filter((m) => m.section === "math").reduce((s, m) => s + m.questions.length, 0);
    const rwScore = 200 + Math.round((rwCorrect / Math.max(1, rwTotal)) * 600);
    const mathScore = 200 + Math.round((mathCorrect / Math.max(1, mathTotal)) * 600);
    const res = { rwCorrect, mathCorrect, rwScore, mathScore, total: rwScore + mathScore };
    setResults(res);
    setPhase("results");
    if (!savedRef.current) {
      savedRef.current = true;
      completeTestSession({
        sessionId,
        rw_correct: rwCorrect,
        math_correct: mathCorrect,
        rw_score: rwScore,
        math_score: mathScore,
        total_score: res.total,
        attempts,
      });
    }
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  }

  function onPassageMouseUp() {
    if (!highlightOn || !passageRef.current) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    if (!passageRef.current.contains(range.commonAncestorContainer)) return;
    try {
      const mark = document.createElement("mark");
      mark.className = "exam-highlight";
      range.surroundContents(mark);
      sel.removeAllRanges();
    } catch {
      // selection spans mixed nodes (e.g. math) — ignore
    }
  }

  function onPassageClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.classList?.contains("exam-highlight")) {
      const parent = target.parentNode;
      if (parent) {
        while (target.firstChild) parent.insertBefore(target.firstChild, target);
        parent.removeChild(target);
      }
    }
  }

  if (phase === "intro") {
    const introModules = [m1[0], m2.rw.easy, m1[1], m2.math.easy];
    return (
      <div className="exam-intro">
        <p className="eyebrow">Practice test</p>
        <h1 className="exam-intro-title">Full-length Digital SAT</h1>
        <p className="dash-sub">Adaptive, timed, and scored like the real thing.</p>
        <div className="exam-modules">
          {introModules.map((m) => (
            <div className="exam-module" key={m.id}>
              <span className="exam-module-label">{m.label}</span>
              <span className="exam-module-meta">
                {m.questions.length} questions · {m.minutes} min
              </span>
            </div>
          ))}
        </div>
        <p className="exam-total">
          {totalQuestions} questions · {totalMinutes} minutes
        </p>
        {resumable ? (
          <div className="exam-results-actions">
            <button className="btn btn-primary btn-lg" onClick={() => begin(false)}>
              Continue test
            </button>
            <button className="btn btn-ghost" onClick={() => begin(true)}>
              Start new test
            </button>
          </div>
        ) : (
          <button className="btn btn-primary btn-lg" onClick={() => begin(true)}>
            Start test
          </button>
        )}
      </div>
    );
  }

  if (phase === "results" && results) {
    return (
      <div className="exam-results">
        <p className="eyebrow">Test complete</p>
        <h1 className="exam-intro-title">Your results</h1>
        <div className="exam-score-grid">
          <div className="exam-score">
            <span className="exam-score-label">Reading &amp; Writing</span>
            <strong className="exam-score-value">{results.rwScore}</strong>
            <span className="exam-score-sub">{results.rwCorrect} correct</span>
          </div>
          <div className="exam-score">
            <span className="exam-score-label">Math</span>
            <strong className="exam-score-value">{results.mathScore}</strong>
            <span className="exam-score-sub">{results.mathCorrect} correct</span>
          </div>
          <div className="exam-score total">
            <span className="exam-score-label">Total</span>
            <strong className="exam-score-value accent">{results.total}</strong>
            <span className="exam-score-sub">/ 1600</span>
          </div>
        </div>
        <div className="exam-results-actions">
          <Link className="btn btn-primary" href="/dashboard/analytics">
            View analytics
          </Link>
          <Link className="btn btn-ghost" href="/dashboard/review">
            Review your misses
          </Link>
          <button className="btn btn-ghost" onClick={() => location.reload()}>
            Retake test
          </button>
        </div>
      </div>
    );
  }

  if (!mod || !q) {
    return <div className="dash-card"><p>Loading…</p></div>;
  }

  return (
    <div className="exam-shell">
      <header className="exam-bar">
        <div className="exam-bar-left">
          <span className="exam-module-title">{mod.label}</span>
          <button className="exam-btn" onClick={() => setDirectionsOpen((v) => !v)}>
            Directions
          </button>
        </div>
        <div className="exam-bar-center">
          {!timerHidden && <span className="exam-timer">{fmt(secondsLeft)}</span>}
          <button className="exam-btn" onClick={() => setTimerHidden((v) => !v)}>
            {timerHidden ? "Show" : "Hide"}
          </button>
        </div>
        <div className="exam-bar-right">
          {mod.section === "reading_writing" && (
            <button
              className={`exam-btn${highlightOn ? " marked" : ""}`}
              onClick={() => setHighlightOn((v) => !v)}
            >
              Highlight
            </button>
          )}
          {mod.section === "math" && (
            <>
              <button className="exam-btn" onClick={() => setShowRef(true)}>
                Reference
              </button>
              <button className="exam-btn" onClick={() => setShowCalc(true)}>
                Calculator
              </button>
            </>
          )}
          <button className="exam-btn" onClick={toggleFullscreen}>
            Fullscreen
          </button>
        </div>
      </header>

      {directionsOpen && (
        <div className="exam-directions">
          <p>
            The questions in this section address a number of important{" "}
            {mod.section === "math" ? "math" : "reading and writing"} skills. Read each
            question carefully and choose the best answer.{" "}
            {mod.section === "math"
              ? "Some questions are grid-in; enter a numeric answer."
              : "All questions are multiple-choice with four answer choices."}
          </p>
          <button className="exam-btn" onClick={() => setDirectionsOpen(false)}>
            Close
          </button>
        </div>
      )}

      {viewMode === "review" ? (
        <div className="exam-review">
          <h1 className="exam-intro-title">Check your work</h1>
          <p className="dash-sub">
            Review anything unanswered or flagged, or continue when you&apos;re ready.
          </p>
          <div className="exam-nav-legend">
            <span className="l-current">Current</span>
            <span className="l-unanswered">Unanswered</span>
            <span className="l-answered">Answered</span>
            <span className="l-forreview">For review</span>
          </div>
          <div className="exam-nav-grid">
            {mod.questions.map((qq, i) => {
              const a = answers[qq.id];
              const cls = a ? "answered" : marked[qq.id] ? "forreview" : "unanswered";
              return (
                <button key={qq.id} className={`exam-nav-btn ${cls}`} onClick={() => goto(i)}>
                  {i + 1}
                </button>
              );
            })}
          </div>
          <footer className="exam-footer">
            <button className="exam-btn" onClick={() => setViewMode("question")}>
              Back
            </button>
            <button className="btn btn-primary" onClick={nextModule}>
              {moduleIdx === 3 ? "Submit" : "Next module"}
            </button>
          </footer>
        </div>
      ) : (
        <div className="exam-body">
          <div className="exam-panes">
            {q.passage && (
              <>
                <div
                  className="exam-passage"
                  ref={passageRef}
                  onMouseUp={onPassageMouseUp}
                  onClick={onPassageClick}
                >
                  <MathText text={q.passage} />
                </div>
                <div className="exam-divider" role="separator" aria-hidden="true" />
              </>
            )}
            <div className="exam-question">
              <div className="exam-qhead">
                <span className="exam-qnum">{qIdx + 1}</span>
                <span className="exam-skill">
                  {q.domain}
                  {q.skill ? ` · ${q.skill}` : ""}
                </span>
                <button
                  className={`exam-btn${marked[q.id] ? " marked" : ""}`}
                  onClick={toggleMark}
                >
                  {marked[q.id] ? "✓ For review" : "Mark for review"}
                </button>
              </div>
              <div className="exam-stem">
                <MathText text={q.question_text} />
              </div>
              {q.is_grid_in ? (
                <input
                  className="field-input exam-input"
                  inputMode="decimal"
                  placeholder="Enter your answer…"
                  value={answers[q.id] ?? ""}
                  onChange={(e) => answer(e.target.value)}
                />
              ) : (
                <div className="exam-choices">
                  {(q.choices ?? []).map((c) => (
                    <button
                      key={c.label}
                      className={`exam-choice${answers[q.id] === c.label ? " selected" : ""}`}
                      onClick={() => answer(c.label)}
                    >
                      <span className="exam-choice-label">{c.label}</span>
                      <span className="exam-choice-text">
                        <MathText text={c.text} />
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <footer className="exam-footer">
            <button className="exam-btn" onClick={back} disabled={qIdx === 0}>
              Back
            </button>
            <button className="exam-btn exam-counter" onClick={() => setNavOpen(true)}>
              {qIdx + 1} of {mod.questions.length}
            </button>
            <button className="exam-btn" onClick={next}>
              {qIdx === mod.questions.length - 1 ? "Review" : "Next"}
            </button>
          </footer>
        </div>
      )}

      {navOpen && (
        <div className="exam-nav-overlay" onClick={() => setNavOpen(false)}>
          <div className="exam-nav" onClick={(e) => e.stopPropagation()}>
            <div className="exam-nav-head">
              <span className="exam-module-title">{mod.label}</span>
              <button className="exam-btn" onClick={() => setNavOpen(false)}>
                Close
              </button>
            </div>
            <div className="exam-nav-legend">
              <span className="l-current">Current</span>
              <span className="l-unanswered">Unanswered</span>
              <span className="l-answered">Answered</span>
              <span className="l-forreview">For review</span>
            </div>
            <div className="exam-nav-grid">
              {mod.questions.map((qq, i) => {
                const a = answers[qq.id];
                const cls =
                  i === qIdx
                    ? "current"
                    : a
                      ? "answered"
                      : marked[qq.id]
                        ? "forreview"
                        : "unanswered";
                return (
                  <button key={qq.id} className={`exam-nav-btn ${cls}`} onClick={() => goto(i)}>
                    {i + 1}
                  </button>
                );
              })}
            </div>
            <button
              className="btn btn-primary"
              onClick={() => {
                setNavOpen(false);
                setViewMode("review");
              }}
            >
              Go to the review page
            </button>
          </div>
        </div>
      )}

      <ReferenceSheet open={showRef} onClose={() => setShowRef(false)} />
      <DesmosCalculator open={showCalc} onClose={() => setShowCalc(false)} />
    </div>
  );
}
