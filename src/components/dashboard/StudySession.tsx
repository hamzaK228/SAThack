"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import MathText from "@/components/MathText";
import QuestionText from "@/components/QuestionText";
import ReferenceSheet from "./ReferenceSheet";
const DesmosCalculator = dynamic(() => import("./DesmosCalculator"));
const Tutor = dynamic(() => import("./Tutor"));
import { loadSessionQuestions, recordAttempt, toggleSave } from "@/app/dashboard/actions";
import { QUESTION_BATCH_SIZE, type SessionQuestion } from "@/lib/session-questions";
import { isCorrectAnswer as isCorrect } from "@/lib/question-answer";

export default function StudySession({ questions: initialQuestions, questionIds, initialSavedIds = [] }: {
  questions: SessionQuestion[]; questionIds: string[]; initialSavedIds?: string[];
}) {
  const [questions, setQuestions] = useState(initialQuestions);
  const loadedCount = useRef(initialQuestions.length);
  const batchPromise = useRef<Promise<void> | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const advancingRef = useRef(false);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [showRef, setShowRef] = useState(false);
  const [showCalc, setShowCalc] = useState(false);
  const [showTutor, setShowTutor] = useState(false);
  const [savedIds, setSavedIds] = useState(() => new Set(initialSavedIds));
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const currentId = useRef(questions[0]?.id);
  const [highlightOn, setHighlightOn] = useState(false);
  const passageRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(() => {
    if (batchPromise.current) return batchPromise.current;
    const ids = questionIds.slice(loadedCount.current, loadedCount.current + QUESTION_BATCH_SIZE);
    if (!ids.length) return Promise.resolve();
    const promise = loadSessionQuestions(ids).then((batch) => {
      loadedCount.current += batch.questions.length;
      setQuestions((previous) => previous.concat(batch.questions));
      setSavedIds((previous) => new Set([...previous, ...batch.savedIds]));
    }).finally(() => { batchPromise.current = null; });
    batchPromise.current = promise;
    return promise;
  }, [questionIds]);

  useEffect(() => {
    if (index >= questions.length - 5 && questions.length < questionIds.length) {
      void loadMore().catch(() => { /* Next retries a failed background request. */ });
    }
  }, [index, questions.length, questionIds.length, loadMore]);

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
        <p>No questions match this session.</p>
      </div>
    );
  }

  const q = questions[index];
  const saved = savedIds.has(q.id);
  const correct = checked && selected !== null ? isCorrect(selected, q.correct_answer) : null;
  const progress = Math.round(((index + (checked ? 1 : 0)) / questionIds.length) * 100);
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
              <QuestionText html={c.html} text={c.text} />
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

  async function check() {
    if (!selected?.trim() || checked) return;
    setActionError(null);
    setChecked(true);
    try {
      const result = await recordAttempt({
        question_id: q.id,
        selected_answer: selected,
      });
      if (!result.ok) throw new Error("Attempt could not be saved");
    } catch {
      setActionError("Your answer could not be saved. Check your connection and try again.");
      if (currentId.current === q.id) setChecked(false);
    }
  }

  async function next() {
    if (advancingRef.current) return;
    const nextIndex = index < questionIds.length - 1 ? index + 1 : 0;
    if (nextIndex >= loadedCount.current) {
      advancingRef.current = true;
      setAdvancing(true);
      try {
        await loadMore();
      } catch {
        setActionError("Could not load the next question. Please try again.");
        return;
      } finally {
        advancingRef.current = false;
        setAdvancing(false);
      }
    }
    setSelected(null);
    setChecked(false);
    setActionError(null);
    currentId.current = questionIds[nextIndex];
    setIndex(nextIndex);
  }

  async function save() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setActionError(null);
    const id = q.id;
    const desired = !saved;
    function updateSaved(value: boolean) {
      setSavedIds((previous) => {
        const updated = new Set(previous);
        if (value) updated.add(id);
        else updated.delete(id);
        return updated;
      });
    }
    updateSaved(desired);
    try {
      const result = await toggleSave(id, desired);
      if (!result.ok) throw new Error("Save failed");
    } catch {
      updateSaved(!desired);
      setActionError("The question could not be saved. Please try again.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
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
            Question {index + 1}/{questionIds.length}
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

      <div key={q.id} className={`dash-card session-card${isRW && (q.passage || q.passage_html) ? " session-card-split" : ""}`}>
        {isRW && (q.passage || q.passage_html) ? (
          <div className="session-panes">
            <div
              className={`session-passage-pane${highlightOn ? " highlighting" : ""}`}
              ref={passageRef}
              onMouseUp={onPassageMouseUp}
              onClick={onPassageClick}
            >
              <span className="session-pane-label">Passage</span>
              <QuestionText html={q.passage_html} text={q.passage ?? ""} />
            </div>
            <div className="session-divider" role="separator" aria-hidden="true" />
            <div className="session-question-pane">
              <div className="session-question">
                <QuestionText html={q.question_text_html} text={q.question_text} />
              </div>
              {answerBlock}
              {feedbackBlock}
            </div>
          </div>
        ) : (
          <>
            {(q.passage || q.passage_html) && (
              <div
                className={`session-passage${highlightOn ? " highlighting" : ""}`}
                ref={passageRef}
                onMouseUp={onPassageMouseUp}
                onClick={onPassageClick}
              >
                <QuestionText html={q.passage_html} text={q.passage ?? ""} />
              </div>
            )}

            <div className="session-question">
              <QuestionText html={q.question_text_html} text={q.question_text} />
            </div>

            {answerBlock}
            {feedbackBlock}
          </>
        )}
      </div>

      {actionError && <p role="alert">{actionError}</p>}
      <div className="session-actions">
        <button
          className={`btn ${saved ? "btn-primary" : "btn-ghost"}`}
          onClick={save}
          aria-pressed={saved}
          disabled={saving}
        >
          {saved ? "★ Saved" : "☆ Save"}
        </button>
          <button className="btn btn-primary" onClick={check} disabled={checked || !selected?.trim()}>
            Check
          </button>
          <button className="btn btn-ghost" onClick={next} disabled={advancing}>
            {advancing ? "Loading..." : index < questionIds.length - 1 ? "Next question →" : "Restart"}
          </button>
      </div>

      {showCalc && <DesmosCalculator open={showCalc} onClose={() => setShowCalc(false)} />}
      {showTutor && <Tutor
        open={showTutor}
        onClose={() => setShowTutor(false)}
        question={q.question_text}
        skill={q.skill}
        domain={q.domain}
        explanation={q.explanation}
        correctAnswer={q.correct_answer}
      />}
    </div>
  );
}
