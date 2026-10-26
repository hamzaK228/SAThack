"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import type { VocabWord } from "@/components/dashboard/VocabCards";
import {
  createVocabWord,
  deleteCustomVocabWord,
  draftVocabSuggestion,
  removeWordFromList,
  updateCustomVocabWord,
} from "@/app/dashboard/actions";

type Draft = { word: string; definition: string; example: string; tags: string };
const EMPTY: Draft = { word: "", definition: "", example: "", tags: "" };

/**
 * One place to manage a folder: add a personal word (manually or with the same
 * AI drafting used by "Suggest a word"), edit/remove/delete it, and see every
 * word already in the list. Study mode is a separate, distraction-free deck.
 */
export default function ListWordsManager({
  listId,
  words,
  total,
  q,
  defaultOpen = false,
  studyHref,
}: {
  listId: string;
  words: VocabWord[];
  total: number;
  q: string;
  defaultOpen?: boolean;
  studyHref: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen || total === 0);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<Draft>(EMPTY);
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const [pending, startTransition] = useTransition();

  const visible = words.filter((word) => !removed.has(word.id));

  function refresh(message: string) {
    setNotice(message);
    setError("");
    startTransition(() => router.refresh());
  }

  function startEdit(word: VocabWord) {
    setEditingId(word.id);
    setEdit({
      word: word.word,
      definition: word.definition,
      example: word.example_sentence ?? "",
      tags: (word.tags ?? []).join(", "),
    });
    setError("");
    setNotice("");
    setDeleteConfirm(null);
  }

  async function draftWithAi() {
    setError("");
    setNotice("");
    if (draft.word.trim().length < 2) return setError("Enter a word first.");
    setAiBusy(true);
    const result = await draftVocabSuggestion(draft.word);
    setAiBusy(false);
    if (!result.ok || !result.draft) {
      return setError(result.error ?? "AI could not draft this entry. Write it yourself.");
    }
    setDraft((current) => ({
      ...current,
      definition: result.draft!.definition.slice(0, 500),
      example: result.draft!.example.slice(0, 500),
      tags: result.draft!.tags,
    }));
    setNotice("AI draft ready — review and edit it before adding.");
  }

  async function add() {
    setError("");
    setNotice("");
    if (!draft.word.trim()) return setError("Add the word.");
    if (!draft.definition.trim()) return setError("Add a short definition.");
    setBusy(true);
    const result = await createVocabWord({
      list_id: listId,
      word: draft.word,
      definition: draft.definition,
      example: draft.example,
      tags: draft.tags,
    });
    setBusy(false);
    if (!result.ok) return setError(result.error ?? "Could not add this word.");
    setDraft(EMPTY);
    setOpen(false);
    setRemoved(new Set());
    refresh(
      result.existing
        ? "That word is already in the vocabulary bank — added it to this list."
        : "Personal word added. It is now in this list."
    );
  }

  async function saveEdit(wordId: string) {
    setError("");
    setNotice("");
    if (!edit.word.trim()) return setError("Add the word.");
    if (!edit.definition.trim()) return setError("Add a short definition.");
    setBusy(true);
    const result = await updateCustomVocabWord({
      word_id: wordId,
      word: edit.word,
      definition: edit.definition,
      example: edit.example,
      tags: edit.tags,
    });
    setBusy(false);
    if (!result.ok) return setError(result.error ?? "Could not update this word.");
    setEditingId(null);
    refresh("Word updated.");
  }

  async function remove(wordId: string) {
    setBusy(true);
    const result = await removeWordFromList(wordId, listId);
    setBusy(false);
    setRemoveConfirm(null);
    if (!result.ok) return setError(result.error ?? "Could not remove the word from this list.");
    setRemoved((current) => new Set(current).add(wordId));
    refresh("Removed from this list.");
  }

  async function destroy(wordId: string) {
    setBusy(true);
    const result = await deleteCustomVocabWord(wordId);
    setBusy(false);
    setDeleteConfirm(null);
    setEditingId(null);
    if (!result.ok) return setError(result.error ?? "Could not delete this word.");
    setRemoved((current) => new Set(current).add(wordId));
    refresh("Personal word deleted.");
  }

  return (
    <section className="vocab-manage" aria-label="Manage words in this list">
      <div className="vocab-manage-head">
        <div>
          <strong>{q ? "Matching words" : "Words in this list"}</strong>
          <span className="vocab-manage-sub">
            {total} {total === 1 ? "word" : "words"}
            {q ? " match your search" : ""}
          </span>
        </div>
        <div className="vocab-manage-head-actions">
          {total > 0 ? (
            <Link className="btn btn-primary" href={studyHref}>
              Study
            </Link>
          ) : (
            <span className="btn btn-ghost disabled" aria-disabled="true">
              Study
            </span>
          )}
          <button
            className={`btn ${open ? "btn-ghost" : "btn-ghost"}`}
            type="button"
            onClick={() => {
              setOpen((value) => !value);
              setError("");
            }}
            aria-expanded={open}
          >
            {open ? <X size={14} /> : <Plus size={14} />}
            {open ? "Close" : "Add word"}
          </button>
        </div>
      </div>

      {open && (
        <form
          className="vocab-custom-form"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <div className="vocab-custom-form-row">
            <label className="vocab-custom-field">
              Word
              <input
                className="field-input"
                value={draft.word}
                onChange={(event) => setDraft((current) => ({ ...current, word: event.target.value }))}
                maxLength={60}
                placeholder="e.g. petrichor"
                autoFocus
              />
            </label>
            <label className="vocab-custom-field">
              Meaning
              <input
                className="field-input"
                value={draft.definition}
                onChange={(event) => setDraft((current) => ({ ...current, definition: event.target.value }))}
                maxLength={500}
                placeholder="The smell of earth after rain"
              />
            </label>
          </div>
          <label className="vocab-custom-field">
            Example sentence <span className="vocab-custom-optional">optional</span>
            <input
              className="field-input"
              value={draft.example}
              onChange={(event) => setDraft((current) => ({ ...current, example: event.target.value }))}
              maxLength={500}
              placeholder="The petrichor after the storm felt like a fresh start."
            />
          </label>
          <label className="vocab-custom-field">
            Tags <span className="vocab-custom-optional">comma separated, optional</span>
            <input
              className="field-input"
              value={draft.tags}
              onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value }))}
              maxLength={180}
              placeholder="literature, mood"
            />
          </label>
          <div className="vocab-custom-ai">
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => void draftWithAi()}
              disabled={aiBusy || busy || draft.word.trim().length < 2}
            >
              <Sparkles size={14} /> {aiBusy ? "Drafting…" : "Draft with AI"}
            </button>
            <span>Uses the same SAT dictionary helper as “Suggest a word” — review the result.</span>
          </div>
          <div className="vocab-custom-form-actions">
            <button className="btn btn-primary" type="submit" disabled={busy || aiBusy}>
              <Plus size={14} /> {busy ? "Adding…" : "Add word"}
            </button>
            {total > 0 && (
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => {
                  setOpen(false);
                  setError("");
                }}
                disabled={busy}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      {error && <p className="vocab-custom-error" role="alert">{error}</p>}
      {notice && <p className="vocab-custom-notice" role="status">{notice}</p>}

      {visible.length === 0 ? (
        <p className="vocab-custom-empty">
          {q
            ? `No words in this list match “${q}”.`
            : "This list is empty. Add your first word above."}
        </p>
      ) : (
        <ul className="vocab-manage-list">
          {visible.map((word) => (
            <li key={word.id} className="vocab-manage-row">
              {editingId === word.id ? (
                <form
                  className="vocab-custom-edit"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveEdit(word.id);
                  }}
                >
                  <div className="vocab-custom-form-row">
                    <label className="vocab-custom-field">
                      Word
                      <input
                        className="field-input"
                        value={edit.word}
                        onChange={(event) => setEdit((current) => ({ ...current, word: event.target.value }))}
                        maxLength={60}
                        autoFocus
                      />
                    </label>
                    <label className="vocab-custom-field">
                      Meaning
                      <input
                        className="field-input"
                        value={edit.definition}
                        onChange={(event) => setEdit((current) => ({ ...current, definition: event.target.value }))}
                        maxLength={500}
                      />
                    </label>
                  </div>
                  <label className="vocab-custom-field">
                    Example
                    <input
                      className="field-input"
                      value={edit.example}
                      onChange={(event) => setEdit((current) => ({ ...current, example: event.target.value }))}
                      maxLength={500}
                    />
                  </label>
                  <label className="vocab-custom-field">
                    Tags
                    <input
                      className="field-input"
                      value={edit.tags}
                      onChange={(event) => setEdit((current) => ({ ...current, tags: event.target.value }))}
                      maxLength={180}
                    />
                  </label>
                  <div className="vocab-custom-actions">
                    <button className="btn btn-primary" type="submit" disabled={busy || pending}>
                      <Check size={14} /> Save
                    </button>
                    <button
                      className="btn btn-ghost"
                      type="button"
                      onClick={() => setEditingId(null)}
                      disabled={busy}
                    >
                      <X size={14} /> Cancel
                    </button>
                    {deleteConfirm === word.id ? (
                      <button
                        className="btn btn-ghost danger"
                        type="button"
                        onClick={() => void destroy(word.id)}
                        disabled={busy}
                      >
                        <Trash2 size={14} /> Delete permanently
                      </button>
                    ) : (
                      <button
                        className="btn btn-ghost danger"
                        type="button"
                        onClick={() => setDeleteConfirm(word.id)}
                        disabled={busy}
                      >
                        <Trash2 size={14} /> Delete word
                      </button>
                    )}
                  </div>
                </form>
              ) : (
                <>
                  <div className="vocab-manage-copy">
                    <div className="vocab-manage-wordline">
                      <strong>{word.word}</strong>
                      {word.owner_id && <span className="vocab-custom-badge">My word</span>}
                    </div>
                    <span className="vocab-manage-def">{word.definition}</span>
                    {word.tags?.length > 0 && (
                      <span className="vocab-custom-tags">{word.tags.join(" · ")}</span>
                    )}
                  </div>
                  <div className="vocab-manage-actions">
                    {word.owner_id && (
                      <button className="btn btn-ghost" type="button" onClick={() => startEdit(word)} disabled={busy}>
                        <Pencil size={14} /> Edit
                      </button>
                    )}
                    {removeConfirm === word.id ? (
                      <button
                        className="btn btn-ghost danger"
                        type="button"
                        onClick={() => void remove(word.id)}
                        disabled={busy}
                      >
                        <Trash2 size={14} /> Remove from list
                      </button>
                    ) : (
                      <button
                        className="btn btn-ghost"
                        type="button"
                        onClick={() => setRemoveConfirm(word.id)}
                        disabled={busy}
                      >
                        <X size={14} /> Remove
                      </button>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
