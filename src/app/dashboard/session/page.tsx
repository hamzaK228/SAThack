import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import StudySession from "@/components/dashboard/StudySession";
import { computeStatuses } from "@/lib/question-status";
import { loadSessionQuestions } from "../actions";
import { getDueReview } from "@/lib/review-queue";
import { QUESTION_BATCH_SIZE } from "@/lib/session-questions";
import SessionBudget from "@/components/dashboard/SessionBudget";
import { getStudyPlan } from "@/lib/study-plan-data";
import { taskKey } from "@/lib/plan";

export const dynamic = "force-dynamic";
type Search = { domain?: string; skill?: string; difficulty?: string; section?: string; status?: string; q?: string; review?: string; saved?: string; mastery?: string; minutes?: string };

// The full unfiltered bank-id list is identical for every signed-in user and
// barely changes — cache it briefly (per server instance) so the post-answer
// stats refresh doesn't re-paginate 3,700+ rows every time. Only non-empty
// authenticated results are cached. Module scope keeps Date.now() out of
// render, which the React purity lint requires.
let bankIdsCache: { at: number; ids: string[] } | null = null;
const BANK_IDS_TTL_MS = 60_000;
type BankClient = Awaited<ReturnType<typeof createClient>>;

async function loadBankIds(supabase: BankClient): Promise<string[]> {
  if (bankIdsCache && Date.now() - bankIdsCache.at < BANK_IDS_TTL_MS) {
    return bankIdsCache.ids;
  }
  const ids: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("questions")
      .select("id")
      .eq("is_official", true)
      .eq("usable", true)
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error("Could not load the question bank.");
    ids.push(...(data ?? []).map((row) => row.id));
    if (!data || data.length < 1000) break;
  }
  if (ids.length > 0) bankIdsCache = { at: Date.now(), ids };
  return ids;
}

export default async function SessionPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await getCurrentUser();
  if (!user) return null;
  const userId = user.id;
  const supabase = await createClient();
  const { domain, skill, difficulty, section, status, q, review, saved, mastery, minutes } = await searchParams;
  const statusVal = status === "unsolved" || status === "solved" || status === "missed" ? status : "all";
  const masteryMode = mastery === "1";
  const budget = minutes ? Math.min(120, Math.max(10, Number(minutes) || 20)) : null;

  // Practice opened from a review queue: run the missed question first, then
  // keep walking the rest of the queue instead of falling into bank questions.
  if (q && review) {
    const { data: qRow } = await supabase.from("questions").select("id, domain, section").eq("id", q).maybeSingle();
    if (!qRow) return <p role="status">Question not found.</p>;
    const { dueIds } = await getDueReview(supabase, userId, "drill", masteryMode);
    const chosen = [q, ...dueIds.filter((id) => id !== q)];
    const initial = await loadSessionQuestions(chosen.slice(0, QUESTION_BATCH_SIZE), { officialOnly: false });
    return (
      <div className="dash-page">
        <Link className="page-back" href="/dashboard/review"><ArrowLeft size={15} /> Back to review queue</Link>
        <div className="dash-head"><div>
          <h1 className="dash-title">Review practice</h1>
          <p className="dash-sub">{chosen.length} {chosen.length === 1 ? "question" : "questions"} to master</p>
        </div></div>
        <p className="dash-sub">
          {masteryMode ? "Mastery set — each question stays until you answer it correctly three times in a row." : "Retry until the queue is clear."}
        </p>
        <StudySession key={`review:${q}:${masteryMode}`}
          review mastery={masteryMode}
          questions={initial.questions} questionIds={chosen} initialSavedIds={initial.savedIds} />
      </div>
    );
  }

  // Practice opened from the saved list: walk the saved questions instead of
  // the bank, so "Next question" always lands on another saved question.
  if (saved) {
    const { data: savedRows, error: savedError } = await supabase
      .from("saved_questions")
      .select("question_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (savedError) throw new Error("Could not load your saved questions.");
    const savedIds = (savedRows ?? []).map((row) => row.question_id);
    const chosen = q ? [q, ...savedIds.filter((id) => id !== q)] : savedIds;
    if (!chosen.length) {
      return (
        <div className="dash-page">
          <Link className="page-back" href="/dashboard/saved"><ArrowLeft size={15} /> Back to saved list</Link>
          <div className="dash-head"><div>
            <h1 className="dash-title">Saved practice</h1>
            <p className="dash-sub">Nothing saved yet.</p>
          </div></div>
          <div className="dash-card">
            <div className="dash-empty">
              <p>Tap ☆ Save on any question and it will show up here.</p>
              <Link className="btn btn-primary" href="/dashboard/session" style={{ marginTop: "1rem" }}>
                Start a session
              </Link>
            </div>
          </div>
        </div>
      );
    }
    // Saved rows can point at practice-test questions too (saved from a test
    // review), so this scope skips the official-bank filter like review mode.
    const initial = await loadSessionQuestions(chosen.slice(0, QUESTION_BATCH_SIZE), { officialOnly: false });
    return (
      <div className="dash-page">
        <Link className="page-back" href="/dashboard/saved"><ArrowLeft size={15} /> Back to saved list</Link>
        <div className="dash-head"><div>
          <h1 className="dash-title">Saved practice</h1>
          <p className="dash-sub">
            {chosen.length} saved {chosen.length === 1 ? "question" : "questions"}
          </p>
        </div></div>
        <StudySession key={`saved:${q ?? "all"}`}
          savedOnly
          questions={initial.questions} questionIds={chosen} initialSavedIds={initial.savedIds} />
      </div>
    );
  }

  // A short set sized to the minutes the student actually has. It follows the
  // plan's next undone practice/learn steps, then falls back to the bank.
  if (budget && !q && !review && !saved) {
    const bundle = await getStudyPlan();
    const todayIso = new Date().toISOString().slice(0, 10);
    const pending = (bundle?.plan.tasks ?? [])
      .filter((task) => !bundle?.plan.done[taskKey(task)])
      .filter((task) => task.kind !== "diagnostic" && task.kind !== "test")
      .filter((task) => (bundle?.snoozed[taskKey(task)] ?? "") <= todayIso)
      .sort((a, b) => a.week - b.week || a.day - b.day);

    const picked: typeof pending = [];
    let spent = 0;
    for (const task of pending) {
      if (picked.length > 0 && spent + task.minutes > budget) break;
      picked.push(task);
      spent += task.minutes;
      if (spent >= budget) break;
    }

    const ids: string[] = [];
    for (const task of picked) {
      const take = Math.max(6, Math.min(20, task.questionCount || 10));
      const runScope = async (withSkill: boolean) => {
        let query = supabase
          .from("questions")
          .select("id")
          .eq("is_official", true)
          .eq("usable", true);
        if (task.domain) query = query.eq("domain", task.domain);
        if (withSkill && task.skill) query = query.eq("skill", task.skill);
        if (task.difficulty) query = query.eq("difficulty", task.difficulty);
        const { data } = await query.order("id").limit(take);
        return (data ?? []).map((row) => row.id as string);
      };
      let scoped = await runScope(true);
      if (!scoped.length && task.skill) scoped = await runScope(false);
      ids.push(...scoped);
    }

    let chosen = [...new Set(ids)];
    if (chosen.length < 8) {
      const bank = await loadBankIds(supabase);
      chosen = [...new Set([...chosen, ...bank])];
    }
    const targetCount = Math.min(40, Math.max(8, Math.round(budget / 1.4)));
    chosen = chosen.slice(0, targetCount);
    const initial = chosen.length
      ? await loadSessionQuestions(chosen.slice(0, QUESTION_BATCH_SIZE))
      : { questions: [], savedIds: [] };
    const title = picked.length
      ? picked.slice(0, 2).map((task) => task.title).join(" · ")
      : "Quick set";

    return (
      <div className="dash-page">
        <Link className="page-back" href="/dashboard/plan"><ArrowLeft size={15} /> Back to study plan</Link>
        <div className="dash-head"><div>
          <h1 className="dash-title">{budget}-minute set</h1>
          <p className="dash-sub">{title} · {chosen.length} questions · about {budget} minutes</p>
        </div></div>
        <SessionBudget active={budget} />
        {chosen.length === 0 ? (
          <div className="dash-card"><p className="dash-sub">No questions match this set yet. Try a full session.</p></div>
        ) : (
          <StudySession
            key={`budget:${budget}:${chosen[0]}`}
            questions={initial.questions}
            questionIds={chosen}
            initialSavedIds={initial.savedIds}
          />
        )}
      </div>
    );
  }

  let scopeDomain = domain;
  let scopeSection = section;
  if (q) {
    const { data, error } = await supabase.from("questions").select("domain, section")
      .eq("is_official", true).eq("usable",true).eq("id", q).maybeSingle();
    if (error) throw new Error("Could not load this question.");
    if (!data) return <p role="status">Question not found.</p>;
    scopeDomain = data.domain;
    scopeSection = data.section;
  }
  const PAGE = 1000;
  async function fetchIds(withSkill: string | undefined) {
    // Unfiltered sessions (the common case) hit the 60s bank-id cache; any
    // filtered scope still fetches live.
    if (!scopeSection && !scopeDomain && !withSkill && !difficulty) {
      return loadBankIds(supabase);
    }
    const ids: string[] = [];
    for (let from = 0; ; from += PAGE) {
      let query = supabase.from("questions").select("id").eq("is_official", true).eq("usable",true).order("id");
      if (scopeSection) query = query.eq("section", scopeSection);
      if (scopeDomain) query = query.eq("domain", scopeDomain);
      if (withSkill) query = query.eq("skill", withSkill);
      if (difficulty) query = query.eq("difficulty", difficulty);
      const { data, error } = await query.range(from, from + PAGE - 1);
      if (error) throw new Error("Could not load the question bank.");
      ids.push(...(data ?? []).map((row) => row.id));
      if (!data || data.length < PAGE) return ids;
    }
  }
  async function fetchStatuses() {
    if (statusVal === "all") return null;
    const attempts: { question_id: string | null; is_correct: boolean | null }[] = [];
    for (let from = 0; ; from += PAGE) {
      // Newest-first: computeStatuses takes a question's LATEST attempt as
      // its status, so a corrected miss shows as solved.
      const { data, error } = await supabase.from("practice_attempts").select("question_id, is_correct")
        .eq("user_id", userId).order("created_at", { ascending: false }).range(from, from + PAGE - 1);
      if (error) throw new Error("Could not load your progress.");
      attempts.push(...(data ?? []));
      if (!data || data.length < PAGE) return computeStatuses(attempts);
    }
  }
  // A skill label with no exact match (e.g. a lesson's general term) must not
  // blank the session — fall back to the domain/difficulty scope.
  let appliedSkill = skill;
  const [fetchedIds, statuses] = await Promise.all([fetchIds(appliedSkill), fetchStatuses()]);
  let ids = fetchedIds;
  if (!ids.length && appliedSkill && !q) {
    appliedSkill = undefined;
    ids = await fetchIds(undefined);
  }
  let chosen = statuses ? ids.filter((id) => statusVal === "unsolved" ? !statuses.answered.has(id)
    : statusVal === "missed" ? statuses.missed.has(id) : statuses.solved.has(id)) : ids;
  if (q) chosen = [q, ...chosen.filter((id) => id !== q)];
  const initial = chosen.length ? await loadSessionQuestions(chosen.slice(0, QUESTION_BATCH_SIZE))
    : { questions: [], savedIds: [] };
  const heading = [scopeDomain ?? (scopeSection === "math" ? "Math" : scopeSection ? "Reading & Writing" : ""), appliedSkill]
    .filter(Boolean).join(" · ");
  return (
    <div className="dash-page">
      <Link className="page-back" href="/dashboard/question-bank"><ArrowLeft size={15} /> Back to question bank</Link>
      <div className="dash-head"><div>
        <h1 className="dash-title">{heading ? `Practice: ${heading}` : "Study session"}</h1>
        <p className="dash-sub">{chosen.length} {statusVal === "all" ? "" : `${statusVal} `}questions{difficulty ? ` · ${difficulty}` : ""}</p>
      </div></div>
      <SessionBudget active={budget ?? undefined} />
      <StudySession key={[q, domain, section, skill, difficulty, statusVal, masteryMode].join(":")}
        mastery={masteryMode}
        questions={initial.questions} questionIds={chosen} initialSavedIds={initial.savedIds} />
    </div>
  );
}
