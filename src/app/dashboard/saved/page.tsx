import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import MathText from "@/components/MathText";
import QuestionText from "@/components/QuestionText";
import UnsaveButton from "@/components/dashboard/UnsaveButton";

export const dynamic = "force-dynamic";

export default async function SavedPage() {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return null;

  const { data: saved } = await supabase
    .from("saved_questions")
    .select("question_id, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const qids = (saved ?? []).map((s) => s.question_id);
  const { data: qs } = qids.length
    ? await supabase
        .from("questions")
        .select(
          "id, question_text, question_text_html, domain, difficulty, correct_answer, explanation"
        )
        .in("id", qids)
    : { data: null };

  const qmap = new Map((qs ?? []).map((q) => [q.id, q]));
  const ordered = qids
    .map((id) => qmap.get(id))
    .filter((q): q is NonNullable<typeof q> => Boolean(q));

  return (
    <div className="dash-page">
      <div className="dash-head">
        <div>
          <h1 className="dash-title">Saved</h1>
          <p className="dash-sub">Questions you want to come back to.</p>
        </div>
      </div>

      <div className="dash-card">
        {ordered.length > 0 ? (
          <ul className="saved-list">
            {ordered.map((q) => (
              <li className="saved-card" key={q.id}>
                <div className="saved-head">
                  <span className="session-chip">{q.difficulty}</span>
                  <span className="session-chip">{q.domain}</span>
                  <Link className="qb-practice" href={`/dashboard/session?q=${q.id}`}>
                    Practice →
                  </Link>
                  <UnsaveButton questionId={q.id} />
                </div>
                <div className="saved-question">
                  <QuestionText html={q.question_text_html} text={q.question_text} />
                </div>
                <details className="saved-explanation">
                  <summary>Answer &amp; explanation</summary>
                  <p className="saved-answer">
                    Correct answer: <strong className="ok">{q.correct_answer}</strong>
                  </p>
                  {q.explanation && <MathText text={q.explanation} />}
                </details>
              </li>
            ))}
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
    </div>
  );
}

