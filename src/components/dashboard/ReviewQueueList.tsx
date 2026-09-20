import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import QuestionText from "@/components/QuestionText";

type Attempt = {
  question_id: string | null;
  domain: string | null;
  is_correct: boolean | null;
  mode: string;
  created_at: string;
};

export default async function ReviewQueueList({
  mode,
  emptyMessage = "Nothing to review. Keep practicing!",
}: {
  mode?: "full_test";
  emptyMessage?: string;
}) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return null;

  const attempts: Attempt[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data } = await supabase
      .from("practice_attempts")
      .select("question_id, domain, is_correct, mode, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    const rows = (data ?? []) as Attempt[];
    attempts.push(...rows);
    if (rows.length < pageSize) break;
  }

  const latestOverall = new Map<string, boolean>();
  const latestInQueue = new Map<string, boolean>();
  const queueAttempt = new Map<string, Attempt>();
  for (const attempt of attempts) {
    if (!attempt.question_id) continue;
    if (!latestOverall.has(attempt.question_id)) latestOverall.set(attempt.question_id, attempt.is_correct === true);
    if ((!mode || attempt.mode === mode) && !latestInQueue.has(attempt.question_id)) {
      latestInQueue.set(attempt.question_id, attempt.is_correct === true);
      queueAttempt.set(attempt.question_id, attempt);
    }
  }
  const dueIds = [...latestInQueue.entries()]
    .filter(([id, correct]) => !correct && latestOverall.get(id) !== true)
    .map(([id]) => id);

  const questions = new Map<string, { question_text: string; question_text_html: string | null; skill: string | null; difficulty: string }>();
  for (let index = 0; index < dueIds.length; index += 500) {
    const { data } = await supabase
      .from("questions")
      .select("id, question_text, question_text_html, skill, difficulty")
      .in("id", dueIds.slice(index, index + 500));
    for (const question of data ?? []) questions.set(question.id, question);
  }

  if (!dueIds.length) {
    return <div className="dash-empty"><p>{emptyMessage}</p><Link className="btn btn-primary" href={mode ? "/dashboard/test" : "/dashboard/session"}>Start practice</Link></div>;
  }

  return (
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
              <Link className="qb-practice" href={`/dashboard/session?q=${id}`}>Practice →</Link>
            </div>
            <div className="qb-question"><QuestionText html={question?.question_text_html} text={question?.question_text ?? ""} /></div>
          </li>
        );
      })}
    </ul>
  );
}
