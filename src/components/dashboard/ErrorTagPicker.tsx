"use client";

import { useState, useTransition } from "react";
import { saveAttemptNote } from "@/app/dashboard/feature-actions";

const REASONS = [
  { value: "content_gap", label: "Content gap" },
  { value: "process_slip", label: "Process slip" },
  { value: "misread", label: "Misread" },
  { value: "time_pressure", label: "Time pressure" },
] as const;

export default function ErrorTagPicker({
  questionId,
  current,
}: {
  questionId: string;
  current: string | null;
}) {
  const [reason, setReason] = useState(current);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function pick(value: string) {
    const previous = reason;
    setReason(value);
    setError("");
    startTransition(async () => {
      const result = await saveAttemptNote({ question_id: questionId, reason: value });
      if (!result.ok) {
        setReason(previous);
        setError(result.error ?? "Could not save that note.");
      }
    });
  }

  return (
    <div className="error-tags">
      <span className="error-tags-label">Why?</span>
      <div className="error-tags-row" role="group" aria-label="Why did you miss this question?">
        {REASONS.map((item) => (
          <button
            key={item.value}
            type="button"
            className={`error-tag${reason === item.value ? " active" : ""}`}
            aria-pressed={reason === item.value}
            disabled={pending}
            onClick={() => pick(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {error && <span className="error-tags-error" role="alert">{error}</span>}
    </div>
  );
}
