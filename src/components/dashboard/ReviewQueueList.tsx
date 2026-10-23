import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import { getDueReview } from "@/lib/review-queue";
import QuestionText from "@/components/QuestionText";
import ErrorTagPicker from "@/components/dashboard/ErrorTagPicker";

export default async function ReviewQueueList({
  mode,
  window: windowRange,
  emptyMessage = "Nothing to review. Keep practicing!",
}: {
  mode?: "test";
  /** Restrict the list to one sitting: the mistakes inside a time window. */
  window?: { from: string; to: string };
  emptyMessage?: string;
}) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return null;

  type ListedAttempt = {
    domain: string | null;
    selected_answer?: string | null;
    correct_answer?: string | null;
  };
  let dueIds: string[] = [];
  let queueAttempt = new Map<string, ListedAttempt>();

  if (windowRange) {
    // One completed test's mistakes: everything answered wrong between its start
    // and its finish, whatever happened to those questions later in drills.
    const { data } = await supabase
      .from("practice_attempts")
      .select("question_id, domain, selected_answer, correct_answer, created_at")
      .eq("user_id", user.id)
      .eq("is_correct", false)
      .gte("created_at", windowRange.from)
      .lte("created_at", windowRange.to)
      .order("created_at", { ascending: true });
    for (const row of data ?? []) {
      if (row.question_id && !queueAttempt.has(row.question_id)) {
        queueAttempt.set(row.question_id, {
          domain: row.domain ?? null,
          selected_answer: row.selected_answer ?? null,
          correct_answer: row.correct_answer ?? null,
        });
      }
    }
    dueIds = [...queueAttempt.keys()];
  } else {
    const due = await getDueReview(supabase, user.id, mode === "test" ? "test" : "drill");
    dueIds = due.dueIds;
    queueAttempt = new Map(
      [...due.queueAttempt].map(([id, attempt]) => [
        id,
        {
          domain: attempt.domain ?? null,
          selected_answer: attempt.selected_answer ?? null,
          correct_answer: attempt.correct_answer ?? null,
        },
      ])
    );
  }

  const questions = new Map<string, { question_text: string; question_text_html: string | null; skill: string | null; difficulty: string }>();
  for (let index = 0; index < dueIds.length; index += 500) {
    const { data } = await supabase
      .from("questions")
      .select("id, question_text, question_text_html, skill, difficulty")
      .in("id", dueIds.slice(index, index + 500));
    for (const question of data ?? []) questions.set(question.id, question);
  }

  const notes = new Map<string, string>();
  for (let index = 0; index < dueIds.length; index += 500) {
    const { data } = await supabase
      .from("attempt_notes")
      .select("question_id, reason")
      .eq("user_id", user.id)
      .in("question_id", dueIds.slice(index, index + 500));
    for (const row of data ?? []) notes.set(row.question_id, row.reason);
  }

  if (!dueIds.length) {
    return <div className="dash-empty"><p>{emptyMessage}</p><Link className="btn btn-primary" href={mode ? "/dashboard/test" : "/dashboard/session"}>Start practice</Link></div>;
  }

  return (
    <>
      <div className="review-head">
        <strong>
          {dueIds.length} {dueIds.length === 1 ? "question" : "questions"}
        </strong>
        <span>
          {windowRange
            ? "Everything you missed on that test. The right answer is shown because the test is over — tap Practice to retry it."
            : "Your latest miss on each of these. Tag why it happened, then retry it to clear the queue."}
        </span>
        {!windowRange && mode !== "test" && dueIds.length > 0 && (
          <Link className="btn btn-ghost" href={`/dashboard/session?q=${dueIds[0]}&review=1&mastery=1`}>
            Mastery set · 3 in a row
          </Link>
        )}
      </div>
      <ul className="qb-list">
        {dueIds.map((id) => {
          const question = questions.get(id);
          const attempt = queueAttempt.get(id);
          return (
            <li className="qb-item" key={id}>
              <div className="qb-item-head">
                <span className="session-chip">{attempt?.domain ?? "Other"}</span>
                {question?.skill?.trim() && <span className="session-chip skill-chip">{question.skill}</span>}
                {question?.difficulty && <span className="session-chip">{question.difficulty}</span>}
                {attempt?.selected_answer && (
                  <span className="session-chip answer-chip">you answered {attempt.selected_answer}</span>
                )}
                {/* Only in a finished test: naming the right answer is the teaching.
                    In a live drill queue it would just spoil the retry. */}
                {windowRange && attempt?.correct_answer && (
                  <span className="session-chip answer-chip right">correct {attempt.correct_answer}</span>
                )}
                <Link className="qb-practice" href={`/dashboard/session?q=${id}&review=1`}>Practice →</Link>
              </div>
              {!windowRange && (
                <ErrorTagPicker questionId={id} current={notes.get(id) ?? null} />
              )}
              <div className="qb-question"><QuestionText html={question?.question_text_html} text={question?.question_text ?? ""} /></div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
