import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import BankFilters from "@/components/dashboard/BankFilters";
import { getQuestionCollection, QUESTION_COLLECTIONS } from "@/lib/question-collections";

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

type Stat = { total: number; answered: number; solved: number; missed: number };
type Summary = Stat & { section: string; domain: string; skill: string | null; difficulty: string };

type Search = {
  collection?: string;
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
  const collection = getQuestionCollection(sp.collection);
  const status =
    sp.status === "solved" || sp.status === "missed" ? sp.status : sp.status === "all" ? "all" : "unsolved";
  const difficulty =
    sp.difficulty === "easy" || sp.difficulty === "medium" || sp.difficulty === "hard"
      ? sp.difficulty
      : "";

  const { data, error } = await supabase.rpc("question_bank_summary", { p_sources: collection?.sourceIds ?? null });
  if (error) throw new Error("Could not load the question bank.");
  const summaries = (data ?? []) as Summary[];
  const answeredCount = summaries.reduce((sum,row) => sum + Number(row.answered), 0);
  const domainStat = new Map<string, Stat>();
  const sectionStat = new Map<string, Stat>();
  const add = (target: Stat, row: Stat) => {
    for (const key of ["total","answered","solved","missed"] as const) target[key] += Number(row[key]);
    return target;
  };
  const empty = (): Stat => ({ total: 0, answered: 0, solved: 0, missed: 0 });
  for (const row of summaries) {
    if (difficulty && row.difficulty !== difficulty) continue;
    domainStat.set(row.domain, add(domainStat.get(row.domain) ?? empty(), row));
    sectionStat.set(row.section, add(sectionStat.get(row.section) ?? empty(), row));
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
    if (collection) p.set("collection", collection.id);
    if (scope.section) p.set("section", scope.section);
    if (scope.domain) p.set("domain", scope.domain);
    if (scope.skill) p.set("skill", scope.skill);
    if (difficulty) p.set("difficulty", difficulty);
    if (status !== "all") p.set("status", status);
    const qs = p.toString();
    return `/dashboard/session${qs ? `?${qs}` : ""}`;
  };

  const totalQuestions = summaries.reduce((sum,row) => sum + Number(row.total), 0);
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
          <p className="dash-sub">{collection?.title ?? "Official College Board"}</p>
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

      <BankFilters status={status} difficulty={difficulty} collection={collection?.id ?? ""}
        collections={QUESTION_COLLECTIONS.map((item) => ({ id: item.id, title: item.title, count: item.sourceIds.length }))} />

      {visibleTotal === 0 ? (
        <div className="dash-empty">
          <p>No questions match this filter. Try a different status or difficulty.</p>
        </div>
      ) : (
        <div className="bank-tree">
          {SECTION_ORDER.map((section) => {
          const domains = (DOMAIN_ORDER[section.key] ?? [])
            .map((domain) => {
              const skills = summaries
                .filter(
                  (q) =>
                    q.section === section.key &&
                    q.domain === domain &&
                    (!difficulty || q.difficulty === difficulty)
                )
                .reduce<Map<string, Stat>>((acc, q) => {
                  const key = q.skill ?? "General";
                  acc.set(key, add(acc.get(key) ?? empty(), q));
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
