"use client";

import { useState } from "react";
import Link from "next/link";
import QuestionText from "@/components/QuestionText";
import { saveDiagnostic } from "@/app/dashboard/actions";

type Q = {
  id: string;
  section: string;
  domain: string;
  skill: string | null;
  difficulty: string;
  is_grid_in: boolean;
  question_text: string;
  question_text_html?: string | null;
  passage: string | null;
  passage_html?: string | null;
  choices: { label: string; text: string; html?: string | null }[] | null;
  correct_answer: string;
};

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

export default function DiagnosticExam({ questions }: { questions: Q[] }) {
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [result, setResult] = useState<{ rw: number; math: number; total: number } | null>(null);
  const [saving, setSaving] = useState(false);

  if (questions.length === 0) {
    return (
      <div className="dash-empty">
        <p>No questions available.</p>
      </div>
    );
  }

  const q = questions[idx];

  function answer(val: string) {
    setAnswers((a) => ({ ...a, [q.id]: val }));
  }

  async function finish() {
    setSaving(true);
    let rwCorrect = 0;
    let rwTotal = 0;
    let mathCorrect = 0;
    let mathTotal = 0;
    const breakdown: Record<string, { correct: number; total: number }> = {};
    const attempts: Parameters<typeof saveDiagnostic>[0]["attempts"] = [];

    for (const qq of questions) {
      const sel = answers[qq.id] ?? null;
      const ok = sel !== null && isCorrect(sel, qq.correct_answer);
      if (qq.section === "math") {
        mathTotal++;
        if (ok) mathCorrect++;
      } else {
        rwTotal++;
        if (ok) rwCorrect++;
      }
      const b = breakdown[qq.domain] || { correct: 0, total: 0 };
      b.total++;
      if (ok) b.correct++;
      breakdown[qq.domain] = b;
      attempts.push({
        question_id: qq.id,
        selected_answer: sel,
        correct_answer: qq.correct_answer,
        is_correct: ok,
        section: qq.section,
        domain: qq.domain,
      });
    }

    const res = await saveDiagnostic({
      rw_correct: rwCorrect,
      rw_total: rwTotal,
      math_correct: mathCorrect,
      math_total: mathTotal,
      domain_breakdown: breakdown,
      attempts,
    });
    setResult({ rw: res.rwScore, math: res.mathScore, total: res.total });
    setSaving(false);
    setDone(true);
  }

  if (done && result) {
    return (
      <div className="exam-results">
        <p className="eyebrow">Diagnostic complete</p>
        <h1 className="exam-intro-title">Your baseline score</h1>
        <div className="exam-score-grid">
          <div className="exam-score">
            <span className="exam-score-label">Reading &amp; Writing</span>
            <strong className="exam-score-value">{result.rw}</strong>
          </div>
          <div className="exam-score">
            <span className="exam-score-label">Math</span>
            <strong className="exam-score-value">{result.math}</strong>
          </div>
          <div className="exam-score total">
            <span className="exam-score-label">Total</span>
            <strong className="exam-score-value accent">{result.total}</strong>
            <span className="exam-score-sub">/ 1600</span>
          </div>
        </div>
        <p className="dash-sub" style={{ textAlign: "center", marginBottom: "1rem" }}>
          This becomes your starting score — your study plan is now built around it.
        </p>
        <div className="exam-results-actions" style={{ justifyContent: "center" }}>
          <Link className="btn btn-primary" href="/dashboard/plan">
            See your study plan
          </Link>
          <Link className="btn btn-ghost" href="/dashboard/analytics">
            View analytics
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="exam-shell">
      <header className="exam-bar">
        <span className="exam-module-title">
          Diagnostic · {idx + 1} of {questions.length}
        </span>
        <span className="exam-skill">
          {q.section === "math" ? "Math" : "Reading & Writing"} · {q.domain}
        </span>
      </header>

      <div className="exam-body">
        <div className="exam-panes">
          {q.passage && (
            <div className="exam-passage">
              <QuestionText html={q.passage_html} text={q.passage} />
            </div>
          )}
          <div className="exam-question">
            <div className="exam-stem">
              <QuestionText html={q.question_text_html} text={q.question_text} />
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
                      <QuestionText html={c.html} text={c.text} />
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <footer className="exam-footer">
          <button
            className="exam-btn"
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
            disabled={idx === 0}
          >
            Back
          </button>
          <button
            className="btn btn-primary"
            onClick={() => (idx < questions.length - 1 ? setIdx(idx + 1) : finish())}
            disabled={saving}
          >
            {idx < questions.length - 1 ? "Next →" : saving ? "Scoring…" : "Finish"}
          </button>
        </footer>
      </div>
    </div>
  );
}

