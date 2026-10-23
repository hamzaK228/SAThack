import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import QuestionText from "@/components/QuestionText";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Practice test | SAThack admin",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 25;

function moduleLabel(module: number) {
  if (module === 1) return "RW · Module 1";
  if (module === 2) return "RW · Module 2";
  if (module === 3) return "Math · Module 3";
  if (module === 4) return "Math · Module 4";
  return `Module ${module}`;
}

export default async function AdminTestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const { page } = await searchParams;
  const pageNumber = Math.max(1, Number.parseInt(page ?? "1", 10) || 1);

  const supabase = await createClient();
  const { data: form } = await supabase
    .from("practice_forms")
    .select("id, title, published")
    .eq("id", id)
    .maybeSingle();
  if (!form) notFound();

  // Source ids look like real:<formId>:m<module>:q<n>; alphabetical order
  // would put q10 before q2, so sort numerically here.
  type BaseQuestion = {
    id: string;
    question_text: string;
    question_text_html: string | null;
    difficulty: string;
    source_id: string | null;
  };
  const { data: rows } = await supabase
    .from("questions")
    .select("id, question_text, question_text_html, difficulty, source_id")
    .like("source_id", `real:${id}:%`);
  const base = (rows ?? []) as BaseQuestion[];
  const ids = base.map((question) => question.id);
  const { data: keyRows } = ids.length
    ? await supabase.rpc("admin_question_keys", { p_ids: ids })
    : { data: [] as { id: string; correct_answer: string | null }[] };
  const keyMap = new Map(
    ((keyRows ?? []) as { id: string; correct_answer: string | null }[]).map((row) => [
      row.id,
      row.correct_answer,
    ])
  );
  const questions = base
    .map((question) => ({ ...question, correct_answer: keyMap.get(question.id) ?? null }))
    .sort((a, b) => {
      const parse = (source: string) => {
        const match = /m(\d+):q(\d+)/.exec(source);
        return match ? Number(match[1]) * 1000 + Number(match[2]) : Number.MAX_SAFE_INTEGER;
      };
      return parse(a.source_id ?? "") - parse(b.source_id ?? "");
    });

  const total = questions.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const visible = questions.slice((pageNumber - 1) * PAGE_SIZE, pageNumber * PAGE_SIZE);

  return (
    <div className="admin-console">
      <section className="admin-workspace" aria-labelledby="browse-title">
      <div className="admin-section-heading">
        <div>
          <p className="eyebrow">Practice test</p>
          <h2 id="browse-title">{form.title}</h2>
          <p>{total} questions · {form.published ? "published" : "draft"}. Answer keys are shown for QA.</p>
        </div>
        <Link href="/admin/tests">← All tests</Link>
      </div>

      {visible.length ? (
        <div className="admin-browse-list">
          {visible.map((question) => {
            const match = /m(\d+):q(\d+)/.exec(question.source_id ?? "");
            const moduleNumber = match ? Number(match[1]) : 0;
            const number = match ? Number(match[2]) : 0;
            return (
              <article key={question.id}>
                <div className="browse-meta">
                  <span className="chip">{moduleLabel(moduleNumber)}</span>
                  <span className="chip dim">Q{number}</span>
                  <span className="chip dim">{question.difficulty}</span>
                  <span className="chip off">answer: {question.correct_answer}</span>
                </div>
                <QuestionText
                  html={question.question_text_html}
                  text={question.question_text.length > 260 ? `${question.question_text.slice(0, 260)}…` : question.question_text}
                />
              </article>
            );
          })}
        </div>
      ) : (
        <p className="admin-empty">This form has no questions in the bank.</p>
      )}

      {pageCount > 1 && (
        <nav className="admin-pager" aria-label="Pagination">
          <span aria-disabled={pageNumber <= 1}><Link href={`/admin/tests/${id}?page=${pageNumber - 1}`}>← Previous</Link></span>
          <span>Page {pageNumber} / {pageCount}</span>
          <span aria-disabled={pageNumber >= pageCount}><Link href={`/admin/tests/${id}?page=${pageNumber + 1}`}>Next →</Link></span>
        </nav>
      )}
    </section>
    </div>
  );
}
