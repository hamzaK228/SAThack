"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Calculator,
  BookOpen,
  Eye,
  EyeOff,
  Highlighter,
  ListX,
  Maximize2,
  StickyNote,
  X,
} from "lucide-react";
import QuestionText from "@/components/QuestionText";
import type { Assessment, AssessmentKind } from "@/lib/assessment";
import { assessmentAction } from "@/app/dashboard/assessment-actions";
const DesmosCalculator = dynamic(() => import("./DesmosCalculator"));
const ReferenceSheet = dynamic(() => import("./ReferenceSheet"));

export default function AssessmentExam({
  kind,
  formId,
  title,
  initial,
}: {
  kind: AssessmentKind;
  formId?: string;
  title?: string;
  initial: Assessment | null;
}) {
  const router=useRouter();
  const [session, setSession] = useState(initial);
  const [started, setStarted] = useState(false);
  const [answers, setAnswers] = useState(initial?.answers ?? {});
  const [marked, setMarked] = useState(initial?.marked ?? []);
  const [index, setIndex] = useState(initial?.questionIndex ?? 0);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState("Saved");
  const [remaining, setRemaining] = useState<number | null>(null);
  const [calculator, setCalculator] = useState(false);
  const [reference, setReference] = useState(false);
  const [timerHidden, setTimerHidden] = useState(false);
  const [highlighting, setHighlighting] = useState(false);
  const [eliminating, setEliminating] = useState(false);
  const [eliminated, setEliminated] = useState<string[]>([]);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState(() =>
    typeof window !== "undefined" && initial?.id
      ? localStorage.getItem(`assessment-notes:${initial.id}`) ?? ""
      : "",
  );
  const offset = useRef(0);
  const lock = useRef(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const version = useRef(0);
  const pane = useRef<HTMLDivElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const passage = useRef<HTMLDivElement>(null);
  const current = session?.module.questions[index];

  const adopt = useCallback((next: Assessment) => {
    offset.current = Date.parse(next.serverNow) - Date.now();
    setSession(next);
    setAnswers(next.answers);
    setMarked(next.marked);
    setIndex(next.questionIndex);
    setRemaining(
      next.deadline
        ? Math.max(
            0,
            Math.ceil(
              (Date.parse(next.deadline) - Date.parse(next.serverNow)) / 1000,
            ),
          )
        : null,
    );
    setReview(false);
    setSaveState("Saved");
    setNotes(localStorage.getItem(`assessment-notes:${next.id}`) ?? "");
  }, []);

  async function begin(fresh: boolean) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const next = await assessmentAction(fresh ? "start" : "resume", null, {
        kind,
        formId,
      });
      if (!next)
        throw new Error("This test is no longer available. Start a new test.");
      adopt(next);
      setStarted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the test.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  const payload = useCallback(
    () => ({
      moduleIndex: session?.moduleIndex,
      questionIndex: index,
      answers: Object.fromEntries(
        (session?.module.questions ?? []).map((q) => [
          q.id,
          answers[q.id] ?? "",
        ]),
      ),
      marked,
    }),
    [session, index, answers, marked],
  );

  // Serialize saves so slow earlier requests cannot overwrite newer answers.
  const save = useCallback(async () => {
    if (
      !session ||
      !started ||
      lock.current ||
      session.status !== "in_progress"
    )
      return;
    const snapshot = payload();
    const revision = ++version.current;
    setSaveState("Saving...");
    queue.current = queue.current
      .catch(() => {})
      .then(async () => {
        await assessmentAction("save", session.id, snapshot);
        if (revision === version.current) {
          setSaveState("Saved");
          setError(null);
        }
      })
      .catch(() => {
        if (revision === version.current) {
          setSaveState("Not saved");
          setError(
            "Your latest answers could not be saved. Reconnect and retry before leaving.",
          );
        }
      });
    await queue.current;
  }, [session, started, payload]);
  useEffect(() => {
    if (!started) return;
    const t = window.setTimeout(() => void save(), 350);
    return () => window.clearTimeout(t);
  }, [save, started]);
  useEffect(() => {
    if (!started || !session?.deadline || session.status !== "in_progress")
      return;
    const timer = window.setInterval(() => {
      const left = Math.max(
        0,
        Math.ceil(
          (Date.parse(session.deadline!) - Date.now() - offset.current) / 1000,
        ),
      );
      setRemaining(left);
      if (!left) { setReview(true); window.clearInterval(timer); }
    }, 250);
    return () => window.clearInterval(timer);
  }, [session, started]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (started && session?.status === "in_progress") {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [started, session?.status]);
  useEffect(() => {
    pane.current
      ?.querySelectorAll(".exam-passage, .exam-question")
      .forEach((node) => {
        node.scrollTop = 0;
      });
  }, [index, session?.moduleIndex]);
  useEffect(() => {
    if (!session?.id) return;
    localStorage.setItem(`assessment-notes:${session.id}`, notes);
  }, [notes, session?.id]);

  async function advance() {
    if (!session || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await queue.current;
      const next = await assessmentAction("advance", session.id, payload());
      if (!next) throw new Error("Test unavailable.");
      adopt(next);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not submit. Please retry.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function exitTest() {
    if(!session || lock.current)return;
    lock.current=true;setBusy(true);setError(null);
    try {
      await queue.current;
      await assessmentAction("save",session.id,payload());
      setStarted(false);
      router.push("/dashboard/test");
    } catch {setError("Could not save before leaving. Please retry.");lock.current=false;setBusy(false);}
  }

  async function toggleFullscreen() {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await shell.current?.requestFullscreen();
  }

  function toggleMarked() {
    if (!current) return;
    setMarked((items) =>
      items.includes(current.id)
        ? items.filter((id) => id !== current.id)
        : [...items, current.id],
    );
  }

  function highlightSelection() {
    if (!highlighting || !passage.current) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!passage.current.contains(range.commonAncestorContainer)) return;
    const mark = document.createElement("mark");
    mark.className = "exam-highlight";
    try {
      mark.append(range.extractContents());
      range.insertNode(mark);
      selection.removeAllRanges();
    } catch {
      selection.removeAllRanges();
    }
  }

  function removeHighlight(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (!target.classList.contains("exam-highlight")) return;
    target.replaceWith(...target.childNodes);
  }

  const feedback = error && (
    <div className="feedback bad" role="alert">
      {error}
      {started && (
        <button
          className="btn btn-ghost"
          disabled={busy}
          onClick={() => void save()}
        >
          Retry save
        </button>
      )}
    </div>
  );
  if (!started)
    return (
      <div className="exam-intro">
        <p className="eyebrow">
          {kind === "diagnostic" ? "Diagnostic" : "Practice test"}
        </p>
        <h1 className="exam-intro-title">
          {kind === "diagnostic" ? "Find your starting point" : title ?? "Digital SAT practice"}
        </h1>
        <p className="dash-sub">
          {kind === "diagnostic"
            ? "22 questions. Reading & Writing and Math. Untimed."
            : "98 questions. Four timed modules. 134 minutes. Module 2 adapts to your Module 1 performance."}
        </p>
        <p className="field-help">
          Results are practice estimates, not official SAT scores.
        </p>
        {feedback}
        <div className="exam-results-actions">
          {initial && (
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void begin(false)}
            >
              Continue test
            </button>
          )}
          <button
            className={`btn ${initial ? "btn-ghost" : "btn-primary"}`}
            disabled={busy}
            onClick={() => void begin(true)}
          >
            {busy ? "Loading..." : initial ? "Start new test" : "Start"}
          </button>
        </div>
      </div>
    );
  if (session?.status === "completed" && session.result)
    return (
      <div className="exam-results">
        <p className="eyebrow">Test complete</p>
        <h1 className="exam-intro-title">Your practice estimate</h1>
        <div className="exam-score-grid">
          <div className="exam-score">
            <span>Reading &amp; Writing</span>
            <strong className="exam-score-value">
              {session.result.rwScore}
            </strong>
            <span>
              {session.result.rwCorrect} / {session.result.rwTotal} correct
            </span>
          </div>
          <div className="exam-score">
            <span>Math</span>
            <strong className="exam-score-value">
              {session.result.mathScore}
            </strong>
            <span>
              {session.result.mathCorrect} / {session.result.mathTotal} correct
            </span>
          </div>
          <div className="exam-score total">
            <span>Total estimate</span>
            <strong className="exam-score-value accent">
              {session.result.total}
            </strong>
            <span>/ 1600</span>
          </div>
        </div>
        <p className="dash-sub">
          This estimate uses your accuracy. It is not an official College Board
          scaled score.
        </p>
        <div className="exam-results-actions">
          <Link className="btn btn-primary" href={kind === "practice" ? "/dashboard/test/review" : "/dashboard/review"}>
            Review mistakes
          </Link>
          <Link className="btn btn-ghost" href="/dashboard/plan">
            Study plan
          </Link>
          <Link className="btn btn-ghost" href="/dashboard/analytics">
            Analytics
          </Link>
        </div>
      </div>
    );
  if (!session || !current) return <p role="status">Loading your test...</p>;
  const expired = remaining === 0;
  const answeredCount = session.module.questions.filter((question) =>
    answers[question.id]?.trim(),
  ).length;
  return (
    <div className="exam-shell exam-player" ref={shell}>
      <header className="exam-player-head">
        <button
          className={`exam-review-toggle${marked.includes(current.id) ? " marked" : ""}`}
          aria-pressed={marked.includes(current.id)}
          onClick={toggleMarked}
        >
          Mark for Review
          <Bookmark size={18} fill={marked.includes(current.id) ? "currentColor" : "none"} />
        </button>
        <div className="exam-clock">
          <span className="exam-timer" role="timer" aria-label="Time remaining">
            {timerHidden
              ? "--:--"
              : remaining === null
                ? "Untimed"
                : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`}
          </span>
          <button className="exam-text-tool" onClick={() => setTimerHidden((hidden) => !hidden)}>
            {timerHidden ? "Show" : "Hide"}
          </button>
        </div>
        <div className="exam-tools">
          <span className="field-help" role="status">
            {saveState}
          </span>
          <button
            className={`exam-icon-tool${eliminating ? " active" : ""}`}
            title="Eliminate answers"
            aria-label="Eliminate answers"
            aria-pressed={eliminating}
            onClick={() => setEliminating((active) => !active)}
          >
            <ListX size={19} />
          </button>
          <button
            className={`exam-icon-tool${highlighting ? " active" : ""}`}
            title="Highlight passage"
            aria-label="Highlight passage"
            aria-pressed={highlighting}
            onClick={() => setHighlighting((active) => !active)}
          >
            <Highlighter size={19} />
          </button>
          <button
            className={`exam-icon-tool${notesOpen ? " active" : ""}`}
            title="Notepad"
            aria-label="Notepad"
            aria-pressed={notesOpen}
            onClick={() => setNotesOpen((open) => !open)}
          >
            <StickyNote size={19} />
          </button>
          {current.section === "math" && (
            <>
              <button
                className="exam-icon-tool"
                title="Calculator"
                aria-label="Calculator"
                onClick={() => setCalculator(true)}
              >
                <Calculator size={20} />
              </button>
              <button
                className="exam-icon-tool"
                title="Reference sheet"
                aria-label="Reference sheet"
                onClick={() => setReference(true)}
              >
                <BookOpen size={20} />
              </button>
            </>
          )}
          <button
            className="exam-icon-tool"
            title="Fullscreen"
            aria-label="Fullscreen"
            onClick={() => void toggleFullscreen()}
          >
            <Maximize2 size={19} />
          </button>
          <button
            className="exam-icon-tool"
            disabled={busy}
            onClick={()=>void exitTest()}
            aria-label="Exit test"
            title="Exit test"
          >
            <X size={20} />
          </button>
        </div>
      </header>
      <div className="exam-module-progress">
        <span className="exam-module-title">{session.module.label}</span>
        <span>{answeredCount}/{session.module.questions.length}</span>
        <div className="exam-progress-track" aria-label={`${answeredCount} of ${session.module.questions.length} answered`}>
          <span style={{ width: `${(answeredCount / session.module.questions.length) * 100}%` }} />
        </div>
      </div>
      {feedback}
      {review ? (
        <div className="exam-review">
          <h1 className="exam-intro-title">
            {expired ? "Time is up" : "Review your answers"}
          </h1>
          <p className="dash-sub">
            {
              session.module.questions.filter((q) => !answers[q.id]?.trim())
                .length
            }{" "}
            unanswered
          </p>
          <div className="exam-nav-grid">
            {session.module.questions.map((q, i) => (
              <button
                key={q.id}
                className={`exam-nav-btn ${marked.includes(q.id) ? "forreview" : answers[q.id]?.trim() ? "answered" : "unanswered"}`}
                aria-label={`Question ${i + 1}${marked.includes(q.id) ? ", marked for review" : ""}${answers[q.id]?.trim() ? ", answered" : ", unanswered"}`}
                onClick={() => {
                  setIndex(i);
                  setReview(false);
                }}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <footer className="exam-footer">
            <button className="exam-btn" onClick={() => setReview(false)}>
              <ArrowLeft size={18} /> Back
            </button>
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void advance()}
            >
              {busy
                ? "Saving..."
                : kind === "diagnostic" || session.moduleIndex === 3
                  ? "Submit test"
                  : "Next module"}
              <ArrowRight size={18} />
            </button>
          </footer>
        </div>
      ) : (
        <div className="exam-body" ref={pane}>
          <div className="exam-panes">
            {(current.passage || current.passage_html) && (
              <div
                className={`exam-passage${highlighting ? " highlighting" : ""}`}
                ref={passage}
                onMouseUp={highlightSelection}
                onClick={removeHighlight}
              >
                <QuestionText
                  html={current.passage_html}
                  text={current.passage ?? ""}
                />
              </div>
            )}
            <div className="exam-question">
              <div className="exam-stem">
                <QuestionText
                  html={current.question_text_html}
                  text={current.question_text}
                />
              </div>
              {current.is_grid_in ? (
                <input
                  className="field-input exam-input"
                  aria-label="Your answer"
                  inputMode="decimal"
                  maxLength={200}
                  disabled={expired || busy}
                  value={answers[current.id] ?? ""}
                  onChange={(e) =>
                    setAnswers((a) => ({ ...a, [current.id]: e.target.value }))
                  }
                />
              ) : (
                <div className="exam-choices">
                  {current.choices?.map((c) => {
                    const eliminationId = `${current.id}:${c.label}`;
                    const crossedOut = eliminated.includes(eliminationId);
                    return <div className={`exam-choice-wrap${crossedOut ? " eliminated" : ""}`} key={c.label}>
                      <button
                        className={`exam-choice${answers[current.id] === c.label ? " selected" : ""}`}
                        aria-pressed={answers[current.id] === c.label}
                        disabled={expired || busy || crossedOut}
                        onClick={() => setAnswers((a) => ({ ...a, [current.id]: c.label }))}
                      >
                        <span className="exam-choice-label">{c.label}</span>
                        <span className="exam-choice-text">
                          <QuestionText html={c.html} text={c.text} />
                        </span>
                      </button>
                      {eliminating && <button
                        className="exam-eliminate"
                        aria-label={`${crossedOut ? "Restore" : "Eliminate"} answer ${c.label}`}
                        aria-pressed={crossedOut}
                        onClick={() => setEliminated((items) => items.includes(eliminationId) ? items.filter((id) => id !== eliminationId) : [...items, eliminationId])}
                      >
                        {crossedOut ? <Eye size={18} /> : <EyeOff size={18} />}
                      </button>}
                    </div>;
                  })}
                </div>
              )}
            </div>
          </div>
          <footer className="exam-footer">
            <button
              className="exam-nav-back"
              aria-label="Previous question"
              disabled={index === 0}
              onClick={() => setIndex((i) => i - 1)}
            >
              <ArrowLeft size={18} />
            </button>
            <button className="exam-question-menu" onClick={() => setReview(true)}>
              Question {index + 1} <span aria-hidden="true">○⌃</span>
            </button>
            <button
              className="exam-next"
              onClick={() =>
                index === session.module.questions.length - 1
                  ? setReview(true)
                  : setIndex((i) => i + 1)
              }
            >
              {index === session.module.questions.length - 1
                ? "Review"
                : "Next"}
              <ArrowRight size={18} />
            </button>
          </footer>
        </div>
      )}
      {notesOpen && <aside className="exam-notepad" aria-label="Notepad">
        <header><strong>Notepad</strong><button aria-label="Close notepad" onClick={() => setNotesOpen(false)}><X size={17} /></button></header>
        <textarea aria-label="Scratch notes" placeholder="Scratch notes..." value={notes} onChange={(event) => setNotes(event.target.value)} />
      </aside>}
      <DesmosCalculator
        open={calculator}
        onClose={() => setCalculator(false)}
      />
      <ReferenceSheet open={reference} onClose={() => setReference(false)} />
    </div>
  );
}
