"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, Folder, FolderPlus, Pencil, Trash2, X } from "lucide-react";
import { createVocabList, renameVocabList, deleteVocabList } from "@/app/dashboard/actions";

export type VocabListSummary = { id: string; name: string; count: number };

/**
 * The "My lists" manager — create, rename, delete and open the student's own
 * word lists. Rows update optimistically; the server actions revalidate the
 * page so counts stay honest after navigation.
 */
export default function VocabLists({ lists }: { lists: VocabListSummary[] }) {
  const [rows, setRows] = useState<VocabListSummary[]>(lists);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [notice, setNotice] = useState<{ text: string; bad: boolean } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  function create() {
    const value = name.trim();
    if (!value) return;
    setNotice(null);
    startTransition(async () => {
      const result = await createVocabList(value);
      if (!result.ok || !result.list) {
        return setNotice({ text: result.error ?? "Could not create the list.", bad: true });
      }
      const list = result.list;
      setRows((current) => [...current, { ...list, count: 0 }].sort((a, b) => a.name.localeCompare(b.name)));
      setName("");
      setNotice({ text: `List “${list.name}” created — open it and add words with ＋ List.`, bad: false });
    });
  }

  function startRename(list: VocabListSummary) {
    setConfirmId(null);
    setNotice(null);
    setEditingId(list.id);
    setEditName(list.name);
  }

  function saveRename(list: VocabListSummary) {
    const value = editName.trim();
    if (!value || value === list.name) {
      setEditingId(null);
      return;
    }
    setNotice(null);
    startTransition(async () => {
      const result = await renameVocabList(list.id, value);
      if (!result.ok) {
        return setNotice({ text: result.error ?? "Could not rename the list.", bad: true });
      }
      const renamed = result.name ?? value;
      setRows((current) =>
        current
          .map((row) => (row.id === list.id ? { ...row, name: renamed } : row))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      setEditingId(null);
    });
  }

  function remove(list: VocabListSummary) {
    setNotice(null);
    startTransition(async () => {
      const result = await deleteVocabList(list.id);
      if (!result.ok) {
        return setNotice({ text: result.error ?? "Could not delete the list.", bad: true });
      }
      setRows((current) => current.filter((row) => row.id !== list.id));
      setConfirmId(null);
      setNotice({ text: `List “${list.name}” deleted.`, bad: false });
    });
  }

  return (
    <section className="vocab-lists" aria-label="Your word lists">
      <form
        className="vocab-lists-new"
        onSubmit={(event) => {
          event.preventDefault();
          create();
        }}
      >
        <input
          className="field-input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="New list name — e.g. “Week 1 words”"
          maxLength={60}
          aria-label="New list name"
        />
        <button className="btn btn-primary" type="submit" disabled={pending || !name.trim()}>
          <FolderPlus size={15} /> Create list
        </button>
      </form>

      {notice && (
        <p className={`vocab-lists-notice${notice.bad ? " bad" : ""}`} role="status">
          {notice.text}
        </p>
      )}

      {rows.length === 0 ? (
        <div className="dash-empty">
          <p>
            No lists yet. Create one above, then tap <strong>＋ List</strong> on any flashcard to
            add words to it.
          </p>
        </div>
      ) : (
        <ul className="vocab-list-grid">
          {rows.map((list) => (
            <li className="vocab-list-card" key={list.id}>
              {editingId === list.id ? (
                <form
                  className="vocab-list-rename"
                  onSubmit={(event) => {
                    event.preventDefault();
                    saveRename(list);
                  }}
                >
                  <input
                    className="field-input"
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    maxLength={60}
                    autoFocus
                    aria-label={`Rename ${list.name}`}
                  />
                  <button className="btn btn-primary" type="submit" disabled={pending} aria-label="Save name">
                    <Check size={14} />
                  </button>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => setEditingId(null)}
                    aria-label="Cancel rename"
                  >
                    <X size={14} />
                  </button>
                </form>
              ) : (
                <>
                  <Link className="vocab-list-open" href={`/dashboard/vocab?view=lists&list=${list.id}`}>
                    <span className="vocab-list-name">
                      <Folder size={16} /> {list.name}
                    </span>
                    <span className="vocab-list-n">
                      {list.count} {list.count === 1 ? "word" : "words"}
                    </span>
                  </Link>
                  <div className="vocab-list-actions">
                    <Link className="btn btn-primary" href={`/dashboard/vocab?view=lists&list=${list.id}`}>
                      Study
                    </Link>
                    <button
                      className="btn btn-ghost"
                      onClick={() => startRename(list)}
                      aria-label={`Rename ${list.name}`}
                    >
                      <Pencil size={14} />
                    </button>
                    {confirmId === list.id ? (
                      <button
                        className="btn btn-ghost danger"
                        onClick={() => remove(list)}
                        disabled={pending}
                      >
                        <Trash2 size={14} /> Confirm delete
                      </button>
                    ) : (
                      <button
                        className="btn btn-ghost"
                        onClick={() => {
                          setEditingId(null);
                          setConfirmId(list.id);
                        }}
                        aria-label={`Delete ${list.name}`}
                      >
                        <Trash2 size={14} />
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
