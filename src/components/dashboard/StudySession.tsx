"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import MathText from "@/components/MathText";
import QuestionText from "@/components/QuestionText";
import ReferenceSheet from "./ReferenceSheet";
const DesmosCalculator = dynamic(() => import("./DesmosCalculator"));
const Tutor = dynamic(() => import("./Tutor"));
import { loadSessionQuestions, checkAttempt, toggleSave } from "@/app/dashboard/actions";
import { explainAttempt } from "@/app/dashboard/feature-actions";
import QuestionReportButton from "@/components/dashboard/QuestionReportButton";
import { QUESTION_BATCH_SIZE, type SessionQuestion } from "@/lib/session-questions";
import { markStatsDirty } from "@/lib/stats-dirty";

export default function StudySession({ questions: initialQuestions, questionIds, initialSavedIds = [], review = false, savedOnly = false, mastery = false }: {
  questions: SessionQuestion[]; questionIds: string[]; initialSavedIds?: string[]; review?: boolean; savedOnly?: boolean; mastery?: boolean;
}) {
  const [questions, setQuestions] = useState(initialQuestions);
  // Freeze the deck at mount: the stats refresh after each answer re-renders
  // the page, and in status-filtered sessions (unsolved/missed/solved) the
  // answered question drops out of the server's id list — shifting the prop
  // under this component while `questions` state stays from mount. Navigating
  // by the live prop desynced the shown question from the identity marker and
  // left the Check spinner stuck from question 2. A session's deck is fixed
  // the moment it opens.
  const deck = useRef(questionIds).current;
  const loadedCount = useRef(initialQuestions.length);
  const batchPromise = useRef<Promise<void> | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const advancingRef = useRef(false);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<"idle" | "incorrect" | "correct">("idle");
  const [explanation, setExplanation] = useState<string | null>(null);
  const [firstAttemptRecorded, setFirstAttemptRecorded] = useState(false);
  const [checking, setChecking] = useState(false);
  const checkingRef = useRef(false);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const [seconds, setSeconds] = useState(0);
  const [showRef, setShowRef] = useState(false);
  const [showCalc, setShowCalc] = useState(false);
  const [showTutor, setShowTutor] = useState(false);
  const [savedIds, setSavedIds] = useState(() => new Set(initialSavedIds));
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [masteryStreak, setMasteryStreak] = useState(0);
  const [explaining, setExplaining] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);
  const currentId = useRef(questions[0]?.id);
  const [highlightOn, setHighlightOn] = useState(false);
  const passageRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(() => {
    if (batchPromise.current) return batchPromise.current;
    const ids = deck.slice(loadedCount.current, loadedCount.current + QUESTION_BATCH_SIZE);
    if (!ids.length) return Promise.resolve();
    const promise = loadSessionQuestions(ids, review || savedOnly ? { officialOnly: false } : undefined).then((batch) => {
      loadedCount.current += batch.questions.length;
      setQuestions((previous) => previous.concat(batch.questions));
      setSavedIds((previous) => new Set([...previous, ...batch.savedIds]));
    }).finally(() => { batchPromise.current = null; });
    batchPromise.current = promise;
    return promise;
  }, [deck, review, savedOnly]);

  useEffect(() => {
    if (index >= questions.length - 5 && questions.length < deck.length) {
      void loadMore().catch(() => { /* Next retries a failed background request. */ });
    }
  }, [index, questions.length, deck.length, loadMore]);

  useEffect(() => {
    const t = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, []);

  // Keyboard flow for fast drilling: A–D select, Enter checks / advances,
  // → advances after a correct answer, ← steps back to the previous question.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (showRef || showCalc || showTutor) return;
      const current = questions[index];
      if (!current) return;
      const key = e.key.toLowerCase();
      if (!current.is_grid_in && ["a", "b", "c", "d"].includes(key)) {
        const choice = (current.choices ?? []).find((c) => c.label.toLowerCase() === key);
        if (choice && feedback !== "correct" && !checking) {
          setSelected(choice.label);
          if (feedback === "incorrect") setFeedback("idle");
        }
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (feedback === "correct") void next();
        else if (selected?.trim() && !checking) void check();
        return;
      }
      if (e.key === "ArrowRight" && feedback === "correct" && !advancing) void next();
      if (e.key === "ArrowLeft" && !advancing && !checking) previous();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions, index, selected, feedback, checking, advancing, showRef, showCalc, showTutor]);

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
  const solved = feedback === "correct";
  const progress = Math.round(((index + (solved ? 1 : 0)) / deck.length) * 100);
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
      disabled={solved || checking}
      onChange={(e) => {
        setSelected(e.target.value);
        if (feedback === "incorrect") setFeedback("idle");
      }}
    />
  ) : (
    <div className="session-choices">
      {(q.choices ?? []).map((c) => {
        const isSelected = selected === c.label;
        const isRight = solved && isSelected;
        const isWrong = feedback === "incorrect" && isSelected;
        return (
          <button
            key={c.label}
            className={`session-choice${isSelected ? " selected" : ""}${isRight ? " right" : ""}${
              isWrong ? " wrong" : ""
            }`}
            disabled={solved || checking}
            onClick={() => {
              setSelected(c.label);
              if (feedback === "incorrect") setFeedback("idle");
            }}
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

  const feedbackBlock = feedback !== "idle" && (
    <div className={`session-feedback ${solved ? "ok" : "bad"}`} role="status" ref={feedbackRef}>
      <p className="session-feedback-title">
        {solved ? "Correct ✓" : "Not quite — try again."}
      </p>
      {solved && mastery && masteryStreak < 3 && (
        <p className="session-feedback-note">
          {masteryStreak} of 3 in a row. Get it right once more to lock it in.
        </p>
      )}
      {!solved && (
        <p className="session-feedback-note">
          This question stays in your review queue. Choose another answer, or see the explanation.
        </p>
      )}
      {!explanation && (
        <button
          className="btn btn-ghost session-explain-btn"
          type="button"
          onClick={() => void revealExplanation()}
          disabled={explaining}
        >
          {explaining ? "Loading explanation…" : "Show explanation"}
        </button>
      )}
      {explanation && (
        <div className="session-explanation">
          <MathText text={explanation} />
        </div>
      )}
      {explainError && <p className="session-feedback-note" role="alert">{explainError}</p>}
    </div>
  );

  async function check() {
    if (!selected?.trim() || solved || checkingRef.current) return;
    // Mastery records every try so the three-in-a-row rule is judged by the
    // database, not by this component's memory. Normal drills record only the
    // first attempt and let a correct retry be the mastery signal.
    const shouldRecord = mastery ? true : !firstAttemptRecorded;
    checkingRef.current = true;
    setChecking(true);
    setActionError(null);
    setExplainError(null);
    try {
      // The answer key never ships to the browser: the server grades against
      // the stored answer and only sends back the verdict (plus the official
      // explanation once the student has it right).
      const result = await checkAttempt({
        question_id: q.id,
        selected_answer: selected,
        record: shouldRecord,
        force: mastery,
      });
      if (!result.ok) throw new Error("Attempt could not be saved");
      if (currentId.current !== q.id) return;
      if (shouldRecord) {
        setFirstAttemptRecorded(true);
      }
      if (result.recorded) {
        // The attempt changed XP / accuracy / streak — let the rail refresh.
        markStatsDirty();
      }
      setExplanation(result.explanation ?? null);
      setFeedback(result.correct ? "correct" : "incorrect");
      setMasteryStreak((previous) => (result.correct ? previous + 1 : 0));
      requestAnimationFrame(() => {
        feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    } catch {
      setActionError("Your answer could not be saved. Check your connection and try again.");
    } finally {
      checkingRef.current = false;
      if (currentId.current === q.id) setChecking(false);
    }
  }

  async function revealExplanation() {
    if (explaining) return;
    const id = q.id;
    setExplaining(true);
    setExplainError(null);
    try {
      const result = await explainAttempt(id);
      if (currentId.current !== id) return;
      if (!result.ok) throw new Error(result.error ?? "Could not load the explanation.");
      setExplanation(result.explanation ?? "No explanation is available for this one yet.");
    } catch (error) {
      if (currentId.current === id) {
        setExplainError(error instanceof Error ? error.message : "Could not load the explanation.");
      }
    } finally {
      if (currentId.current === id) setExplaining(false);
    }
  }

  function previous() {
    if (index === 0) return;
    const previousIndex = index - 1;
    setSelected(null);
    setFeedback("idle");
    setExplanation(null);
    setFirstAttemptRecorded(false);
    setChecking(false);
    setActionError(null);
    setMasteryStreak(0);
    setExplainError(null);
    currentId.current = deck[previousIndex];
    setIndex(previousIndex);
  }

  async function next() {
    if (advancingRef.current) return;
    // Mastery keeps the same question until three correct answers in a row.
    if (mastery && feedback === "correct" && masteryStreak < 3) {
      setSelected(null);
      setFeedback("idle");
      setExplanation(null);
      setExplainError(null);
      setFirstAttemptRecorded(true);
      setChecking(false);
      return;
    }
    const nextIndex = index < deck.length - 1 ? index + 1 : 0;
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
    setFeedback("idle");
    setExplanation(null);
    setFirstAttemptRecorded(false);
    setChecking(false);
    setActionError(null);
    setMasteryStreak(0);
    setExplainError(null);
    currentId.current = deck[nextIndex];
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
            Question {index + 1}
          </span>
          <span className="session-chip">{q.difficulty}</span>
          <span className="session-chip">{q.domain}</span>
          {mastery && <span className="session-chip mastery-chip">Mastery {Math.min(masteryStreak, 3)}/3</span>}
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
          <button className="btn btn-primary" onClick={check} disabled={solved || checking || !selected?.trim()}>
            {checking ? "Checking…" : feedback === "incorrect" ? "Try answer" : "Check"}
          </button>
          <button className="btn btn-ghost" onClick={previous} disabled={advancing || checking || index === 0}>
            ← Previous question
          </button>
          <button className="btn btn-ghost" onClick={next} disabled={advancing || checking}>
            {advancing
              ? "Loading..."
              : mastery && solved && masteryStreak < 3
                ? `Next attempt (${masteryStreak}/3)`
                : index < deck.length - 1
                  ? "Next question →"
                  : "New set ↻"}
          </button>
          <QuestionReportButton questionId={q.id} />
      </div>

      {showCalc && <DesmosCalculator open={showCalc} onClose={() => setShowCalc(false)} />}
      {showTutor && <Tutor
        open={showTutor}
        onClose={() => setShowTutor(false)}
        question={q.question_text}
        skill={q.skill}
        domain={q.domain}
        explanation={feedback === "correct" ? explanation : null}
        correctAnswer={feedback === "correct" ? (selected ?? "") : ""}
      />}
    </div>
  );
}
