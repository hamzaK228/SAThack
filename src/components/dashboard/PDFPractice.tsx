"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Play, Pause, RotateCcw, Download, ExternalLink } from "lucide-react";

export default function PDFPractice({ id, title, userId, answerKey }: { id: string; title: string; userId: string; answerKey: boolean }) {
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [notes, setNotes] = useState("");
  const [storageError, setStorageError] = useState(false);
  const [ready, setReady] = useState(false);
  const storageKey = `sat-practice:${userId}:${id}`;
  const url = `/dashboard/test/files/${id}`;
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
        if (saved) {
          if (typeof saved.notes === "string") setNotes(saved.notes);
          if (Number.isSafeInteger(saved.seconds) && saved.seconds >= 0) setSeconds(saved.seconds);
        }
      } catch { setStorageError(true); }
      setReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [storageKey]);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(storageKey, JSON.stringify({ notes, seconds })); }
    catch {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Report a failed external storage write.
      setStorageError(true);
    }
  }, [ready, storageKey, notes, seconds]);
  useEffect(() => {
    if (!running) return;
    const started = Date.now();
    const initial = seconds;
    const interval = window.setInterval(() => setSeconds(initial + Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(interval);
    // Capture elapsed time when starting, not on every timer tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);
  return <div className="pdf-practice">
    <div className="dash-head"><h1 className="pdf-title">{title}</h1><Link href="/dashboard/test" className="btn btn-ghost">All tests</Link></div>
    <div className="pdf-controls">
      {!answerKey && <><span className="session-timer">{String(Math.floor(seconds / 3600)).padStart(2, "0")}:{String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}</span>
        <button className="dash-tool" disabled={!ready} onClick={() => setRunning((value) => !value)} title={running ? "Pause timer" : "Start timer"} aria-label={running ? "Pause timer" : "Start timer"}>{running ? <Pause size={18} /> : <Play size={18} />}</button>
        <button className="dash-tool" onClick={() => { setRunning(false); setSeconds(0); }} title="Reset timer" aria-label="Reset timer"><RotateCcw size={18} /></button></>}
      <a className="dash-tool" href={url} target="_blank" rel="noopener noreferrer" title="Open PDF" aria-label="Open PDF"><ExternalLink size={18} /></a>
      <a className="dash-tool" href={url} download={`${title}.pdf`} title="Download PDF" aria-label="Download PDF"><Download size={18} /></a>
    </div>
    <iframe key={id} className="practice-pdf" src={`${url}#view=FitH`} title={title} />
    {!answerKey && <label className="field"><span className="field-label">Answers / notes</span>
      <textarea className="field-input practice-notes" value={notes} disabled={!ready} onChange={(event) => setNotes(event.target.value)} />
    </label>}
    {storageError && <p role="alert">Local progress could not be saved. Check your browser storage settings.</p>}
  </div>;
}
