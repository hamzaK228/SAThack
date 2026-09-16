"use client";

import { useEffect, useRef, useState } from "react";
import MathText from "@/components/MathText";
import ReferenceSheet from "./ReferenceSheet";
import DesmosCalculator from "./DesmosCalculator";
import Tutor from "./Tutor";
import { recordAttempt, toggleSave } from "@/app/dashboard/actions";

type Choice = { label: string; text: string };
type Question = {
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

export default function StudySession({ questions }: { questions: Question[] }) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [showRef, setShowRef] = useState(false);
  const [showCalc, setShowCalc] = useState(false);
  const [showTutor, setShowTutor] = useState(false);
  const [saved, setSaved] = useState(false);
  const [highlightOn, setHighlightOn] = useState(false);
  const passageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, []);

  function fmt(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }

  if (questions.length === 0) {
    return (
      <div className="dash-card">
        <p>No questions available yet. The question bank is empty.</p>
      </div>
    );
  }

  const q = questions[index];
  const correct = checked && selected !== null ? isCorrect(selected, q.correct_answer) : null;
  const progress = Math.round(((index + (checked ? 1 : 0)) / questions.length) * 100);
  const isRW = q.section === "reading_writing";

  // Shared answer + feedback blocks, rendered either in the two-pane R&W layout
  // (passage left, question right) or the single-column math layout.
  const answerBlock = q.is_grid_in ? (
    <input
      className="field-input session-input"
      type="text"
      inputMode="decimal"
      placeholder="Type your answer…"
      value={selected ?? ""}
      disabled={checked}
      onChange={(e) => setSelected(e.target.value)}
    />
  ) : (
    <div className="session-choices">
      {(q.choices ?? []).map((c) => {
        const isSelected = selected === c.label;
        const isRight = checked && c.label === q.correct_answer;
        const isWrong = checked && isSelected && c.label !== q.correct_answer;
        return (
          <button
            key={c.label}
            className={`session-choice${isSelected ? " selected" : ""}${isRight ? " right" : ""}${
              isWrong ? " wrong" : ""
            }`}
            disabled={checked}
            onClick={() => setSelected(c.label)}
          >
            <span className="session-choice-label">{c.label}</span>
            <span className="session-choice-text">
              <MathText text={c.text} />
            </span>
          </button>
        );
      })}
    </div>
  );

  const feedbackBlock = checked && (
    <div className={`session-feedback ${correct ? "ok" : "bad"}`}>
      <p className="session-feedback-title">
        {correct ? "Correct ✓" : `Incorrect — the answer is ${q.correct_answer}`}
      </p>
      {q.explanation && (
        <div className="session-explanation">
          <MathText text={q.explanation} />
        </div>
      )}
    </div>
  );

  function check() {
    if (selected === null || checked) return;
    setChecked(true);
    recordAttempt({
      question_id: q.id,
      selected_answer: selected,
      correct_answer: q.correct_answer,
      is_correct: isCorrect(selected, q.correct_answer),
      section: q.section,
      domain: q.domain,
    });
  }

  function next() {
    setSelected(null);
    setChecked(false);
    setSaved(false);
    setIndex((i) => Math.min(i + 1, questions.length - 1));
  }

  function save() {
    setSaved((v) => !v);
    toggleSave(q.id);
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  }

  // --- highlight in R&W passages (same interaction as the practice test) ---
  function onPassageMouseUp() {
    if (!highlightOn || !passageRef.current) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    if (!passageRef.current.contains(range.commonAncestorContainer)) return;
    try {
      const mark = document.createElement("mark");
      mark.className = "session-highlight";
      range.surroundContents(mark);
      sel.removeAllRanges();
    } catch {
      // selection spans mixed nodes (e.g. math) — ignore
    }
  }

  function onPassageClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.classList?.contains("session-highlight")) {
      const parent = target.parentNode;
      if (parent) {
        while (target.firstChild) parent.insertBefore(target.firstChild, target);
        parent.removeChild(target);
      }
    }
  }

  return (
    <div className="session-shell">
      <div className="session-top">
        <div className="session-meta">
          <span className="session-qnum">
            Question {index + 1}/{questions.length}
          </span>
          <span className="session-chip">{q.difficulty}</span>
          <span className="session-chip">{q.domain}</span>
          <span className="session-timer" aria-label="Elapsed time">
            ⏱ {fmt(seconds)}
          </span>
          {isRW ? (
            <button
              className={`session-chip session-ref-btn${highlightOn ? " active" : ""}`}
              onClick={() => setHighlightOn((v) => !v)}
              aria-pressed={highlightOn}
            >
              ✏️ Highlight{highlightOn ? " on" : ""}
            </button>
          ) : (
            <>
              <button className="session-chip session-ref-btn" onClick={() => setShowRef((v) => !v)}>
                {showRef ? "Hide reference" : "Reference sheet"}
              </button>
              <button className="session-chip session-calc" onClick={() => setShowCalc(true)}>
                🧮 Calculator
              </button>
            </>
          )}
          <button className="session-chip session-ref-btn" onClick={toggleFullscreen}>
            ⛶ Fullscreen
          </button>
          <button className="session-chip session-calc" onClick={() => setShowTutor(true)}>
            💬 Tutor
          </button>
        </div>
        <div className="session-progress">
          <div className="session-progress-bar">
            <span style={{ width: `${progress}%` }}></span>
          </div>
        </div>
      </div>

      <ReferenceSheet open={showRef} onClose={() => setShowRef(false)} />

      <div className={`dash-card session-card${isRW && q.passage ? " session-card-split" : ""}`}>
        {isRW && q.passage ? (
          <div className="session-panes">
            <div
              className={`session-passage-pane${highlightOn ? " highlighting" : ""}`}
              ref={passageRef}
              onMouseUp={onPassageMouseUp}
              onClick={onPassageClick}
            >
              <span className="session-pane-label">Passage</span>
              <MathText text={q.passage} />
            </div>
            <div className="session-divider" role="separator" aria-hidden="true" />
            <div className="session-question-pane">
              <div className="session-question">
                <MathText text={q.question_text} />
              </div>
              {answerBlock}
              {feedbackBlock}
            </div>
          </div>
        ) : (
          <>
            {q.passage && (
              <div
                className={`session-passage${highlightOn ? " highlighting" : ""}`}
                ref={passageRef}
                onMouseUp={onPassageMouseUp}
                onClick={onPassageClick}
              >
                <MathText text={q.passage} />
              </div>
            )}

            <div className="session-question">
              <MathText text={q.question_text} />
            </div>

            {answerBlock}
            {feedbackBlock}
          </>
        )}
      </div>

      <div className="session-actions">
        <button
          className={`btn ${saved ? "btn-primary" : "btn-ghost"}`}
          onClick={save}
          aria-pressed={saved}
        >
          {saved ? "★ Saved" : "☆ Save"}
        </button>
        {!checked ? (
          <button className="btn btn-primary" onClick={check} disabled={selected === null}>
            Check
          </button>
        ) : index < questions.length - 1 ? (
          <button className="btn btn-primary" onClick={next}>
            Next question →
          </button>
        ) : (
          <button className="btn btn-ghost" onClick={() => setIndex(0)}>
            Restart
          </button>
        )}
      </div>

      <DesmosCalculator open={showCalc} onClose={() => setShowCalc(false)} />
      <Tutor
        open={showTutor}
        onClose={() => setShowTutor(false)}
        question={q.question_text}
        skill={q.skill}
        domain={q.domain}
        explanation={q.explanation}
        correctAnswer={q.correct_answer}
      />
    </div>
  );
}
