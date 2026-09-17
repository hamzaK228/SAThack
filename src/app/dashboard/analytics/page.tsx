import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import { CountUp, Reveal } from "@/components/Reveal";
import AccBars from "@/components/dashboard/AccBars";
import ActivityChart from "@/components/dashboard/ActivityChart";
import ScoreTrend from "@/components/dashboard/ScoreTrend";

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

  const { data: attempts } = await supabase
    .from("practice_attempts")
    .select("question_id, section, domain, is_correct, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  const list = (attempts ?? []) as Attempt[];

  // All completed tests, oldest → newest (paginated past the 1000-row cap).
  const tests: { total_score: number | null; rw_score: number | null; math_score: number | null; completed_at: string }[] = [];
  {
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data } = await supabase
        .from("test_sessions")
        .select("total_score, rw_score, math_score, completed_at")
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

  // Resolve skill + difficulty via the questions table.
  const qids = [...new Set(list.map((a) => a.question_id).filter(Boolean))] as string[];
  const { data: qs } = qids.length
    ? await supabase.from("questions").select("id, skill, difficulty").in("id", qids)
    : { data: null };
  const qmap = new Map((qs ?? []).map((q) => [q.id, q]));

  const domainMap = new Map<string, Stat>();
  const sectionMap = new Map<string, Stat>();
  const skillMap = new Map<string, Stat>();
  const diffMap = new Map<string, Stat>();

  for (const a of list) {
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
    }

    const diff = q?.difficulty;
    if (diff) {
      const df = diffMap.get(diff) || { correct: 0, total: 0 };
      df.total += 1;
      if (a.is_correct) df.correct += 1;
      diffMap.set(diff, df);
    }
  }

  const total = list.length;
  const correct = list.filter((a) => a.is_correct).length;
  const overall = total ? Math.round((correct / total) * 100) : null;

  const domains = DOMAINS.map((d) => ({
    label: d,
    accuracy: acc(domainMap.get(d)),
    total: domainMap.get(d)?.total ?? 0,
  })).sort((a, b) => (a.accuracy ?? -1) - (b.accuracy ?? -1));

  const sections = ["Math", "Reading & Writing"]
    .map((label) => ({
      label,
      accuracy: acc(sectionMap.get(label)),
      total: sectionMap.get(label)?.total ?? 0,
    }))
    .sort((a, b) => (a.accuracy ?? -1) - (b.accuracy ?? -1));

  const skills = [...skillMap.entries()]
    .map(([label, s]) => ({ label, accuracy: acc(s), total: s.total }))
    .sort((a, b) => (a.accuracy ?? -1) - (b.accuracy ?? -1));

  const difficulties = ["easy", "medium", "hard"]
    .map((label) => ({
      label: label[0].toUpperCase() + label.slice(1),
      accuracy: acc(diffMap.get(label)),
      total: diffMap.get(label)?.total ?? 0,
    }));

  // Last 14 days activity.
  const dayLabels: string[] = [];
  const dayMap = new Map<string, Stat>();
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    dayLabels.push(key);
    dayMap.set(key, { correct: 0, total: 0 });
  }
  for (const a of list) {
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


  return (
    <div className="dash-page">
      <div className="dash-head">
        <div>
          <h1 className="dash-title">Analytics</h1>
          <p className="dash-sub">Your accuracy across every SAT domain, skill and difficulty.</p>
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
          <h2 className="dash-section-title">Activity — last 14 days</h2>
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
            <ScoreTrend points={trendPoints} />
          ) : (
            <p className="dash-sub">
              No scored practice tests yet — finish a full-length mock and your trend line appears here.
            </p>
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
                <li className="score-row" key={i}>
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
          <h2 className="dash-section-title">Skill breakdown</h2>
          {skills.length === 0 ? (
            <p className="dash-sub">No skill-level data yet.</p>
          ) : (
            <AccBars items={skills} />
          )}
        </div>
      </Reveal>
    </div>
  );
}

