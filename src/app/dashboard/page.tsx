import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import { CountUp, Reveal } from "@/components/Reveal";
import Magnetic from "@/components/Magnetic";
import DashboardGoals from "@/components/dashboard/DashboardGoals";
import { ExamCountdown, DaysUntilExam, ExamDateProvider } from "@/components/dashboard/ExamDate";
import WeeklyPlan from "@/components/dashboard/WeeklyPlan";
import { Suspense } from "react";
import ContributionGraph from "@/components/dashboard/ContributionGraph";
import { getProgressSummary } from "@/lib/progress-summary";

export const dynamic = "force-dynamic";

export default async function DashboardHome() {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return null;

  const profileQuery = supabase
    .from("profiles")
    .select("full_name, target_score, test_date, current_score")
    .eq("id", user.id)
    .single();

  const diagnosticQuery = supabase
    .from("diagnostics")
    .select("total_score, rw_score, math_score, completed_at")
    .eq("user_id", user.id)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const [{data:profile,error:profileError},{data:diagnostic,error:diagnosticError},progress] = await Promise.all([profileQuery,diagnosticQuery,getProgressSummary()]);
  if(profileError || diagnosticError) throw new Error("Could not load your dashboard.");
  const n=progress.attempts;
  const accuracy=n ? progress.accuracy : null;
  const name=profile?.full_name?.split(" ")[0] || "there";
  const isNew=!diagnostic && n===0;
  const heatDays=progress.days;
  const {streak,xp,level}=progress;

  return (
    <div className="dash-page">
      {/* The test date lives on the client so saving a goal moves every
          countdown on the page immediately — see ExamDate.tsx. */}
      <ExamDateProvider initial={profile?.test_date ?? null}>
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
            <ExamCountdown />
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
              <DaysUntilExam />
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
          <Suspense fallback={<div role="status">Loading study plan...</div>}>
            <WeeklyPlan />
          </Suspense>
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
      </ExamDateProvider>
    </div>
  );
}
