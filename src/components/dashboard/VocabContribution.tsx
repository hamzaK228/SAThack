"use client";

import { FormEvent, useState, useTransition } from "react";
import { Plus, Send, Sparkles, X } from "lucide-react";
import { draftVocabSuggestion, submitVocabSuggestion } from "@/app/dashboard/actions";

const EMPTY = { word: "", definition: "", example: "", tags: "" };

export default function VocabContribution() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [entry, setEntry] = useState(EMPTY);
  const [aiAssisted, setAiAssisted] = useState(false);
  const [notice, setNotice] = useState({ text: "", bad: false });

  function generate() {
    setNotice({ text: "", bad: false });
    startTransition(async () => {
      const result = await draftVocabSuggestion(entry.word);
      if (!result.ok || !result.draft) return setNotice({ text: result.error ?? "Could not create a draft.", bad: true });
      setEntry((value) => ({ ...value, ...result.draft }));
      setAiAssisted(true);
      setNotice({ text: "AI draft ready — please review it before submitting.", bad: false });
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice({ text: "", bad: false });
    startTransition(async () => {
      const result = await submitVocabSuggestion({ ...entry, aiAssisted });
      if (!result.ok) return setNotice({ text: result.error ?? "Could not submit this word.", bad: true });
      setEntry(EMPTY);
      setAiAssisted(false);
      setNotice({ text: "Sent for admin review. Thank you for improving the library!", bad: false });
    });
  }

  return (
    <section className={`vocab-contribution${open ? " open" : ""}`}>
      <button className="vocab-contribution-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span><Plus size={17} /><strong>Suggest a word</strong><small>Add a missing SAT word for admin review</small></span>
        {open ? <X size={17} /> : <span aria-hidden="true">→</span>}
      </button>
      {open && <form onSubmit={submit}>
        <div className="vocab-contribution-word"><input value={entry.word} onChange={(event) => { setEntry((value) => ({ ...value, word: event.target.value })); setAiAssisted(false); }} placeholder="Word" maxLength={80} required autoFocus /><button type="button" onClick={generate} disabled={pending || entry.word.trim().length < 2}><Sparkles size={15} /> Let AI write the meaning</button></div>
        <textarea value={entry.definition} onChange={(event) => setEntry((value) => ({ ...value, definition: event.target.value }))} placeholder="Definition" maxLength={800} rows={3} required />
        <textarea value={entry.example} onChange={(event) => setEntry((value) => ({ ...value, example: event.target.value }))} placeholder="Example sentence" maxLength={800} rows={2} />
        <input value={entry.tags} onChange={(event) => setEntry((value) => ({ ...value, tags: event.target.value }))} placeholder="Tags, comma separated" maxLength={200} />
        {notice.text && <p className={notice.bad ? "bad" : "ok"} role="status">{notice.text}</p>}
        <footer><small>Submissions are private until an admin approves them.</small><button className="btn btn-primary" disabled={pending}><Send size={15} /> Submit for review</button></footer>
      </form>}
    </section>
  );
}
