"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { toggleSaveVocab, reviewVocab, createVocabList, toggleWordInList } from "@/app/dashboard/actions";
import { MASTERY_MAX, clozeSentence, decodeEntities } from "@/lib/vocab";
import { markStatsDirty } from "@/lib/stats-dirty";

export type VocabWord = {
  id: string;
  word: string;
  definition: string;
  example_sentence: string | null;
  context_sentence: string | null;
  tags: string[];
};

type ProgressEntry = { mastery: number; times_seen: number };
type ListOption = { id: string; name: string };

const MASTERY_LABELS = ["New", "Seen it", "Learning", "Familiar", "Strong", "Mastered"];

function masteryLabel(level: number): string {
  return MASTERY_LABELS[Math.min(level, MASTERY_MAX)];
}

export default function VocabCards({
  words,
  savedIds,
  progress = {},
  lists = [],
  memberships = {},
}: {
  words: VocabWord[];
  savedIds: string[];
  progress?: Record<string, ProgressEntry>;
  lists?: ListOption[];
  memberships?: Record<string, string[]>;
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
  // Typing the word from its definition is the strongest recall test here:
  // recognising a definition is easy, producing the word is the real skill.
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");
  const [typedState, setTypedState] = useState<"right" | "wrong" | null>(null);

  // Custom lists — the picker's list set and this session's membership state
  // both update optimistically; the server is the source of truth on reload.
  const [listsState, setListsState] = useState<ListOption[]>(lists);
  const [members, setMembers] = useState<Record<string, string[]>>(memberships);
  const [listPanelOpen, setListPanelOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [listBusy, setListBusy] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

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
  const context = w.context_sentence ? decodeEntities(w.context_sentence) : null;
  const cloze = clozeSentence(context, w.word);
  const sessionAcc = reviewed ? Math.round((knownCount / reviewed) * 100) : null;
  const memberListIds = members[w.id] ?? [];
  const memberNames = memberListIds
    .map((id) => listsState.find((list) => list.id === id)?.name)
    .filter(Boolean);

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
    setListPanelOpen(false);
    setIdx((i) => (i + delta + order.length) % order.length);
  }
  function shuffle() {
    setOrder((o) => [...o].sort(() => Math.random() - 0.5));
    setIdx(0);
    setFlipped(false);
    setListPanelOpen(false);
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
    else markStatsDirty();
    go(1);
  }

  /** Free pronunciation: the browser's own speech synthesis, no audio files. */
  function speak() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const utterance = new SpeechSynthesisUtterance(w.word);
    utterance.lang = "en-US";
    utterance.rate = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  /** Grade a typed answer, show the verdict for a beat, then record it — typing
      the word from its definition is exactly the recall this app should test. */
  function checkTyped() {
    const guess = typed.trim().toLowerCase();
    if (!guess) return;
    const right = guess === w.word.trim().toLowerCase();
    setTypedState(right ? "right" : "wrong");
    window.setTimeout(
      () => {
        setTyping(false);
        setTyped("");
        setTypedState(null);
        void answer(right);
      },
      right ? 500 : 1400
    );
  }

  /** Check/uncheck this word in one list, with an optimistic flip. */
  async function toggleInList(list: ListOption) {    const inList = (members[w.id] ?? []).includes(list.id);
    const flip = (on: boolean) =>
      setMembers((m) => {
        const current = m[w.id] ?? [];
        return {
          ...m,
          [w.id]: on ? [...current, list.id] : current.filter((id) => id !== list.id),
        };
      });

    flip(!inList);
    flash(inList ? `Removed from “${list.name}”` : `✓ Added to “${list.name}”`);
    const res = await toggleWordInList(w.id, list.id);
    if (!res.ok) {
      flip(inList);
      flash("Couldn't update the list.");
    }
  }

  /** Create a list from the picker and drop the current word straight in. */
  async function createAndAdd() {
    const name = newListName.trim();
    if (!name) return;
    setListBusy(true);
    setListError(null);
    const res = await createVocabList(name);
    if (!res.ok || !res.list) {
      setListBusy(false);
      setListError(res.error ?? "Could not create the list.");
      return;
    }
    const list = res.list;
    setListsState((ls) => [...ls, list].sort((a, b) => a.name.localeCompare(b.name)));
    setNewListName("");
    const added = await toggleWordInList(w.id, list.id);
    setListBusy(false);
    if (added.ok) {
      setMembers((m) => ({ ...m, [w.id]: [...(m[w.id] ?? []), list.id] }));
      flash(`✓ List “${list.name}” created and word added`);
    } else {
      setListError("List created — but the word wasn't added. Try tapping it in the list above.");
    }
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
            {cloze ? (
              <>
                <span className="vocab-cloze">{cloze}</span>
                <span className="vocab-cloze-hint">Which word fits? Tap to find out</span>
              </>
            ) : (
              <>
                <span className="vocab-word">{w.word}</span>
                <span className="vocab-hint">tap to reveal definition</span>
              </>
            )}
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
          </div>

          <div className="vocab-face vocab-back">
            <span className="vocab-face-kicker">Definition</span>
            {cloze && <span className="vocab-cloze-word">{w.word}</span>}
            <span className="vocab-def">{w.definition}</span>
            {context && <span className="vocab-context">From a real SAT text: “{context}”</span>}
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
        <button
          className={`btn ${memberListIds.length ? "btn-saved" : "btn-ghost"}`}
          onClick={() => {
            setListPanelOpen((open) => !open);
            setListError(null);
          }}
          aria-expanded={listPanelOpen}
          aria-pressed={memberListIds.length > 0}
        >
          {memberListIds.length
            ? `✓ ${memberListIds.length} list${memberListIds.length === 1 ? "" : "s"}`
            : "＋ List"}
        </button>
        <button className="btn btn-ghost vocab-say" onClick={speak} title="Hear the word" aria-label="Hear the word">
          🔊
        </button>
        <button className="btn btn-ghost" onClick={shuffle}>
          ⇄ Shuffle
        </button>
        <button className="btn btn-ghost" onClick={() => go(1)}>
          →
        </button>
      </div>

      {listPanelOpen && (
        <div className="vocab-list-panel">
          <div className="vocab-list-panel-head">
            <strong>Add “{w.word}” to a list</strong>
            <button
              className="vocab-list-panel-close"
              onClick={() => setListPanelOpen(false)}
              aria-label="Close list picker"
            >
              <X size={15} />
            </button>
          </div>
          {memberNames.length > 0 && <p className="vocab-list-panel-in">In: {memberNames.join(" · ")}</p>}
          <div className="vocab-list-panel-options" role="group" aria-label="Your lists">
            {listsState.map((list) => {
              const inList = memberListIds.includes(list.id);
              return (
                <button
                  key={list.id}
                  type="button"
                  className={`vocab-list-option${inList ? " on" : ""}`}
                  onClick={() => toggleInList(list)}
                  aria-pressed={inList}
                >
                  <span className="vocab-list-check" aria-hidden="true">
                    {inList && <Check size={13} />}
                  </span>
                  {list.name}
                </button>
              );
            })}
          </div>
          {listsState.length === 0 && (
            <p className="vocab-list-panel-hint">No lists yet — create your first one below.</p>
          )}
          <form
            className="vocab-list-panel-new"
            onSubmit={(event) => {
              event.preventDefault();
              createAndAdd();
            }}
          >
            <input
              className="field-input"
              value={newListName}
              onChange={(event) => setNewListName(event.target.value)}
              placeholder="New list name…"
              maxLength={60}
            />
            <button className="btn btn-primary" type="submit" disabled={listBusy || !newListName.trim()}>
              Create + add
            </button>
          </form>
          {listError && (
            <p className="vocab-list-panel-error" role="status">
              {listError}
            </p>
          )}
        </div>
      )}

      {typing ? (
        <form
          className="vocab-answer vocab-typing"
          onSubmit={(event) => {
            event.preventDefault();
            checkTyped();
          }}
        >
          <label className="vocab-answer-label" htmlFor="vocab-typing">
            Type the word
          </label>
          <input
            id="vocab-typing"
            className="field-input"
            value={typed}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            placeholder="Type what you remember…"
            onChange={(event) => setTyped(event.target.value)}
          />
          <button className="btn btn-know" type="submit" disabled={!typed.trim() || typedState !== null}>
            Check
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => {
              setTyping(false);
              setTyped("");
              setTypedState(null);
            }}
          >
            Back
          </button>
          {typedState && (
            <p className={`vocab-typed ${typedState}`} role="status">
              {typedState === "right"
                ? "✓ Correct — that counts as known"
                : `✗ It was “${w.word}” — it will come back sooner`}
            </p>
          )}
        </form>
      ) : (
        <div className="vocab-answer">
          <span className="vocab-answer-label">Do you know this word?</span>
          <button className="btn btn-again" onClick={() => answer(false)}>
            ↻ Review again
          </button>
          <button className="btn btn-know" onClick={() => answer(true)}>
            ✓ I know it
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => {
              setFlipped(true);
              setTyping(true);
            }}
          >
            ⌨ Type it
          </button>
        </div>
      )}
    </div>
  );
}

