"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import {
  createVocabWord,
  deleteCustomVocabWord,
  draftVocabSuggestion,
  removeWordFromList,
  updateCustomVocabWord,
} from "@/app/dashboard/actions";

export type CustomVocabWord = {
  id: string;
  word: string;
  definition: string;
  example_sentence: string | null;
  tags: string[];
};

type Draft = { word: string; definition: string; example: string; tags: string };
const EMPTY: Draft = { word: "", definition: "", example: "", tags: "" };

export default function CustomWordManager({
  listId,
  words,
  defaultOpen = false,
}: {
  listId: string;
  words: CustomVocabWord[];
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen || words.length === 0);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<Draft>(EMPTY);
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function refresh(message: string) {
    setNotice(message);
    setError("");
    startTransition(() => router.refresh());
  }

  /** Same drafting helper as “Suggest a word”, but the result lands in this list. */
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
    refresh(
      result.existing
        ? "That word is already in the vocabulary bank — added it to this list."
        : "Personal word added. It is now in this list."
    );
  }

  function startEdit(word: CustomVocabWord) {
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

  async function removeFromList(wordId: string) {
    setBusy(true);
    const result = await removeWordFromList(wordId, listId);
    setBusy(false);
    setRemoveConfirm(null);
    if (!result.ok) return setError(result.error ?? "Could not remove the word from this list.");
    refresh("Removed from this list. The personal word is still saved.");
  }

  async function destroy(wordId: string) {
    setBusy(true);
    const result = await deleteCustomVocabWord(wordId);
    setBusy(false);
    setDeleteConfirm(null);
    setEditingId(null);
    if (!result.ok) return setError(result.error ?? "Could not delete this word.");
    refresh("Personal word deleted.");
  }

  return (
    <section className="vocab-custom" aria-label="Personal words in this list">
      <div className="vocab-custom-head">
        <div>
          <strong>Your words</strong>
          <span className="vocab-custom-sub">
            {words.length ? `${words.length} personal ${words.length === 1 ? "word" : "words"}` : "Add anything not in the bank"}
          </span>
        </div>
        <button
          className={`btn ${open ? "btn-ghost" : "btn-primary"}`}
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
            {words.length > 0 && (
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

      {words.length === 0 ? (
        <p className="vocab-custom-empty">
          No personal words in this list yet. Add one above — it does not have to be in the curated bank.
        </p>
      ) : (
        <ul className="vocab-custom-list">
          {words.map((word) => (
            <li key={word.id} className="vocab-custom-item">
              {editingId === word.id ? (
                <form
                  className="vocab-custom-edit"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveEdit(word.id);
                  }}
                >
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
                  <div className="vocab-custom-body">
                    <strong className="vocab-custom-word">{word.word}</strong>
                    <span className="vocab-custom-def">{word.definition}</span>
                    {word.example_sentence && (
                      <span className="vocab-custom-example">“{word.example_sentence}”</span>
                    )}
                    {word.tags?.length > 0 && <span className="vocab-custom-tags">{word.tags.join(" · ")}</span>}
                  </div>
                  <div className="vocab-custom-actions">
                    <button className="btn btn-ghost" type="button" onClick={() => startEdit(word)} disabled={busy}>
                      <Pencil size={14} /> Edit
                    </button>
                    {removeConfirm === word.id ? (
                      <button
                        className="btn btn-ghost danger"
                        type="button"
                        onClick={() => void removeFromList(word.id)}
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
