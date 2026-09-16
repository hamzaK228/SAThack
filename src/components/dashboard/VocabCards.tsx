"use client";

import { useState } from "react";
import { toggleSaveVocab, reviewVocab } from "@/app/dashboard/actions";
import { MASTERY_MAX } from "@/lib/vocab";

export type VocabWord = {
  id: string;
  word: string;
  definition: string;
  example_sentence: string | null;
  tags: string[];
};

type ProgressEntry = { mastery: number; times_seen: number };

const MASTERY_LABELS = ["New", "Seen it", "Learning", "Familiar", "Strong", "Mastered"];

function masteryLabel(level: number): string {
  return MASTERY_LABELS[Math.min(level, MASTERY_MAX)];
}

export default function VocabCards({
  words,
  savedIds,
  progress = {},
}: {
  words: VocabWord[];
  savedIds: string[];
  progress?: Record<string, ProgressEntry>;
}) {
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [order, setOrder] = useState<number[]>(() => words.map((_, i) => i));
  const [saved, setSaved] = useState<Set<string>>(() => new Set(savedIds));
  const [mastery, setMastery] = useState<Record<string, number>>(() =>
    Object.fromEntries(Object.entries(progress).map(([k, v]) => [k, v.mastery]))
  );
  const [reviewed, setReviewed] = useState(0);
  const [knownCount, setKnownCount] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  if (!words.length) {
    return (
      <div className="dash-empty">
        <p>No words found.</p>
      </div>
    );
  }

  const w = words[order[idx % order.length]];
  const isSaved = saved.has(w.id);
  const level = mastery[w.id] ?? 0;
  const sessionAcc = reviewed ? Math.round((knownCount / reviewed) * 100) : null;

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2200);
  }

  async function save() {
    const wasSaved = saved.has(w.id);
    setSaved((s) => {
      const n = new Set(s);
      if (wasSaved) n.delete(w.id);
      else n.add(w.id);
      return n;
    });
    flash(wasSaved ? "Removed from saved" : "★ Added to your saved list");
    const res = await toggleSaveVocab(w.id);
    if (!res.ok) {
      setSaved((s) => {
        const n = new Set(s);
        if (wasSaved) n.add(w.id);
        else n.delete(w.id);
        return n;
      });
      flash("Couldn't save — run the DB migration (migrations/2026-09-15-polish.sql)");
    }
  }

  function go(delta: number) {
    setFlipped(false);
    setIdx((i) => (i + delta + order.length) % order.length);
  }
  function shuffle() {
    setOrder((o) => [...o].sort(() => Math.random() - 0.5));
    setIdx(0);
    setFlipped(false);
  }

  /** Record "know it" / "review again" (spaced repetition) and move on. */
  async function answer(knowIt: boolean) {
    const prevLevel = level;
    const nextLevel = knowIt ? Math.min(level + 1, MASTERY_MAX) : 0;
    setMastery((m) => ({ ...m, [w.id]: nextLevel }));
    setReviewed((n) => n + 1);
    if (knowIt) setKnownCount((n) => n + 1);
    const res = await reviewVocab(w.id, knowIt);
    if (!res.ok) setMastery((m) => ({ ...m, [w.id]: prevLevel }));
    go(1);
  }

  return (
    <div className="vocab-shell">
      {notice && (
        <p className="vocab-notice" role="status">
          {notice}
        </p>
      )}

      <div className="vocab-progress">
        <span>
          Word <strong>{idx + 1}</strong> of {order.length}
        </span>
        {reviewed > 0 && (
          <span className="vocab-session">
            · reviewed <strong>{reviewed}</strong>
            {sessionAcc !== null ? ` · ${sessionAcc}% known` : ""}
          </span>
        )}
      </div>

      <button
        className={`vocab-card${flipped ? " flipped" : ""}`}
        onClick={() => setFlipped((f) => !f)}
        aria-label={flipped ? "Show the word" : "Show the definition"}
      >
        <div className="vocab-inner">
          <div className="vocab-face vocab-front">
            <span className="vocab-face-kicker">{level > 0 ? masteryLabel(level) : "SAT word"}</span>
            <span className="vocab-word">{w.word}</span>
            <span className="vocab-mastery">
              <span className="vocab-dots" aria-hidden="true">
                {Array.from({ length: MASTERY_MAX }).map((_, i) => (
                  <span key={i} className={`vocab-dot${i < level ? " on" : ""}`} />
                ))}
              </span>
              <span className="sr-only">
                Mastery {level} of {MASTERY_MAX}
              </span>
            </span>
            <span className="vocab-hint">tap to reveal definition</span>
          </div>

          <div className="vocab-face vocab-back">
            <span className="vocab-face-kicker">Definition</span>
            <span className="vocab-def">{w.definition}</span>
            {w.example_sentence && <span className="vocab-example">“{w.example_sentence}”</span>}
            {w.tags?.length > 0 && <span className="vocab-tags">{w.tags.join(" · ")}</span>}
          </div>
        </div>
      </button>

      <div className="vocab-controls">
        <button className="btn btn-ghost" onClick={() => go(-1)}>
          ←
        </button>
        <button
          className={`btn ${isSaved ? "btn-saved" : "btn-ghost"}`}
          onClick={save}
          aria-pressed={isSaved}
        >
          {isSaved ? "★ Saved" : "☆ Save"}
        </button>
        <button className="btn btn-ghost" onClick={shuffle}>
          ⇄ Shuffle
        </button>
        <button className="btn btn-ghost" onClick={() => go(1)}>
          →
        </button>
      </div>

      <div className="vocab-answer">
        <span className="vocab-answer-label">Do you know this word?</span>
        <button className="btn btn-again" onClick={() => answer(false)}>
          ↻ Review again
        </button>
        <button className="btn btn-know" onClick={() => answer(true)}>
          ✓ I know it
        </button>
      </div>
    </div>
  );
}

