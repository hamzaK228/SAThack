"use client";

import { useState, useTransition } from "react";
import { Flag } from "lucide-react";
import { reportQuestion } from "@/app/dashboard/feature-actions";

const REASONS = [
  { value: "wrong_answer", label: "The answer key looks wrong" },
  { value: "broken_media", label: "A graph, table or image is broken" },
  { value: "typo", label: "Typo or unclear wording" },
  { value: "other", label: "Something else" },
] as const;

export default function QuestionReportButton({ questionId }: { questionId: string }) {
  const [reason, setReason] = useState<string>("wrong_answer");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  function send() {
    setMessage("");
    startTransition(async () => {
      const result = await reportQuestion({ question_id: questionId, reason, note });
      if (result.ok) {
        setSent(true);
        setMessage("Thanks — sent to the content team.");
      } else {
        setMessage(result.error ?? "Could not send that report.");
      }
    });
  }

  return (
    <details className="question-report">
      <summary><Flag size={14} /> Report a problem</summary>
      <div className="question-report-body">
        {sent ? (
          <p role="status">{message}</p>
        ) : (
          <>
            <label className="field">
              <span className="field-label">What is wrong?</span>
              <select
                className="field-input"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                disabled={pending}
              >
                {REASONS.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Details (optional)</span>
              <input
                className="field-input"
                maxLength={500}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="What did you see?"
                disabled={pending}
              />
            </label>
            <button className="btn btn-ghost" type="button" onClick={send} disabled={pending}>
              {pending ? "Sending…" : "Send report"}
            </button>
            {message && <p role="alert">{message}</p>}
          </>
        )}
      </div>
    </details>
  );
}
