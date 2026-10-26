import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "All vocabulary | SAThack admin",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 50;

export default async function AdminVocabPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page } = await searchParams;
  const search = (q ?? "").trim();
  const pageNumber = Math.max(1, Number.parseInt(page ?? "1", 10) || 1);

  const supabase = await createClient();
  // Commas and parens would break the .or() filter syntax.
  const safeSearch = search.replace(/[,()]/g, " ").trim();
  const filter = safeSearch
    ? `word.ilike.%${safeSearch}%,definition.ilike.%${safeSearch}%`
    : undefined;
  let countQuery = supabase
    .from("vocab_words")
    .select("id", { count: "exact", head: true })
    .is("owner_id", null);
  let listQuery = supabase
    .from("vocab_words")
    .select("id, word, definition, tags")
    .is("owner_id", null)
    .order("word");
  if (filter) {
    countQuery = countQuery.or(filter);
    listQuery = listQuery.or(filter);
  }
  const [countResult, listResult] = await Promise.all([
    countQuery,
    listQuery.range((pageNumber - 1) * PAGE_SIZE, pageNumber * PAGE_SIZE - 1),
  ]);

  const words = (listResult.data ?? []) as { id: string; word: string; definition: string; tags: string | null }[];
  const total = countResult.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function pageHref(target: number) {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    params.set("page", String(target));
    return `/admin/vocab?${params.toString()}`;
  }

  return (
    <div className="admin-console">
      <section className="admin-workspace" aria-labelledby="browse-title">
      <div className="admin-section-heading">
        <div>
          <p className="eyebrow">Content library</p>
          <h2 id="browse-title">All vocabulary</h2>
          <p>Every word in the SRS deck, alphabetically.</p>
        </div>
        <Link href="/admin">← Overview</Link>
      </div>

      <form className="admin-browse-bar" method="get" action="/admin/vocab">
        <input type="search" name="q" defaultValue={search} placeholder="Search word or definition…" aria-label="Search vocabulary" />
        <button type="submit">Search</button>
      </form>

      <p className="admin-browse-count">{total.toLocaleString()} words · page {pageNumber} of {pageCount}</p>

      {words.length ? (
        <div className="admin-browse-list">
          {words.map((entry) => (
            <article key={entry.id}>
              <div className="browse-meta">
                <span className="chip">{entry.word}</span>
                {entry.tags?.split(",").map((tag) => tag.trim()).filter(Boolean).map((tag) => (
                  <span className="chip dim" key={tag}>{tag}</span>
                ))}
              </div>
              <p>{entry.definition}</p>
            </article>
          ))}
        </div>
      ) : (
        <p className="admin-empty">No words match this search.</p>
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
