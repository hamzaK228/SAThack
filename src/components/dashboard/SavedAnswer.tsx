"use client";

import { useState, useTransition } from "react";
import MathText from "@/components/MathText";
import { revealAnswer } from "@/app/dashboard/feature-actions";

export default function SavedAnswer({ questionId }: { questionId: string }) {
  const [answer, setAnswer] = useState<{ correctAnswer: string | null; explanation: string | null } | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function reveal() {
    setError("");
    startTransition(async () => {
      const result = await revealAnswer(questionId);
      if (result.ok) {
        setAnswer({
          correctAnswer: result.correctAnswer ?? null,
          explanation: result.explanation ?? null,
        });
      } else {
        setError(result.error ?? "Could not load the answer.");
      }
    });
  }

  return (
    <div className="saved-explanation">
      {!answer ? (
        <>
          <button className="btn btn-ghost" type="button" onClick={reveal} disabled={pending}>
            {pending ? "Loading…" : "Show answer & explanation"}
          </button>
          <span className="saved-answer-note">Unlocks after your first attempt.</span>
        </>
      ) : (
        <>
          <p className="saved-answer">
            Correct answer: <strong className="ok">{answer.correctAnswer ?? "—"}</strong>
          </p>
          {answer.explanation && <MathText text={answer.explanation} />}
        </>
      )}
      {error && <p className="saved-error" role="alert">{error}</p>}
    </div>
  );
}
