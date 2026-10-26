import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import VocabCards, { type VocabWord } from "@/components/dashboard/VocabCards";
import { cleanExample, isDue, type VocabProgress } from "@/lib/vocab";
import VocabContribution from "@/components/dashboard/VocabContribution";
import VocabLists, { type VocabListSummary } from "@/components/dashboard/VocabLists";
import ListWordsManager from "@/components/dashboard/ListWordsManager";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;
const VIEWS = ["all", "saved", "due", "lists"] as const;
type View = (typeof VIEWS)[number];
type ListMode = "words" | "study";

function href(params: {
  q: string;
  view: View;
  page: number;
  list?: string | null;
  mode?: ListMode;
}) {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.view !== "all") sp.set("view", params.view);
  if (params.list) sp.set("list", params.list);
  if (params.mode) sp.set("mode", params.mode);
  if (params.page > 1) sp.set("page", String(params.page));
  const qs = sp.toString();
  return `/dashboard/vocab${qs ? `?${qs}` : ""}`;
}

export default async function VocabPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    view?: string;
    page?: string;
    list?: string;
    add?: string;
    mode?: string;
  }>;
}) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return null;

  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const view: View = VIEWS.includes(sp.view as View) ? (sp.view as View) : "all";
  const mode: ListMode = sp.mode === "study" ? "study" : "words";
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

  // The curated bank only; personal rows belong to their lists, not "All words".
  const { count: totalWords } = await supabase
    .from("vocab_words")
    .select("id", { count: "exact", head: true })
    .is("owner_id", null);

  // --- custom lists ("folders") --------------------------------------------
  // RLS scopes every read to this user; the `list` param is only a selector.
  const { data: listRows } = await supabase
    .from("vocab_lists")
    .select("id, name, description, emoji, color")
    .eq("user_id", userId)
    .order("name");
  const lists = (listRows ?? []) as {
    id: string;
    name: string;
    description: string;
    emoji: string;
    color: string;
  }[];
  const studyingList =
    view === "lists" && sp.list ? lists.find((l) => l.id === sp.list) ?? null : null;

  // All membership rows in one paginated pass — they feed three things: the
  // per-list counts in the manager, the studied list's word ids, and the
  // ＋ List popover state for the words on this page.
  const items: { list_id: string; word_id: string }[] = [];
  if (lists.length) {
    for (let from = 0; ; from += PAGE) {
      const { data } = await supabase
        .from("vocab_list_items")
        .select("list_id, word_id")
        .range(from, from + PAGE - 1);
      const batch = (data ?? []) as { list_id: string; word_id: string }[];
      items.push(...batch);
      if (batch.length < PAGE) break;
    }
  }
  const listCounts = new Map<string, number>();
  for (const item of items) listCounts.set(item.list_id, (listCounts.get(item.list_id) ?? 0) + 1);
  const listSummaries: VocabListSummary[] = lists.map((list) => ({
    ...list,
    count: listCounts.get(list.id) ?? 0,
  }));
  const listWordIds = studyingList
    ? items.filter((item) => item.list_id === studyingList.id).map((item) => item.word_id)
    : [];

  // --- the word list -------------------------------------------------------
  // Paginated so all 1,915 words stay reachable (PostgREST caps a page at 1000).
  const filterIds =
    view === "saved"
      ? savedIds
      : view === "due"
        ? dueIds
        : view === "lists"
          ? studyingList
            ? listWordIds
            : []
          : null;

  // The lists view without a selected list renders the manager, not a deck —
  // only run the words query when a deck is actually shown.
  const showDeck = view !== "lists" || studyingList !== null;

  let words: VocabWord[] = [];
  let count = 0;

  if (showDeck && (!filterIds || filterIds.length > 0)) {
    let query = supabase
      .from("vocab_words")
      .select("id, word, definition, example_sentence, context_sentence, tags, owner_id", { count: "exact" })
      .order("word");
    if (view === "all") query = query.is("owner_id", null);
    if (q) query = query.ilike("word", `%${q}%`);
    if (filterIds) query = query.in("id", filterIds);

    const from = (page - 1) * PAGE_SIZE;
    const { data, count: total } = await query.range(from, from + PAGE_SIZE - 1);

    words = (data ?? []).map((w) => ({ ...w, example_sentence: cleanExample(w.example_sentence) }));
    count = total ?? 0;
  }

  // The review deck has to arrive in the order the schedule asked for: the most
  // overdue word first. The query sorts alphabetically, which is meaningless for
  // a review session — that ordering is why spaced repetition was not working.
  if (view === "due" && !q && words.length > 1) {
    words = [...words].sort((a, b) =>
      (progressMap.get(a.id)?.next_review_at ?? "").localeCompare(progressMap.get(b.id)?.next_review_at ?? "")
    );
  }

  // Membership per word on this page, for the card's ＋ List popover.
  const pageWordIds = new Set(words.map((w) => w.id));
  const memberships: Record<string, string[]> = {};
  for (const item of items) {
    if (!pageWordIds.has(item.word_id)) continue;
    (memberships[item.word_id] ??= []).push(item.list_id);
  }

  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const safePage = Math.min(page, pages);

  const tabs: { key: View; label: string; n: number | null }[] = [
    { key: "all", label: "All words", n: totalWords ?? null },
    { key: "saved", label: "★ Saved", n: savedIds.length },
    { key: "due", label: "↻ Review due", n: dueIds.length },
    { key: "lists", label: "📁 My lists", n: lists.length },
  ];

  const stats = [
    { label: "Total words", value: (totalWords ?? 0).toLocaleString() },
    { label: "Saved", value: savedIds.length.toLocaleString() },
    { label: "Learning", value: learned.toLocaleString() },
    { label: "Due now", value: dueIds.length.toLocaleString() },
  ];

  const managingLists = view === "lists" && !studyingList;
  const focusedStudy = Boolean(studyingList && mode === "study");

  const pager = (nextMode?: ListMode) =>
    pages > 1 ? (
      <nav className="vocab-pager" aria-label="Vocabulary pages">
        {safePage > 1 ? (
          <Link
            className="btn btn-ghost"
            href={href({ q, view, page: safePage - 1, list: studyingList?.id, mode: nextMode })}
          >
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
          <Link
            className="btn btn-ghost"
            href={href({ q, view, page: safePage + 1, list: studyingList?.id, mode: nextMode })}
          >
            Next →
          </Link>
        ) : (
          <span className="btn btn-ghost disabled" aria-disabled="true">
            Next →
          </span>
        )}
      </nav>
    ) : null;

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

      {/* Deck first — search and the activity heatmap live below the card so
          the flashcard is on screen without scrolling. */}
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

      {managingLists ? (
        <VocabLists lists={listSummaries} />
      ) : (
        <>
          {studyingList && (
            <>
              <div className={`vocab-list-head vocab-list-color-${studyingList.color}`}>
                <Link className="btn btn-ghost" href={href({ q: "", view: "lists", page: 1 })}>
                  ← All lists
                </Link>
                <div className="vocab-list-head-copy">
                  <span className="vocab-list-head-title">
                    <span className="vocab-list-head-emoji" aria-hidden="true">
                      {studyingList.emoji || "📁"}
                    </span>
                    {studyingList.name}
                    <span className="vocab-list-head-n">
                      {listWordIds.length} {listWordIds.length === 1 ? "word" : "words"}
                    </span>
                  </span>
                  {studyingList.description && (
                    <p className="vocab-list-head-desc">{studyingList.description}</p>
                  )}
                </div>
              </div>

              <nav className="vocab-mode-tabs" aria-label="List view">
                <Link
                  className={`vocab-mode-tab${mode === "words" ? " active" : ""}`}
                  href={href({ q, view, page: 1, list: studyingList.id, mode: "words" })}
                >
                  Words <span>{listWordIds.length}</span>
                </Link>
                <Link
                  className={`vocab-mode-tab${mode === "study" ? " active" : ""}`}
                  href={href({ q: "", view, page: 1, list: studyingList.id, mode: "study" })}
                >
                  Study
                </Link>
              </nav>
            </>
          )}

          {studyingList && mode === "words" ? (
            <>
              <ListWordsManager
                key={studyingList.id}
                listId={studyingList.id}
                words={words}
                total={count}
                q={q}
                defaultOpen={sp.add === "1"}
                studyHref={href({ q: "", view, page: 1, list: studyingList.id, mode: "study" })}
              />
              {pager("words")}
            </>
          ) : words.length === 0 ? (
            <div className="dash-empty">
              {view === "saved" ? (
                <p>
                  No saved words yet. Tap <strong>☆ Save</strong> on a card and it shows up here.
                </p>
              ) : view === "due" ? (
                <p>Nothing due right now. Study a few cards and we&apos;ll schedule them with spaced repetition.</p>
              ) : studyingList ? (
                <p>
                  This list is empty.{" "}
                  <Link href={href({ q: "", view, page: 1, list: studyingList.id, mode: "words" })}>
                    Go to Words
                  </Link>{" "}
                  to add your own.
                </p>
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
                lists={lists}
                memberships={memberships}
              />
              {pager(studyingList ? "study" : undefined)}
            </>
          )}
        </>
      )}

      {/* Kept below the deck: the flashcard — the point of this page — stays
          above the fold, with the counters as a footer summary. */}
      {!focusedStudy && (
        <div className="vocab-stats">
          {stats.map((s) => (
            <div className="vocab-stat" key={s.label}>
              <span className="vocab-stat-value">{s.value}</span>
              <span className="vocab-stat-label">{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Search filters the decks, so it stays out of the list-manager view. */}
      {!managingLists && !focusedStudy && (
        <form className="vocab-search" method="get" action="/dashboard/vocab">
          {view !== "all" && <input type="hidden" name="view" value={view} />}
          {studyingList && <input type="hidden" name="list" value={studyingList.id} />}
          <input className="field-input" name="q" placeholder="Search a word…" defaultValue={q} />
          <button className="btn btn-primary" type="submit">
            Search
          </button>
          {q && (
            <Link className="btn btn-ghost" href={href({ q: "", view, page: 1, list: studyingList?.id })}>
              Clear
            </Link>
          )}
        </form>
      )}

      {!focusedStudy && <VocabContribution />}
    </div>
  );
}
