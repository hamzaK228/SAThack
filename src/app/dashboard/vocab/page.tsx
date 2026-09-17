import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import VocabCards, { type VocabWord } from "@/components/dashboard/VocabCards";
import { cleanExample, isDue, type VocabProgress } from "@/lib/vocab";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;
const VIEWS = ["all", "saved", "due"] as const;
type View = (typeof VIEWS)[number];

function href(params: { q: string; view: View; page: number }) {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.view !== "all") sp.set("view", params.view);
  if (params.page > 1) sp.set("page", String(params.page));
  const qs = sp.toString();
  return `/dashboard/vocab${qs ? `?${qs}` : ""}`;
}

export default async function VocabPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; view?: string; page?: string }>;
}) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return null;

  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const view: View = VIEWS.includes(sp.view as View) ? (sp.view as View) : "all";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  // --- progress: saved flags + spaced-repetition schedule ------------------
  // Paginated (past the 1000-row PostgREST cap). If the spaced-repetition
  // columns aren't in the database yet we fall back to the saved flag alone, so
  // the page keeps working until migrations/2026-09-15-polish.sql is applied.
  const FULL_COLS = "word_id, saved, mastery, times_seen, times_correct, next_review_at";
  const BASE_COLS = "word_id, saved";
  const PAGE = 1000;
  const userId = user.id;

  async function fetchProgress(cols: string): Promise<VocabProgress[] | null> {
    const rows: VocabProgress[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("vocab_progress")
        .select(cols)
        .eq("user_id", userId)
        .range(from, from + PAGE - 1);
      if (error) return null;
      const batch = (data ?? []) as unknown as VocabProgress[];
      rows.push(...batch);
      if (batch.length < PAGE) break;
    }
    return rows.map((r) => ({
      word_id: r.word_id,
      saved: !!r.saved,
      mastery: r.mastery ?? 0,
      times_seen: r.times_seen ?? 0,
      times_correct: r.times_correct ?? 0,
      next_review_at: r.next_review_at ?? null,
    }));
  }

  const progress = (await fetchProgress(FULL_COLS)) ?? (await fetchProgress(BASE_COLS)) ?? [];

  const progressMap = new Map(progress.map((p) => [p.word_id, p]));
  const savedIds = progress.filter((p) => p.saved).map((p) => p.word_id);
  const dueIds = progress.filter((p) => isDue(p)).map((p) => p.word_id);
  const learned = progress.filter((p) => p.times_seen > 0).length;

  const { count: totalWords } = await supabase
    .from("vocab_words")
    .select("id", { count: "exact", head: true });

  // --- the word list -------------------------------------------------------
  // Paginated so all 1,915 words stay reachable (PostgREST caps a page at 1000).
  const filterIds = view === "saved" ? savedIds : view === "due" ? dueIds : null;

  let words: VocabWord[] = [];
  let count = 0;

  if (!filterIds || filterIds.length > 0) {
    let query = supabase
      .from("vocab_words")
      .select("id, word, definition, example_sentence, tags", { count: "exact" })
      .order("word");
    if (q) query = query.ilike("word", `%${q}%`);
    if (filterIds) query = query.in("id", filterIds);

    const from = (page - 1) * PAGE_SIZE;
    const { data, count: total } = await query.range(from, from + PAGE_SIZE - 1);

    words = (data ?? []).map((w) => ({ ...w, example_sentence: cleanExample(w.example_sentence) }));
    count = total ?? 0;
  }

  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const safePage = Math.min(page, pages);

  const tabs: { key: View; label: string; n: number | null }[] = [
    { key: "all", label: "All words", n: totalWords ?? null },
    { key: "saved", label: "★ Saved", n: savedIds.length },
    { key: "due", label: "↻ Review due", n: dueIds.length },
  ];

  const stats = [
    { label: "Total words", value: (totalWords ?? 0).toLocaleString() },
    { label: "Saved", value: savedIds.length.toLocaleString() },
    { label: "Learning", value: learned.toLocaleString() },
    { label: "Due now", value: dueIds.length.toLocaleString() },
  ];

  return (
    <div className="dash-page">
      <div className="dash-head">
        <div>
          <h1 className="dash-title">Vocab</h1>
          <p className="dash-sub">
            Flip a card, then tell us if you know it — missed words come back on a spaced-repetition
            schedule until they stick.
          </p>
        </div>
      </div>

      <div className="vocab-stats">
        {stats.map((s) => (
          <div className="vocab-stat" key={s.label}>
            <span className="vocab-stat-value">{s.value}</span>
            <span className="vocab-stat-label">{s.label}</span>
          </div>
        ))}
      </div>

      <form className="vocab-search" method="get" action="/dashboard/vocab">
        {view !== "all" && <input type="hidden" name="view" value={view} />}
        <input className="field-input" name="q" placeholder="Search a word…" defaultValue={q} />
        <button className="btn btn-primary" type="submit">
          Search
        </button>
        {q && (
          <Link className="btn btn-ghost" href={href({ q: "", view, page: 1 })}>
            Clear
          </Link>
        )}
      </form>

      <div className="vocab-tabs">
        {tabs.map((t) => (
          <Link
            key={t.key}
            className={`vocab-tab${view === t.key ? " active" : ""}`}
            href={href({ q, view: t.key, page: 1 })}
          >
            {t.label}
            {t.n !== null && <span className="vocab-tab-n">{t.n}</span>}
          </Link>
        ))}
      </div>

      {words.length === 0 ? (
        <div className="dash-empty">
          {view === "saved" ? (
            <p>
              No saved words yet. Tap <strong>☆ Save</strong> on a card and it shows up here.
            </p>
          ) : view === "due" ? (
            <p>Nothing due right now. Study a few cards and we&apos;ll schedule them with spaced repetition.</p>
          ) : (
            <p>No words found.</p>
          )}
        </div>
      ) : (
        <>
          <VocabCards
            words={words}
            savedIds={savedIds}
            progress={Object.fromEntries(
              words.map((w) => [
                w.id,
                {
                  mastery: progressMap.get(w.id)?.mastery ?? 0,
                  times_seen: progressMap.get(w.id)?.times_seen ?? 0,
                },
              ])
            )}
          />

          {pages > 1 && (
            <nav className="vocab-pager" aria-label="Vocabulary pages">
              {safePage > 1 ? (
                <Link className="btn btn-ghost" href={href({ q, view, page: safePage - 1 })}>
                  ← Prev
                </Link>
              ) : (
                <span className="btn btn-ghost disabled" aria-disabled="true">
                  ← Prev
                </span>
              )}
              <span className="vocab-pager-info">
                Page {safePage} of {pages}
              </span>
              {safePage < pages ? (
                <Link className="btn btn-ghost" href={href({ q, view, page: safePage + 1 })}>
                  Next →
                </Link>
              ) : (
                <span className="btn btn-ghost disabled" aria-disabled="true">
                  Next →
                </span>
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}

