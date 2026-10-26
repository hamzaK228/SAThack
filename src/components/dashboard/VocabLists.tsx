"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, FolderPlus, Pencil, Plus, Trash2, X } from "lucide-react";
import { createVocabList, updateVocabList, deleteVocabList } from "@/app/dashboard/actions";

export type VocabListSummary = {
  id: string;
  name: string;
  description: string;
  emoji: string;
  color: string;
  count: number;
};

const EMOJIS = ["📁", "📚", "🧠", "🎯", "🔥", "🌱", "🧪", "🗂️", "💡", "⭐"];
const COLORS = [
  { key: "lime", label: "Lime" },
  { key: "sky", label: "Sky" },
  { key: "rose", label: "Rose" },
  { key: "amber", label: "Amber" },
  { key: "violet", label: "Violet" },
  { key: "teal", label: "Teal" },
];
const EMPTY_EDIT = { name: "", description: "", emoji: "📁", color: "lime" };

/**
 * The "My lists" manager — create a list, customize its preview card
 * (name, note, icon, accent colour), add personal words, or delete it.
 * Rows update optimistically; server actions revalidate the page.
 */
export default function VocabLists({ lists }: { lists: VocabListSummary[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<VocabListSummary[]>(lists);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("📁");
  const [color, setColor] = useState("lime");
  const [notice, setNotice] = useState<{ text: string; bad: boolean } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState(EMPTY_EDIT);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  function create() {
    const value = name.trim();
    if (!value) return;
    setNotice(null);
    startTransition(async () => {
      const result = await createVocabList(value, { emoji, color });
      if (!result.ok || !result.list) {
        return setNotice({ text: result.error ?? "Could not create the list.", bad: true });
      }
      const list = result.list;
      setRows((current) =>
        [...current, { ...list, count: 0 }].sort((a, b) => a.name.localeCompare(b.name))
      );
      setName("");
      setNotice({ text: `List “${list.name}” created — open it to add your own words.`, bad: false });
    });
  }

  function startEdit(list: VocabListSummary) {
    setConfirmId(null);
    setNotice(null);
    setEditingId(list.id);
    setEdit({
      name: list.name,
      description: list.description ?? "",
      emoji: list.emoji || "📁",
      color: list.color || "lime",
    });
  }

  function saveEdit(list: VocabListSummary) {
    const value = edit.name.trim();
    if (!value) return setNotice({ text: "Give your list a name.", bad: true });
    setNotice(null);
    startTransition(async () => {
      const result = await updateVocabList(list.id, edit);
      if (!result.ok || !result.list) {
        return setNotice({ text: result.error ?? "Could not update the preview.", bad: true });
      }
      const next = result.list;
      setRows((current) =>
        current
          .map((row) => (row.id === list.id ? { ...row, ...next } : row))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      setEditingId(null);
      setNotice({ text: "Preview updated.", bad: false });
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
        <select
          className="vocab-list-emoji-select"
          value={emoji}
          onChange={(event) => setEmoji(event.target.value)}
          aria-label="List icon"
        >
          {EMOJIS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <div className="vocab-color-picker" role="group" aria-label="Preview colour">
          {COLORS.map((option) => (
            <button
              key={option.key}
              type="button"
              className={`vocab-color-dot color-${option.key}${color === option.key ? " on" : ""}`}
              onClick={() => setColor(option.key)}
              aria-label={option.label}
              aria-pressed={color === option.key}
              title={option.label}
            />
          ))}
        </div>
        <button className="btn btn-primary" type="submit" disabled={pending || !name.trim()}>
          <FolderPlus size={15} /> Create
        </button>
      </form>

      {notice && (
        <p className={`vocab-lists-notice${notice.bad ? " bad" : ""}`} role="status">
          {notice.text}
        </p>
      )}

      {rows.length === 0 ? (
        <div className="dash-empty">
          <p>No lists yet. Create one above, then add words that are not in the general bank.</p>
        </div>
      ) : (
        <ul className="vocab-list-grid">
          {rows.map((list) => (
            <li
              className={`vocab-list-card vocab-list-color-${list.color}`}
              key={list.id}
              onClick={(event) => {
                // The whole preview card opens the folder; controls keep their
                // own behaviour. Tapping the padding used to do nothing.
                const target = event.target as HTMLElement;
                if (target.closest("a,button,input,select,textarea,label")) return;
                router.push(`/dashboard/vocab?view=lists&list=${list.id}`);
              }}
            >
              {editingId === list.id ? (
                <form
                  className="vocab-list-editor"
                  onSubmit={(event) => {
                    event.preventDefault();
                    saveEdit(list);
                  }}
                >
                  <label className="vocab-list-editor-label">
                    Name
                    <input
                      className="field-input"
                      value={edit.name}
                      onChange={(event) => setEdit((current) => ({ ...current, name: event.target.value }))}
                      maxLength={60}
                      autoFocus
                    />
                  </label>
                  <label className="vocab-list-editor-label">
                    Note <span className="vocab-list-editor-count">{edit.description.length}/160</span>
                    <input
                      className="field-input"
                      value={edit.description}
                      onChange={(event) =>
                        setEdit((current) => ({ ...current, description: event.target.value.slice(0, 160) }))
                      }
                      maxLength={160}
                      placeholder="What is this list for?"
                    />
                  </label>
                  <div className="vocab-list-editor-row" role="group" aria-label="List icon">
                    {EMOJIS.map((option) => (
                      <button
                        key={option}
                        type="button"
                        className={`vocab-emoji-btn${edit.emoji === option ? " on" : ""}`}
                        onClick={() => setEdit((current) => ({ ...current, emoji: option }))}
                        aria-pressed={edit.emoji === option}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                  <div className="vocab-list-editor-row" role="group" aria-label="Preview colour">
                    {COLORS.map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        className={`vocab-color-dot color-${option.key}${edit.color === option.key ? " on" : ""}`}
                        onClick={() => setEdit((current) => ({ ...current, color: option.key }))}
                        aria-label={option.label}
                        aria-pressed={edit.color === option.key}
                      />
                    ))}
                  </div>
                  <div className="vocab-list-editor-actions">
                    <button className="btn btn-primary" type="submit" disabled={pending}>
                      <Check size={14} /> Save preview
                    </button>
                    <button
                      className="btn btn-ghost"
                      type="button"
                      onClick={() => setEditingId(null)}
                      disabled={pending}
                    >
                      <X size={14} /> Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <Link className="vocab-list-open" href={`/dashboard/vocab?view=lists&list=${list.id}`}>
                    <span className="vocab-list-cover" aria-hidden="true">
                      {list.emoji || "📁"}
                    </span>
                    <span className="vocab-list-name">{list.name}</span>
                    <span className="vocab-list-desc">
                      {list.description || "Add a note in the preview editor."}
                    </span>
                    <span className="vocab-list-n">
                      {list.count} {list.count === 1 ? "word" : "words"}
                    </span>
                  </Link>
                  <div className="vocab-list-actions">
                    <Link
                      className="btn btn-primary"
                      href={`/dashboard/vocab?view=lists&list=${list.id}`}
                      title={`Open ${list.name}`}
                    >
                      Open
                    </Link>
                    <Link
                      className="btn btn-ghost"
                      href={`/dashboard/vocab?view=lists&list=${list.id}&add=1`}
                      title="Add a personal word"
                    >
                      <Plus size={14} /> Word
                    </Link>
                    <button
                      className="btn btn-ghost"
                      onClick={() => startEdit(list)}
                      aria-label={`Edit preview for ${list.name}`}
                      title="Edit preview"
                    >
                      <Pencil size={14} />
                    </button>
                    {confirmId === list.id ? (
                      <button className="btn btn-ghost danger" onClick={() => remove(list)} disabled={pending}>
                        <Trash2 size={14} /> Confirm
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
