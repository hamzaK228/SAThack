import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import StudySession from "@/components/dashboard/StudySession";
import { computeStatuses } from "@/lib/question-status";

export const dynamic = "force-dynamic";

const COLS =
  "id, section, domain, skill, difficulty, is_grid_in, question_text, question_text_html, passage, passage_html, choices, correct_answer, explanation";

type Search = {
  domain?: string;
  skill?: string;
  difficulty?: string;
  section?: string;
  status?: string;
  q?: string;
};

type Question = {
  id: string;
  section: string;
  domain: string;
  skill: string | null;
  difficulty: string;
  is_grid_in: boolean;
  question_text: string;
  passage: string | null;
  choices: { label: string; text: string }[] | null;
  correct_answer: string;
  explanation: string | null;
};

async function fetchAttempts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<{ question_id: string | null; is_correct: boolean | null }[]> {
  const rows: { question_id: string | null; is_correct: boolean | null }[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase
      .from("practice_attempts")
      .select("question_id, is_correct")
      .eq("user_id", userId)
      .range(from, from + PAGE - 1);
    const batch = (data ?? []) as typeof rows;
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

export default async function SessionPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return null;

  const { domain, skill, difficulty, section, status, q } = await searchParams;
  const statusVal =
    status === "unsolved" || status === "solved" || status === "missed" ? status : "all";

  let questions: Question[] = [];
  let heading = "Study session";
  let sub = "A focused drill.";

  if (q) {
    const { data: target } = await supabase
      .from("questions")
      .select(COLS)
      .eq("is_official", true)
      .eq("id", q)
      .maybeSingle();

    if (target) {
      questions = [target as Question];
      heading = "Practice question";
      sub = target.domain || "Question";

      let similar = supabase
        .from("questions")
        .select(COLS)
        .eq("is_official", true)
        .neq("id", q)
        .limit(11);
      if (target.domain) similar = similar.eq("domain", target.domain);
      const { data: more } = await similar;
      if (more) questions = questions.concat(more as Question[]);
    }
  } else {
    // Solve status is derived from ALL attempts (paginated past the 1000-row cap).
    const statuses = statusVal !== "all" ? computeStatuses(await fetchAttempts(supabase, user.id)) : null;

    // Candidate ids for the scope — id-only, so paginating the full bank is cheap.
    const ids: string[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      let idQuery = supabase.from("questions").select("id").eq("is_official", true);
      if (section) idQuery = idQuery.eq("section", section);
      if (domain) idQuery = idQuery.eq("domain", domain);
      if (skill) idQuery = idQuery.eq("skill", skill);
      if (difficulty) idQuery = idQuery.eq("difficulty", difficulty);
      const { data } = await idQuery.range(from, from + PAGE - 1);
      const rows = (data ?? []) as { id: string }[];
      ids.push(...rows.map((r) => r.id));
      if (rows.length < PAGE) break;
    }

    const chosen = statuses
      ? ids.filter((id) => {
          if (statusVal === "unsolved") return !statuses.answered.has(id);
          if (statusVal === "missed") return statuses.missed.has(id);
          return statuses.solved.has(id); // solved = correct at least once
        })
      : ids;

    const pick = chosen.slice(0, 12);
    if (pick.length > 0) {
      const { data: full } = await supabase.from("questions").select(COLS).in("id", pick);
      questions = (full ?? []) as Question[];
    }

    const parts: string[] = [];
    if (domain) parts.push(domain);
    else if (section) parts.push(section === "math" ? "Math" : "Reading & Writing");
    if (skill) parts.push(skill);
    if (parts.length) heading = `Practice: ${parts.join(" · ")}`;
    if (statusVal !== "all")
      sub = `${statusVal[0].toUpperCase() + statusVal.slice(1)} questions${difficulty ? ` · ${difficulty}` : ""}`;
    else if (difficulty) sub = `${difficulty[0].toUpperCase() + difficulty.slice(1)} difficulty`;
  }

  return (
    <div className="dash-page">
      <div className="dash-head">
        <div>
          <h1 className="dash-title">{heading}</h1>
          <p className="dash-sub">{sub}</p>
        </div>
      </div>
      <StudySession questions={questions} />
    </div>
  );
}



