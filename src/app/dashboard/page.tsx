import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CountUp, Reveal } from "@/components/Reveal";
import Magnetic from "@/components/Magnetic";
import DashboardGoals from "@/components/dashboard/DashboardGoals";
import PlanChecklist from "@/components/dashboard/PlanChecklist";
import ContributionGraph from "@/components/dashboard/ContributionGraph";
import { getStudyPlan } from "@/lib/study-plan-data";
import { levelFor, streakFrom, xpFor } from "@/lib/gamification";

export const dynamic = "force-dynamic";

export default async function DashboardHome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, target_score, test_date, current_score")
    .eq("id", user.id)
    .single();

  const { data: diagnostic } = await supabase
    .from("diagnostics")
    .select("total_score, rw_score, math_score, completed_at")
    .eq("user_id", user.id)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { count: totalAttempts } = await supabase
    .from("practice_attempts")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  const { count: correctAttempts } = await supabase
    .from("practice_attempts")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_correct", true);

  // Paginated fetch of attempts (past the 1000-row cap).
  const attempts: { domain: string | null; is_correct: boolean | null; created_at: string }[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase
      .from("practice_attempts")
      .select("domain, is_correct, created_at")
      .eq("user_id", user.id)
      .range(from, from + PAGE - 1);
    const rows = (data ?? []) as typeof attempts;
    attempts.push(...rows);
    if (rows.length < PAGE) break;
  }

  const n = totalAttempts ?? 0;
  const accuracy = n ? Math.round(((correctAttempts ?? 0) / n) * 100) : null;

  const name = profile?.full_name?.split(" ")[0] || "there";
  const isNew = !diagnostic && n === 0;

  let daysLeft: number | null = null;
  if (profile?.test_date) {
    const diff = new Date(profile.test_date).getTime() - new Date().getTime();
    daysLeft = Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  // Per-day activity for the contribution graph.
  const heatDays: Record<string, number> = {};
  for (const a of attempts) {
    const key = new Date(a.created_at).toISOString().slice(0, 10);
    heatDays[key] = (heatDays[key] ?? 0) + 1;
  }

  // Gamification summary (derived — no stored state).
  const { count: testCount } = await supabase
    .from("test_sessions")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "completed");
  const { count: vocabCount } = await supabase
    .from("vocab_progress")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gt("times_seen", 0);
  const activeDays = Object.keys(heatDays).length;
  const { streak } = streakFrom(attempts.map((a) => a.created_at));
  const xp = xpFor({
    attempts: n,
    correct: correctAttempts ?? 0,
    tests: testCount ?? 0,
    vocabReviews: vocabCount ?? 0,
    activeDays,
  });
  const level = levelFor(xp);

  // This week's preview comes from the same AI engine as the Study Plan page,
  // so the two views can never disagree (see src/lib/study-plan-data.ts).
  const bundle = await getStudyPlan();
  if (!bundle) return null;
  const { plan } = bundle;
  const thisWeek = plan.tasks.filter((t) => t.week === 1);

  return (
    <div className="dash-page">
      <div className="dash-head">
        <div>
          <h1 className="dash-title">Welcome back, {name} 👋</h1>
          <p className="dash-sub">
            {profile?.target_score
              ? `You're aiming for a ${profile.target_score}. Let's close the gap.`
              : "Set your goals below to start building your plan."}
          </p>
        </div>
        <div className="dash-head-actions">
          {daysLeft !== null && (
            <div className="dash-countdown">
              <span className="dash-countdown-num">{Math.max(0, daysLeft)}</span>
              <span className="dash-countdown-label">days until SAT</span>
            </div>
          )}
          <Magnetic>
            <Link className="btn btn-primary" href="/dashboard/session">
              Start session →
            </Link>
          </Magnetic>
        </div>
      </div>

      <Reveal>
        <DashboardGoals
          currentScore={profile?.current_score ?? null}
          targetScore={profile?.target_score ?? null}
          testDate={profile?.test_date ?? null}
        />
      </Reveal>

      <div className="dash-stat-grid">
        <Reveal>
          <div className="dash-stat-card">
            <span className="dash-stat-label">Days until SAT</span>
            <span className="dash-stat-value accent">
              {daysLeft !== null ? <CountUp to={Math.max(0, daysLeft)} /> : "—"}
            </span>
            <span className="dash-stat-date">
              {profile?.test_date
                ? new Date(profile.test_date + "T00:00:00").toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })
                : "Set your test date"}
            </span>
          </div>
        </Reveal>
        <Reveal delay={0.06}>
          <div className="dash-stat-card">
            <span className="dash-stat-label">Current score</span>
            <span className="dash-stat-value">
              {profile?.current_score ? <CountUp to={profile.current_score} /> : "—"}
            </span>
          </div>
        </Reveal>
        <Reveal delay={0.12}>
          <div className="dash-stat-card">
            <span className="dash-stat-label">Target score</span>
            <span className="dash-stat-value">
              {profile?.target_score ? <CountUp to={profile.target_score} /> : "—"}
            </span>
          </div>
        </Reveal>
        <Reveal delay={0.18}>
          <div className="dash-stat-card">
            <span className="dash-stat-label">Accuracy</span>
            <span className="dash-stat-value accent">
              {accuracy !== null ? <CountUp to={accuracy} suffix="%" /> : "—"}
            </span>
          </div>
        </Reveal>
      </div>

      <Reveal>
        <Link className="dash-progress" href="/dashboard/leaderboard">
          <span className="dash-progress-badge" aria-hidden="true">
            {level.level}
          </span>
          <span className="dash-progress-info">
            <strong>{level.title}</strong>
            <span>
              {xp.toLocaleString()} XP · 🔥 {streak}-day streak
            </span>
          </span>
          <span className="dash-progress-cta">View progress →</span>
        </Link>
      </Reveal>

      <Reveal>
        <div className="dash-card">
          <h2 className="dash-section-title">🔥 Practice activity</h2>
          <ContributionGraph days={heatDays} />
        </div>
      </Reveal>

      {isNew ? (
        <Reveal>
          <div className="dash-card dash-onboard">
            <h2 className="dash-section-title">🏁 Let&apos;s get started</h2>
            <p className="dash-onboard-text">
              Complete a short diagnostic to find your weak spots and unlock your personal study plan.
            </p>
            <div className="dash-onboard-actions">
              <Link className="btn btn-primary" href="/dashboard/diagnostic">
                🚀 Start diagnostic
              </Link>
              <Link className="btn btn-ghost" href="/dashboard/test">
                📝 Take a practice test
              </Link>
            </div>
          </div>
        </Reveal>
      ) : (
        <Reveal>
          <div className="dash-card">
            <h2 className="dash-section-title">Your score breakdown</h2>
            <div className="dash-score-row">
              <div>
                <span className="dash-score-label">Reading &amp; Writing</span>
                <span className="dash-score-val">{diagnostic?.rw_score ?? "—"}</span>
              </div>
              <div>
                <span className="dash-score-label">Math</span>
                <span className="dash-score-val">{diagnostic?.math_score ?? "—"}</span>
              </div>
            </div>
          </div>
        </Reveal>
      )}

      <Reveal>
        <div className="dash-card">
          <div className="dash-plan-head">
            <h2 className="dash-section-title" style={{ marginBottom: 0 }}>
              📅 This week&apos;s plan
            </h2>
            <Link className="btn btn-ghost" href="/dashboard/plan">
              Full plan →
            </Link>
          </div>
          <PlanChecklist tasks={thisWeek} done={plan.done} />
        </div>
      </Reveal>

      <div className="dash-quick-grid">
        <Link className="dash-quick" href="/dashboard/session">
          <span className="dash-quick-icon">⚡</span>
          <span className="dash-quick-title">Study Session</span>
          <span className="dash-quick-sub">Targeted practice</span>
        </Link>
        <Link className="dash-quick" href="/dashboard/test">
          <span className="dash-quick-icon">▣</span>
          <span className="dash-quick-title">Practice Test</span>
          <span className="dash-quick-sub">Full adaptive mock</span>
        </Link>
        <Link className="dash-quick" href="/dashboard/vocab">
          <span className="dash-quick-icon">Aa</span>
          <span className="dash-quick-title">Vocab</span>
          <span className="dash-quick-sub">Words in context</span>
        </Link>
        <Link className="dash-quick" href="/dashboard/review">
          <span className="dash-quick-icon">↻</span>
          <span className="dash-quick-title">Review Queue</span>
          <span className="dash-quick-sub">Master your misses</span>
        </Link>
      </div>
    </div>
  );
}
