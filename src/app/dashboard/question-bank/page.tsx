import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import BankFilters from "@/components/dashboard/BankFilters";
import { computeStatuses } from "@/lib/question-status";

export const dynamic = "force-dynamic";

const SECTION_ORDER = [
  { key: "reading_writing", label: "Reading & Writing" },
  { key: "math", label: "Math" },
] as const;

const DOMAIN_ORDER: Record<string, string[]> = {
  reading_writing: [
    "Information and Ideas",
    "Craft and Structure",
    "Expression of Ideas",
    "Standard English Conventions",
  ],
  math: [
    "Algebra",
    "Advanced Math",
    "Problem-Solving and Data Analysis",
    "Geometry and Trigonometry",
  ],
};

type Q = {
  id: string;
  section: string;
  domain: string;
  skill: string | null;
  difficulty: string;
};

type Search = {
  status?: string;
  difficulty?: string;
};

export default async function QuestionBankPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return null;

  const sp = await searchParams;
  const status =
    sp.status === "solved" || sp.status === "missed" ? sp.status : sp.status === "all" ? "all" : "unsolved";
  const difficulty =
    sp.difficulty === "easy" || sp.difficulty === "medium" || sp.difficulty === "hard"
      ? sp.difficulty
      : "";

  // Fetch ALL official questions (paginate past PostgREST's 1000-row cap).
  const questions: Q[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase
      .from("questions")
      .select("id, section, domain, skill, difficulty")
      .eq("is_official", true)
      .range(from, from + PAGE - 1);
    const rows = (data ?? []) as Q[];
    questions.push(...rows);
    if (rows.length < PAGE) break;
  }

  // Fetch ALL of the user's attempts (paginate past the 1000-row cap too).
  const attempts: { question_id: string | null; is_correct: boolean | null }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase
      .from("practice_attempts")
      .select("question_id, is_correct")
      .eq("user_id", user.id)
      .range(from, from + PAGE - 1);
    const rows = (data ?? []) as typeof attempts;
    attempts.push(...rows);
    if (rows.length < PAGE) break;
  }

  // Per question: answered / solved (correct at least once) / missed (wrong at least once).
  const statuses = computeStatuses(attempts);
  const answeredCount = statuses.answered.size;

  type Stat = { total: number; answered: number; solved: number; missed: number };
  const domainStat = new Map<string, Stat>();
  const sectionStat = new Map<string, Stat>();

  for (const q of (questions ?? []) as Q[]) {
    if (difficulty && q.difficulty !== difficulty) continue;

    const dKey = q.domain;
    const secKey = q.section;

    for (const [key, map] of [
      [dKey, domainStat],
      [secKey, sectionStat],
    ] as [string, Map<string, Stat>][]) {
      const s = map.get(key) || { total: 0, answered: 0, solved: 0, missed: 0 };
      s.total += 1;
      if (statuses.answered.has(q.id)) s.answered += 1;
      if (statuses.solved.has(q.id)) s.solved += 1;
      if (statuses.missed.has(q.id)) s.missed += 1;
      map.set(key, s);
    }
  }

  function displayCount(s: Stat | undefined): number {
    if (!s) return 0;
    if (status === "unsolved") return s.total - s.answered;
    if (status === "solved") return s.solved;
    if (status === "missed") return s.missed;
    return s.total;
  }

  const practiceHref = (scope: { section?: string; domain?: string; skill?: string }) => {
    const p = new URLSearchParams();
    if (scope.section) p.set("section", scope.section);
    if (scope.domain) p.set("domain", scope.domain);
    if (scope.skill) p.set("skill", scope.skill);
    if (difficulty) p.set("difficulty", difficulty);
    if (status !== "all") p.set("status", status);
    const qs = p.toString();
    return `/dashboard/session${qs ? `?${qs}` : ""}`;
  };

  const totalQuestions = (questions ?? []).length;
  const pct = totalQuestions ? Math.round((answeredCount / totalQuestions) * 100) : 0;
  const visibleTotal = SECTION_ORDER.reduce(
    (sum, s) => sum + displayCount(sectionStat.get(s.key)),
    0
  );


  return (
    <div className="dash-page">
      <div className="dash-head">
        <div>
          <h1 className="dash-title">Question Bank</h1>
          <p className="dash-sub">Official College Board</p>
        </div>
      </div>

      <div className="bank-progress">
        <div className="bank-progress-text">
          <strong>{answeredCount.toLocaleString()}</strong> of{" "}
          {totalQuestions.toLocaleString()} answered · {pct}% of the bank
        </div>
        <div className="bank-progress-bar">
          <span style={{ width: `${pct}%` }} />
        </div>
      </div>

      <BankFilters status={status} difficulty={difficulty} />

      {visibleTotal === 0 ? (
        <div className="dash-empty">
          <p>No questions match this filter. Try a different status or difficulty.</p>
        </div>
      ) : (
        <div className="bank-tree">
          {SECTION_ORDER.map((section) => {
          const domains = (DOMAIN_ORDER[section.key] ?? [])
            .map((domain) => {
              const skills = (questions ?? [])
                .filter(
                  (q) =>
                    q.section === section.key &&
                    q.domain === domain &&
                    (!difficulty || q.difficulty === difficulty)
                )
                .reduce<Map<string, Stat>>((acc, q) => {
                  const key = q.skill ?? "General";
                  const s = acc.get(key) || { total: 0, answered: 0, solved: 0, missed: 0 };
                  s.total += 1;
                  if (statuses.answered.has(q.id)) s.answered += 1;
                  if (statuses.solved.has(q.id)) s.solved += 1;
                  if (statuses.missed.has(q.id)) s.missed += 1;
                  acc.set(key, s);
                  return acc;
                }, new Map());

              const skillList = [...skills.entries()]
                .map(([skill, s]) => ({ skill, count: displayCount(s) }))
                .sort((a, b) => b.count - a.count);

              return {
                domain,
                count: displayCount(domainStat.get(domain)),
                skills: skillList,
              };
            })
            .filter((d) => d.count > 0);

          const secCount = displayCount(sectionStat.get(section.key));

          return (
            <section className="bank-section" key={section.key}>
              <div className="bank-section-head">
                <div>
                  <h2 className="bank-section-title">{section.label}</h2>
                  <span className="bank-section-count">
                    {secCount.toLocaleString()} question{secCount === 1 ? "" : "s"}
                  </span>
                </div>
                <Link
                  className="btn btn-ghost bank-practice-all"
                  href={practiceHref({ section: section.key })}
                >
                  Practice all {section.label}
                </Link>
              </div>

              <div className="bank-domains">
                {domains.map((domain) => (
                  <details className="bank-domain" key={domain.domain} open>
                    <summary>
                      <span className="bank-domain-name">{domain.domain}</span>
                      <span className="bank-domain-count">
                        {domain.count.toLocaleString()} question{domain.count === 1 ? "" : "s"}
                      </span>
                    </summary>
                    <div className="bank-skills">
                      {domain.skills.map((skill) => (
                        <Link
                          className="bank-skill"
                          key={skill.skill}
                          href={practiceHref({
                            section: section.key,
                            domain: domain.domain,
                            skill: skill.skill,
                          })}
                        >
                          <span className="bank-skill-name">{skill.skill}</span>
                          <span className="bank-skill-count">{skill.count}</span>
                        </Link>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </section>
          );
        })}
        </div>
      )}
    </div>
  );
}

