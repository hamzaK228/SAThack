import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { DOMAIN_ORDER } from "@/lib/plan";
import QuestionText from "@/components/QuestionText";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "All questions | SAThack admin",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 25;

export default async function AdminQuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; domain?: string; page?: string }>;
}) {
  const { q, domain, page } = await searchParams;
  const search = (q ?? "").trim();
  const domainFilter = (DOMAIN_ORDER as readonly string[]).includes(domain ?? "") ? domain : undefined;
  const pageNumber = Math.max(1, Number.parseInt(page ?? "1", 10) || 1);

  const supabase = await createClient();
  let countQuery = supabase.from("questions").select("id", { count: "exact", head: true });
  let listQuery = supabase
    .from("questions")
    .select("id, question_text, question_text_html, section, domain, skill, difficulty, is_official, usable, source_id")
    .order("id");
  if (search) {
    countQuery = countQuery.ilike("question_text", `%${search}%`);
    listQuery = listQuery.ilike("question_text", `%${search}%`);
  }
  if (domainFilter) {
    countQuery = countQuery.eq("domain", domainFilter);
    listQuery = listQuery.eq("domain", domainFilter);
  }
  const [countResult, listResult] = await Promise.all([
    countQuery,
    listQuery.range((pageNumber - 1) * PAGE_SIZE, pageNumber * PAGE_SIZE - 1),
  ]);

  const questions = listResult.data ?? [];
  const total = countResult.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function pageHref(target: number) {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (domainFilter) params.set("domain", domainFilter);
    params.set("page", String(target));
    return `/admin/questions?${params.toString()}`;
  }

  return (
    <div className="admin-console">
      <section className="admin-workspace" aria-labelledby="browse-title">
      <div className="admin-section-heading">
        <div>
          <p className="eyebrow">Content library</p>
          <h2 id="browse-title">All questions</h2>
          <p>Every question in the bank — official College Board items and practice-test items.</p>
        </div>
        <Link href="/admin">← Overview</Link>
      </div>

      <form className="admin-browse-bar" method="get" action="/admin/questions">
        <input type="search" name="q" defaultValue={search} placeholder="Search question text…" aria-label="Search question text" />
        <select name="domain" defaultValue={domainFilter ?? ""} aria-label="Filter by domain">
          <option value="">All domains</option>
          {DOMAIN_ORDER.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <button type="submit">Search</button>
      </form>

      <p className="admin-browse-count">{total.toLocaleString()} questions · page {pageNumber} of {pageCount}</p>

      {questions.length ? (
        <div className="admin-browse-list">
          {questions.map((question) => (
            <article key={question.id}>
              <div className="browse-meta">
                <span className="chip">{question.section === "math" ? "Math" : "R&W"}</span>
                <span className="chip">{question.domain}</span>
                {question.skill?.trim() && <span className="chip dim">{question.skill}</span>}
                <span className="chip dim">{question.difficulty}</span>
                {question.is_official ? <span className="chip">official</span> : <span className="chip off">practice test</span>}
                {!question.usable && <span className="chip off">unusable</span>}
                {question.source_id && <span className="chip dim">{question.source_id}</span>}
                <Link className="browse-edit" href={`/admin/questions/${question.id}`}>Edit →</Link>
              </div>
              <QuestionText
                html={question.question_text_html}
                text={question.question_text.length > 220 ? `${question.question_text.slice(0, 220)}…` : question.question_text}
              />
            </article>
          ))}
        </div>
      ) : (
        <p className="admin-empty">No questions match this search.</p>
      )}

      {pageCount > 1 && (
        <nav className="admin-pager" aria-label="Pagination">
          <span aria-disabled={pageNumber <= 1}><Link href={pageHref(pageNumber - 1)}>← Previous</Link></span>
          <span>Page {pageNumber} / {pageCount}</span>
          <span aria-disabled={pageNumber >= pageCount}><Link href={pageHref(pageNumber + 1)}>Next →</Link></span>
        </nav>
      )}
    </section>
    </div>
  );
}
