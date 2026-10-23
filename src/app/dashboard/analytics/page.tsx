import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import { CountUp, Reveal } from "@/components/Reveal";
import AccBars from "@/components/dashboard/AccBars";
import ActivityChart from "@/components/dashboard/ActivityChart";
import ScoreTrend from "@/components/dashboard/ScoreTrend";
import ScoreProjection from "@/components/dashboard/ScoreProjection";

export const dynamic = "force-dynamic";

const DOMAINS = [
  "Information and Ideas",
  "Craft and Structure",
  "Expression of Ideas",
  "Standard English Conventions",
  "Algebra",
  "Advanced Math",
  "Problem-Solving and Data Analysis",
  "Geometry and Trigonometry",
];

type Stat = { correct: number; total: number };
type Attempt = {
  question_id: string | null;
  section: string | null;
  domain: string | null;
  is_correct: boolean | null;
  created_at: string;
};

function acc(s: Stat | undefined): number | null {
  if (!s || s.total === 0) return null;
  return Math.round((s.correct / s.total) * 100);
}

export default async function AnalyticsPage() {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return null;

  // The goal line on the trend chart. Barely needed once a student has a dozen
  // mocks, but it is what makes a one- or two-point chart mean something.
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("target_score, test_date")
    .eq("id", user.id)
    .maybeSingle();
  const targetScore = profileRow?.target_score ?? null;
  const testDate = (profileRow?.test_date as string | null) ?? null;

  const { data: noteRows } = await supabase
    .from("attempt_notes")
    .select("reason")
    .eq("user_id", user.id);
  const reasonCounts = new Map<string, number>();
  for (const row of noteRows ?? []) {
    reasonCounts.set(row.reason, (reasonCounts.get(row.reason) ?? 0) + 1);
  }
  const reasonLabels: Record<string, string> = {
    content_gap: "Content gap",
    process_slip: "Process slip",
    misread: "Misread",
    time_pressure: "Time pressure",
  };
  const reasonRows = [...reasonCounts.entries()].sort((a, b) => b[1] - a[1]);

  const { data: attempts } = await supabase
    .from("practice_attempts")
    .select("question_id, section, domain, is_correct, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  const list = (attempts ?? []) as Attempt[];

  // Counting rule, shared with the right rail and the boss/leaderboard views:
  // every question counts ONCE, and its status is decided by its latest attempt.
  // `list` is oldest → newest, so the last write per question_id wins.
  const latestByQuestion = new Map<string, Attempt>();
  for (const a of list) {
    if (a.question_id) latestByQuestion.set(a.question_id, a);
  }
  const latest = [...latestByQuestion.values()];

  // All completed tests, oldest → newest (paginated past the 1000-row cap).
  const tests: { id: string; total_score: number | null; rw_score: number | null; math_score: number | null; started_at: string; completed_at: string }[] = [];
  {
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data } = await supabase
        .from("test_sessions")
        .select("id, total_score, rw_score, math_score, started_at, completed_at")
        .eq("user_id", user.id)
        .eq("status", "completed")
        .order("completed_at", { ascending: true })
        .range(from, from + PAGE - 1);
      const rows = (data ?? []) as typeof tests;
      tests.push(...rows);
      if (rows.length < PAGE) break;
    }
  }

  const trendPoints = tests.map((t) => ({
    label: new Date(t.completed_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    total: t.total_score ?? null,
    rw: t.rw_score ?? null,
    math: t.math_score ?? null,
  }));
  const hasTrend = trendPoints.some((p) => p.total !== null || p.rw !== null || p.math !== null);

  // Newest-first for the history list.
  const history = [...tests].reverse();

  // Resolve skill + difficulty via the questions table. The id list must be
  // chunked: one `.in()` carrying hundreds of uuids produces a URL too long for
  // the REST gateway (400 Bad Request), and because the error was not surfaced
  // the skill and difficulty sections silently came up empty for anyone with a
  // few hundred questions. Same 500-per-request idiom as the review queue.
  const qids = [...latestByQuestion.keys()];
  const qmap = new Map<string, { id: string; skill: string | null; difficulty: string | null; domain: string | null }>();
  for (let index = 0; index < qids.length; index += 500) {
    const { data } = await supabase
      .from("questions")
      .select("id, skill, difficulty, domain")
      .in("id", qids.slice(index, index + 500));
    for (const question of data ?? []) qmap.set(question.id, question);
  }

  const domainMap = new Map<string, Stat>();
  const sectionMap = new Map<string, Stat>();
  const skillMap = new Map<string, Stat>();
  const skillDomain = new Map<string, string>();
  const diffMap = new Map<string, Stat>();

  for (const a of latest) {
    const q = a.question_id ? qmap.get(a.question_id) : null;

    const d = a.domain || "Other";
    const ds = domainMap.get(d) || { correct: 0, total: 0 };
    ds.total += 1;
    if (a.is_correct) ds.correct += 1;
    domainMap.set(d, ds);

    if (a.section) {
      const label = a.section === "math" ? "Math" : "Reading & Writing";
      const ss = sectionMap.get(label) || { correct: 0, total: 0 };
      ss.total += 1;
      if (a.is_correct) ss.correct += 1;
      sectionMap.set(label, ss);
    }

    const skill = q?.skill?.trim();
    if (skill) {
      const ks = skillMap.get(skill) || { correct: 0, total: 0 };
      ks.total += 1;
      if (a.is_correct) ks.correct += 1;
      skillMap.set(skill, ks);
      // Remember which domain the skill belongs to, so the report can group it.
      if (!skillDomain.has(skill)) skillDomain.set(skill, q?.domain?.trim() || a.domain || "Other");
    }

    const diff = q?.difficulty;
    if (diff) {
      const df = diffMap.get(diff) || { correct: 0, total: 0 };
      df.total += 1;
      if (a.is_correct) df.correct += 1;
      diffMap.set(diff, df);
    }
  }

  const total = latest.length;
  const correct = latest.filter((a) => a.is_correct).length;
  const overall = total ? Math.round((correct / total) * 100) : null;

  // Every row links into a practice session scoped to that slice, so the page
  // is not just a report — the weakest row is one click from being drilled.
  const practiceHref = (params: Record<string, string>) =>
    `/dashboard/session?${new URLSearchParams(params).toString()}`;

  const domains = DOMAINS.map((d) => ({
    label: d,
    accuracy: acc(domainMap.get(d)),
    total: domainMap.get(d)?.total ?? 0,
    href: practiceHref({ domain: d }),
  }))
    .filter((d) => d.total > 0)
    .sort((a, b) => (a.accuracy ?? -1) - (b.accuracy ?? -1));

  const sections = ["Math", "Reading & Writing"]
    .map((label) => ({
      label,
      accuracy: acc(sectionMap.get(label)),
      total: sectionMap.get(label)?.total ?? 0,
      href: practiceHref({ section: label === "Math" ? "math" : "reading_writing" }),
    }))
    .filter((s) => s.total > 0)
    .sort((a, b) => (a.accuracy ?? -1) - (b.accuracy ?? -1));

  // Skill labels are very granular, and a skill seen once says nothing: show the
  // weakest skills with a real sample, and say how many were left out.
  const MIN_SKILL_SAMPLE = 3;
  const SKILL_ROWS = 12;
  const skillRows = [...skillMap.entries()]
    .map(([label, s]) => ({
      label,
      accuracy: acc(s),
      total: s.total,
      href: practiceHref({ skill: label }),
      domain: skillDomain.get(label) ?? "Other",
    }))
    .filter((s) => s.total >= MIN_SKILL_SAMPLE)
    .sort((a, b) => (a.accuracy ?? -1) - (b.accuracy ?? -1));
  const skills = skillRows.slice(0, SKILL_ROWS);
  const hiddenSkills = skillRows.length - skills.length;
  const thinSkills = [...skillMap.values()].filter((s) => s.total < MIN_SKILL_SAMPLE).length;

  // The same rows, tucked under the domain they belong to: "Linear equations in
  // one variable" says little until you can see it sits inside Algebra. Domains
  // keep the SAT's own order so this reads like the section above it, and rows
  // stay weakest-first inside each group.
  const strip = ({ label, accuracy, total, href }: (typeof skills)[number]) => ({ label, accuracy, total, href });
  const knownDomains = DOMAINS as readonly string[];
  const skillGroups = DOMAINS.map((domain) => ({
    domain,
    items: skills.filter((s) => s.domain === domain).map(strip),
  }))
    .filter((group) => group.items.length > 0)
    .concat(
      skills.some((s) => !knownDomains.includes(s.domain))
        ? [{ domain: "Other", items: skills.filter((s) => !knownDomains.includes(s.domain)).map(strip) }]
        : []
    );

  const difficulties = ["easy", "medium", "hard"]
    .map((label) => ({
      label: label[0].toUpperCase() + label.slice(1),
      accuracy: acc(diffMap.get(label)),
      total: diffMap.get(label)?.total ?? 0,
      href: practiceHref({ difficulty: label }),
    }))
    .filter((d) => d.total > 0);

  // Last 14 days activity — same counting rule: one bar entry per question, on
  // the day of its latest attempt.
  const dayLabels: string[] = [];
  const dayMap = new Map<string, Stat>();
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    dayLabels.push(key);
    dayMap.set(key, { correct: 0, total: 0 });
  }
  for (const a of latest) {
    const key = new Date(a.created_at).toISOString().slice(0, 10);
    const s = dayMap.get(key);
    if (s) {
      s.total += 1;
      if (a.is_correct) s.correct += 1;
    }
  }
  const days = dayLabels.map((key) => {
    const s = dayMap.get(key)!;
    return {
      label: new Date(key + "T00:00:00").toLocaleDateString(undefined, {
        day: "numeric",
      }),
      count: s.total,
      accuracy: acc(s),
    };
  });

  // Week-over-week so the chart answers "am I doing more or less?" at a glance.
  const thisWeek = days.slice(7).reduce((sum, d) => sum + d.count, 0);
  const lastWeek = days.slice(0, 7).reduce((sum, d) => sum + d.count, 0);


  return (
    <div className="dash-page">
      <div className="dash-head">
        <div>
          <h1 className="dash-title">Analytics</h1>
          <p className="dash-sub">Your accuracy across every SAT domain, skill and difficulty. Each question counts once, by your latest attempt — click any row to practice it.</p>
        </div>
      </div>

      <div className="dash-stat-grid">
        <Reveal>
          <div className="dash-stat-card">
            <span className="dash-stat-label">Overall accuracy</span>
            <span className="dash-stat-value accent">
              {overall !== null ? <CountUp to={overall} suffix="%" /> : "—"}
            </span>
          </div>
        </Reveal>
        <Reveal delay={0.06}>
          <div className="dash-stat-card">
            <span className="dash-stat-label">Questions answered</span>
            <span className="dash-stat-value">
              <CountUp to={total} />
            </span>
          </div>
        </Reveal>
        <Reveal delay={0.12}>
          <div className="dash-stat-card">
            <span className="dash-stat-label">Correct</span>
            <span className="dash-stat-value">
              <CountUp to={correct} />
            </span>
          </div>
        </Reveal>
        <Reveal delay={0.18}>
          <div className="dash-stat-card">
            <span className="dash-stat-label">Missed</span>
            <span className="dash-stat-value">
              <CountUp to={total - correct} />
            </span>
          </div>
        </Reveal>
      </div>

      <Reveal>
        <div className="dash-card">
          <div className="dash-card-head">
            <h2 className="dash-section-title">Activity — last 14 days</h2>
            {total > 0 && (
              <span className="dash-sub analytics-note">
                {thisWeek} {thisWeek === 1 ? "question" : "questions"} in the last 7 days
                {lastWeek > 0 && (
                  <>
                    {" · "}
                    {thisWeek === lastWeek
                      ? "same as the week before"
                      : `${Math.abs(thisWeek - lastWeek)} ${thisWeek > lastWeek ? "more" : "fewer"} than the week before`}
                  </>
                )}
              </span>
            )}
          </div>
          {total === 0 ? (
            <p className="dash-sub">Answer some questions to see your activity chart.</p>
          ) : (
            <ActivityChart days={days} />
          )}
        </div>
      </Reveal>

      <Reveal>
        <div className="dash-card">
          <h2 className="dash-section-title">📈 Score trend</h2>
          {hasTrend ? (
            <ScoreTrend points={trendPoints} target={targetScore} />
          ) : (
            <p className="dash-sub">
              No scored practice tests yet — finish a full-length mock and your trend line appears here.
            </p>
          )}
        </div>
      </Reveal>

      <Reveal>
        <ScoreProjection
          points={tests.map((test) => ({
            total: test.total_score,
            rw: test.rw_score,
            math: test.math_score,
            completed_at: test.completed_at,
          }))}
          testDate={testDate}
          target={targetScore}
        />
      </Reveal>

      <Reveal>
        <div className="dash-card">
          <h2 className="dash-section-title">🧭 Why you miss</h2>
          <p className="dash-sub">
            Tag a missed question in the review queue and the pattern shows up here. The plan should fix the cause, not just the question.
          </p>
          {reasonRows.length === 0 ? (
            <p className="dash-sub">No reasons tagged yet — open the review queue and mark why a miss happened.</p>
          ) : (
            <ul className="reason-bars">
              {reasonRows.map(([reason, count]) => (
                <li key={reason}>
                  <span>{reasonLabels[reason] ?? reason}</span>
                  <div aria-hidden="true"><span style={{ width: `${Math.max(6, (count / Math.max(1, ...reasonRows.map(([, n]) => n))) * 100)}%` }} /></div>
                  <strong>{count}</strong>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Reveal>

      <Reveal>
        <div className="dash-card">
          <h2 className="dash-section-title">📈 Practice test history</h2>
          {history.length === 0 ? (
            <p className="dash-sub">
              No practice tests yet. Take one to start tracking your score.
            </p>
          ) : (
            <ul className="score-history">
              {history.map((t, i) => (
                <li className="score-row" key={t.id ?? i}>
                  {/* An overlay link keeps the three-column grid intact while making
                      the whole row the way into that test's mistake review. */}
                  <Link
                    className="score-row-link"
                    href={`/dashboard/test/review?test=${t.id}`}
                    title="Review this test's mistakes"
                    aria-label={`Review mistakes from the test scored ${t.total_score ?? "unscored"}`}
                  />
                  <span className="score-date">
                    {new Date(t.completed_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  <span className="score-parts">
                    RW {t.rw_score ?? "—"} · Math {t.math_score ?? "—"}
                  </span>
                  <strong className="score-total">{t.total_score ?? "—"}</strong>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Reveal>

      <div className="analytics-grid">
        <Reveal>
          <div className="dash-card">
            <h2 className="dash-section-title">Section breakdown</h2>
            {total === 0 ? <p className="dash-sub">No data yet.</p> : <AccBars items={sections} />}
          </div>
        </Reveal>
        <Reveal>
          <div className="dash-card">
            <h2 className="dash-section-title">Difficulty</h2>
            {total === 0 ? <p className="dash-sub">No data yet.</p> : <AccBars items={difficulties} />}
          </div>
        </Reveal>
      </div>

      <Reveal>
        <div className="dash-card">
          <h2 className="dash-section-title">Domain breakdown</h2>
          {total === 0 ? (
            <p className="dash-sub">Answer some questions to see your performance per domain.</p>
          ) : (
            <AccBars items={domains} />
          )}
        </div>
      </Reveal>

      <Reveal>
        <div className="dash-card">
          <div className="dash-card-head">
            <h2 className="dash-section-title">Skills by domain — weakest first</h2>
            {skills.length > 0 && (
              <span className="dash-sub analytics-note">
                {hiddenSkills > 0 && `${hiddenSkills} more with ${MIN_SKILL_SAMPLE}+ questions · `}
                {thinSkills > 0 &&
                  `${thinSkills} ${thinSkills === 1 ? "skill has" : "skills have"} fewer than ${MIN_SKILL_SAMPLE} questions so far`}
              </span>
            )}
          </div>
          <p className="dash-sub analytics-note">
            A domain is a broad SAT area, like Algebra or Craft and Structure. A skill is one
            specific ability inside it — each skill below sits under the domain it belongs to.
          </p>
          {skills.length === 0 ? (
            <p className="dash-sub">
              Answer at least {MIN_SKILL_SAMPLE} questions in a skill to see it here.
            </p>
          ) : (
            <div className="skill-groups">
              {skillGroups.map((group) => (
                <div className="skill-group" key={group.domain}>
                  <h3 className="skill-group-title">{group.domain}</h3>
                  <AccBars items={group.items} />
                </div>
              ))}
            </div>
          )}
        </div>
      </Reveal>
    </div>
  );
}

