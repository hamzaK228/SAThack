import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import QuestionText from "@/components/QuestionText";

export const dynamic = "force-dynamic";

type Attempt = {
  question_id: string | null;
  domain: string | null;
  is_correct: boolean | null;
  created_at: string;
};

export default async function ReviewPage() {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return null;

  // Latest result per question (attempts ordered newest-first).
  const attempts: Attempt[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase
      .from("practice_attempts")
      .select("question_id, domain, is_correct, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    const rows = (data ?? []) as Attempt[];
    attempts.push(...rows);
    if (rows.length < PAGE) break;
  }

  const latest = new Map<string, boolean>();
  for (const a of attempts) {
    if (!a.question_id || latest.has(a.question_id)) continue;
    latest.set(a.question_id, a.is_correct === true);
  }
  const dueIds = [...latest.entries()].filter(([, ok]) => !ok).map(([id]) => id);

  const qmap = new Map<
    string,
    { question_text: string; question_text_html: string | null; skill: string | null; difficulty: string }
  >();
  for (let i = 0; i < dueIds.length; i += 500) {
    const chunk = dueIds.slice(i, i + 500);
    const { data } = await supabase
      .from("questions")
      .select("id, question_text, question_text_html, skill, difficulty")
      .in("id", chunk);
    for (const q of data ?? []) qmap.set(q.id, q);
  }

  // Keep attempts' domain order.
  const due = dueIds.map((id) => {
    const q = qmap.get(id);
    const a = attempts.find((x) => x.question_id === id);
    return {
      id,
      domain: a?.domain ?? "Other",
      skill: q?.skill?.trim() ?? null,
      difficulty: q?.difficulty ?? null,
      question_text: q?.question_text ?? "",
      question_text_html: q?.question_text_html ?? null,
    };
  });

  return (
    <div className="dash-page">
      <div className="dash-head">
        <div>
          <h1 className="dash-title">Review queue</h1>
          <p className="dash-sub">
            {due.length} question{due.length === 1 ? "" : "s"} you got wrong and haven&apos;t
            mastered yet.
          </p>
        </div>
      </div>

      {due.length > 0 ? (
        <ul className="qb-list">
          {due.map((q) => (
            <li className="qb-item" key={q.id}>
              <div className="qb-item-head">
                <span className="session-chip">{q.domain}</span>
                {q.skill && <span className="session-chip skill-chip">{q.skill}</span>}
                {q.difficulty && <span className="session-chip">{q.difficulty}</span>}
                <Link className="qb-practice" href={`/dashboard/session?q=${q.id}`}>
                  Practice →
                </Link>
              </div>
              <div className="qb-question">
                <QuestionText html={q.question_text_html} text={q.question_text} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="dash-empty">
          <p>Nothing to review. 🎉 Keep practicing!</p>
          <Link className="btn btn-primary" href="/dashboard/session" style={{ marginTop: "1rem" }}>
            Start a session
          </Link>
        </div>
      )}
    </div>
  );
}
