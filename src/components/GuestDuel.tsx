"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { LockKeyhole, Swords } from "lucide-react";
import QuestionText from "@/components/QuestionText";
import { checkGuestAnswer } from "@/app/duel/actions";
import type { DuelMode, DuelSubject } from "@/app/dashboard/duel/actions";

export type GuestDuelQuestion = {
  id: string;
  section: string;
  domain: string;
  skill: string | null;
  difficulty: string;
  is_grid_in: boolean;
  question_text: string;
  question_text_html: string | null;
  passage: string | null;
  passage_html: string | null;
  choices: { label: string; text: string; html?: string | null }[] | null;
};

type Phase = "setup" | "playing" | "sudden" | "done";

const subscribeToGuestTrial = () => () => {};

function useGuestTrialUsed() {
  return useSyncExternalStore(
    subscribeToGuestTrial,
    () => window.localStorage.getItem("sathack-guest-duel:v1") === "1",
    () => false,
  );
}

function clock(seconds: number) {
  return `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.max(0, seconds) % 60).padStart(2, "0")}`;
}

export default function GuestDuel({ questions }: { questions: Record<DuelSubject, GuestDuelQuestion[]> }) {
  const [phase, setPhase] = useState<Phase>("setup");
  const [mode, setMode] = useState<DuelMode>("rush");
  const [subject, setSubject] = useState<DuelSubject>("math");
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState("");
  const [myScore, setMyScore] = useState(0);
  const [rivalScore, setRivalScore] = useState(0);
  const [rivalFlash, setRivalFlash] = useState<{ n: number; correct: boolean } | null>(null);
  const rivalQRef = useRef(0);
  const [seconds, setSeconds] = useState(300);
  const [won, setWon] = useState(false);
  const [locking, setLocking] = useState(false);
  const guestTrialUsed = useGuestTrialUsed();

  const list = questions[subject];
  const question = list[index % Math.max(1, list.length)];

  useEffect(() => {
    if (phase !== "playing") return;
    const timer = window.setInterval(() => setSeconds((value) => value - 1), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  // The rival works through its own question list at a steady pace — visible in
  // the scoreboard as a "Rival answered" flash — instead of silently banking
  // points on a timer before the guest has answered anything.
  useEffect(() => {
    if (phase !== "playing" && phase !== "sudden") return;
    const rival = window.setInterval(() => {
      const n = ++rivalQRef.current;
      if (mode === "quick") {
        finish(false);
        return;
      }
      const correct = Math.random() < 0.68;
      setRivalFlash({ n, correct });
      if (correct) {
        setRivalScore((score) => score + 1);
        if (phase === "sudden") {
          finish(false);
          return;
        }
      }
    }, mode === "quick" ? 36000 : 18000);
    return () => window.clearInterval(rival);
  }, [phase, mode]);

  useEffect(() => {
    if (!rivalFlash) return;
    const clear = window.setTimeout(() => setRivalFlash(null), 1900);
    return () => window.clearTimeout(clear);
  }, [rivalFlash]);

  useEffect(() => {
    if (phase !== "playing" || seconds > 0) return;
    const completion = window.setTimeout(() => {
      if (myScore === rivalScore) setPhase("sudden");
      else finish(myScore > rivalScore);
    }, 0);
    return () => window.clearTimeout(completion);
  }, [seconds, phase, myScore, rivalScore]);

  const canStart = list.length > 0;

  function start() {
    if (!canStart) return;
    setSeconds(mode === "quick" ? 180 : 300);
    setIndex(0);
    setMyScore(0);
    setRivalScore(0);
    rivalQRef.current = 0;
    setRivalFlash(null);
    setSelected("");
    setPhase("playing");
  }

  function finish(didWin: boolean) {
    setWon(didWin);
    setPhase("done");
    window.localStorage.setItem("sathack-guest-duel:v1", "1");
  }

  async function submit() {
    if (!question || !selected.trim() || locking) return;
    setLocking(true);
    try {
      // Graded on the server — the browser never sees the answer key.
      const correct = await checkGuestAnswer(question.id, selected);
      if (correct) {
        setMyScore((score) => score + 1);
        if (mode === "quick" || phase === "sudden") {
          finish(true);
          return;
        }
      }
      setIndex((value) => value + 1);
      setSelected("");
    } catch {
      // Network hiccup: leave the current question up so the guest can retry.
    } finally {
      setLocking(false);
    }
  }

  if (phase === "setup" && guestTrialUsed) {
    return <section className="trial-locked"><LockKeyhole size={36} /><span>FREE DUEL COMPLETE</span><h1>Keep your rating going</h1><p>Your guest match has been used. Create a free account to play ranked opponents and private friend rooms.</p><Link className="duel-primary" href="/auth">Create free account</Link></section>;
  }

  if (phase === "setup") {
    return (
      <section className="trial-setup duel-page">
        <span className="duel-kicker"><Swords size={14} /> ONE FREE GUEST MATCH</span>
        <h1>Try a live SAT duel</h1>
        <p>Play against a practice rival. Your full account unlocks real players, rating, and friend rooms.</p>
        <div className="trial-options">
          <div><span>MODE</span><button className={mode === "quick" ? "active" : ""} onClick={() => setMode("quick")}>⚡ Quick · 3 min</button><button className={mode === "rush" ? "active" : ""} onClick={() => setMode("rush")}>🔥 Rush · 5 min</button></div>
          <div><span>SUBJECT</span><button className={subject === "math" ? "active" : ""} onClick={() => setSubject("math")}>Math</button><button className={subject === "reading_writing" ? "active" : ""} onClick={() => setSubject("reading_writing")}>Reading &amp; Writing</button></div>
        </div>
        <button className="duel-primary trial-start" disabled={!canStart} onClick={start}>{canStart ? "Start guest duel" : "Trial questions unavailable"}</button>
        <small>No rating change in the guest trial.</small>
      </section>
    );
  }

  if (phase === "done") {
    return <section className="trial-locked"><span>MATCH COMPLETE</span><h1>{won ? "You won the trial" : "Your rival won this one"}</h1><div className="trial-final"><strong>{myScore}</strong><b>—</b><strong>{rivalScore}</strong></div><p>Sign in to face real opponents near your rating or challenge a friend with a room code.</p><Link className="duel-primary" href="/auth">Sign in to keep playing</Link></section>;
  }

  if (!question) return null;
  return (
    <section className="trial-game duel-page">
      <header className="duel-match-head"><div className="duel-live"><i /> GUEST TRIAL</div><div className="duel-clock"><small>{phase === "sudden" ? "SUDDEN DEATH" : "TIME LEFT"}</small><strong>{phase === "sudden" ? "∞" : clock(seconds)}</strong></div><div className="duel-match-meta">Practice rival</div></header>
      <div className="duel-scoreboard"><div className="duel-player me"><div className="duel-avatar">Y</div><span><strong>You</strong><small>Guest · Q{index + 1}</small></span><b>{myScore}</b></div><div className="duel-versus"><span>VS</span><i /></div><div className="duel-player opponent"><b>{rivalScore}</b><span><strong>Practice rival</strong>{rivalFlash ? <small key={`${rivalFlash.n}-${rivalFlash.correct}`} className={`duel-rival-flash${rivalFlash.correct ? " hit" : " miss"}`}>Rival answered Q{rivalFlash.n} · {rivalFlash.correct ? "✓" : "✗"}</small> : <small>Balanced bot</small>}</span><div className="duel-avatar">R</div></div></div>
      <article className="duel-question-card">
        <div className="duel-question-meta"><span>QUESTION {index + 1}</span><i>{question.difficulty}</i><i>{question.domain}</i></div>
        {(question.passage || question.passage_html) && <div className="duel-passage"><QuestionText html={question.passage_html} text={question.passage ?? ""} /></div>}
        <div className="duel-question-text"><QuestionText html={question.question_text_html} text={question.question_text} /></div>
        {question.is_grid_in ? <input className="duel-grid-answer" value={selected} autoFocus inputMode="decimal" placeholder="Type your answer" onChange={(event) => setSelected(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void submit(); }} /> : <div className="duel-choices">{(question.choices ?? []).map((choice) => <button key={choice.label} className={selected === choice.label ? "selected" : ""} onClick={() => setSelected(choice.label)}><span>{choice.label}</span><QuestionText html={choice.html} text={choice.text} /></button>)}</div>}
        <button className="duel-submit" disabled={!selected.trim() || locking} onClick={() => void submit()}>{locking ? "Checking…" : "Lock answer"}</button>
      </article>
    </section>
  );
}
