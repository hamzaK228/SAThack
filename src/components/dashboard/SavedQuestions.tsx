"use client";

import { useState } from "react";
import Link from "next/link";
import QuestionText from "@/components/QuestionText";
import SavedAnswer from "@/components/dashboard/SavedAnswer";
import { toggleSave } from "@/app/dashboard/actions";

export type SavedQuestion = {
  id: string;
  question_text: string;
  question_text_html: string | null;
  passage: string | null;
  passage_html?: string | null;
  domain: string | null;
  difficulty: string | null;
};

export default function SavedQuestions({ questions }: { questions: SavedQuestion[] }) {
  // Removal is per-card: the row goes "Removing…" the moment it is clicked (the
  // server round trip can take seconds on a cold connection) and only leaves
  // the list once the server confirms the delete. A failure restores the card
  // with an error instead of silently dropping it.
  const [removing, setRemoving] = useState<string[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [failed, setFailed] = useState<string | null>(null);

  const live = questions.filter((question) => !removed.includes(question.id));

  async function remove(id: string) {
    if (removing.includes(id)) return;
    setRemoving((previous) => [...previous, id]);
    setFailed(null);
    try {
      const result = await toggleSave(id, false);
      if (!result.ok) throw new Error("Remove failed");
      setRemoved((previous) => [...previous, id]);
    } catch {
      setFailed(id);
    } finally {
      setRemoving((previous) => previous.filter((pending) => pending !== id));
    }
  }

  return (
    <>
      <div className="dash-head">
        <div>
          <h1 className="dash-title">Saved</h1>
          <p className="dash-sub">
            {live.length > 0
              ? `${live.length} saved ${live.length === 1 ? "question" : "questions"}`
              : "Questions you want to come back to."}
          </p>
        </div>
        {live.length > 0 && (
          <Link className="btn btn-primary" href="/dashboard/session?saved=1">
            Practice all {live.length} →
          </Link>
        )}
      </div>

      <div className="dash-card">
        {live.length > 0 ? (
          <ul className="saved-list">
            {live.map((question) => {
              const isRemoving = removing.includes(question.id);
              return (
                <li className={`saved-card${isRemoving ? " removing" : ""}`} key={question.id}>
                  <div className="saved-head">
                    <span className="session-chip">{question.difficulty}</span>
                    <span className="session-chip">{question.domain}</span>
                    <Link className="qb-practice" href={`/dashboard/session?saved=1&q=${question.id}`}>
                      Practice →
                    </Link>
                    <button
                      className="saved-unsave"
                      onClick={() => remove(question.id)}
                      disabled={isRemoving}
                    >
                      {isRemoving ? "Removing…" : "✕ Remove"}
                    </button>
                  </div>
                  {failed === question.id && (
                    <p className="saved-error" role="alert">
                      Could not remove. Please try again.
                    </p>
                  )}
                  {/* The stimulus carries the figure description / data table
                      that "the figure above" and "shown" point at — without it
                      the question reads as if something is missing. */}
                  {(question.passage || question.passage_html) && (
                    <div className="saved-passage">
                      <QuestionText html={question.passage_html} text={question.passage ?? ""} />
                    </div>
                  )}
                  <div className="saved-question">
                    <QuestionText html={question.question_text_html} text={question.question_text} />
                  </div>
                  <SavedAnswer questionId={question.id} />
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="dash-empty">
            <p>Nothing saved yet. Tap ☆ Save on any question to keep it here.</p>
            <Link className="btn btn-primary" href="/dashboard/session" style={{ marginTop: "1rem" }}>
              Start a session
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
