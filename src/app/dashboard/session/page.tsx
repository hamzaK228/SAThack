import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import StudySession from "@/components/dashboard/StudySession";
import { computeStatuses } from "@/lib/question-status";
import { loadSessionQuestions } from "../actions";
import { QUESTION_BATCH_SIZE } from "@/lib/session-questions";
import { getQuestionCollection } from "@/lib/question-collections";

export const dynamic = "force-dynamic";
type Search = { domain?: string; skill?: string; difficulty?: string; section?: string; status?: string; q?: string; collection?: string };

export default async function SessionPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await getCurrentUser();
  if (!user) return null;
  const userId = user.id;
  const supabase = await createClient();
  const { domain, skill, difficulty, section, status, q, collection: collectionId } = await searchParams;
  const collection = getQuestionCollection(collectionId);
  const statusVal = status === "unsolved" || status === "solved" || status === "missed" ? status : "all";
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
  async function fetchIds() {
    const ids: string[] = [];
    for (let from = 0; ; from += PAGE) {
      let query = supabase.from("questions").select("id").eq("is_official", true).eq("usable",true).order("id");
      if (collection) query = query.in("source_id", collection.sourceIds);
      if (scopeSection) query = query.eq("section", scopeSection);
      if (scopeDomain) query = query.eq("domain", scopeDomain);
      if (skill) query = query.eq("skill", skill);
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
      const { data, error } = await supabase.from("practice_attempts").select("question_id, is_correct")
        .eq("user_id", userId).order("id").range(from, from + PAGE - 1);
      if (error) throw new Error("Could not load your progress.");
      attempts.push(...(data ?? []));
      if (!data || data.length < PAGE) return computeStatuses(attempts);
    }
  }
  const [ids, statuses] = await Promise.all([fetchIds(), fetchStatuses()]);
  let chosen = statuses ? ids.filter((id) => statusVal === "unsolved" ? !statuses.answered.has(id)
    : statusVal === "missed" ? statuses.missed.has(id) : statuses.solved.has(id)) : ids;
  if (q) chosen = [q, ...chosen.filter((id) => id !== q)];
  const initial = chosen.length ? await loadSessionQuestions(chosen.slice(0, QUESTION_BATCH_SIZE))
    : { questions: [], savedIds: [] };
  const heading = [scopeDomain ?? (scopeSection === "math" ? "Math" : scopeSection ? "Reading & Writing" : ""), skill]
    .filter(Boolean).join(" · ");
  return (
    <div className="dash-page">
      <div className="dash-head"><div>
        <h1 className="dash-title">{heading ? `Practice: ${heading}` : collection?.title ?? "Study session"}</h1>
        <p className="dash-sub">{chosen.length} {statusVal === "all" ? "" : `${statusVal} `}questions{difficulty ? ` · ${difficulty}` : ""}</p>
      </div></div>
      <StudySession key={[q, domain, section, skill, difficulty, statusVal, collection?.id].join(":")}
        questions={initial.questions} questionIds={chosen} initialSavedIds={initial.savedIds} />
    </div>
  );
}
