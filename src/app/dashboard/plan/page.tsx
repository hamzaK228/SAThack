import { CountUp, Reveal } from "@/components/Reveal";
import PlanChecklist from "@/components/dashboard/PlanChecklist";
import RegeneratePlanButton from "@/components/dashboard/RegeneratePlanButton";
import { getStudyPlan } from "@/lib/study-plan-data";
import { taskKey } from "@/lib/plan";

export const dynamic = "force-dynamic";

export default async function PlanPage() {
  // Same engine the dashboard preview uses — see src/lib/study-plan-data.ts.
  const bundle = await getStudyPlan();
  if (!bundle) return null;
  const { plan } = bundle;

  const weeks = Array.from({ length: plan.weeks }, (_, i) => i + 1).map((w) => ({
    week: w,
    tasks: plan.tasks.filter((t) => t.week === w),
  }));
  const thisWeek = weeks.find((w) => w.week === 1)?.tasks ?? [];
  const totalDone = plan.tasks.filter((t) => plan.done[taskKey(t)]).length;


  return (
    <div className="dash-page">
      <div className="dash-head">
        <div>
          <h1 className="dash-title">Study plan</h1>
          <p className="dash-sub">
            {plan.source === "ai"
              ? "✨ AI-generated from your score, mistakes and the SAT books."
              : "Personalized from your score, mistakes and the SAT books."}
            {plan.daysLeft !== null ? ` · ${plan.daysLeft} days until test day` : ""}
          </p>
        </div>
        <RegeneratePlanButton />
      </div>

      <Reveal>
        <div className="dash-card plan-progress-card">
          <div className="checklist-progress">
            <div
              className="checklist-bar"
              role="progressbar"
              aria-valuenow={plan.tasks.length ? Math.round((totalDone / plan.tasks.length) * 100) : 0}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span
                style={{
                  width: `${plan.tasks.length ? Math.round((totalDone / plan.tasks.length) * 100) : 0}%`,
                }}
              />
            </div>
            <span className="checklist-count">
              {totalDone}/{plan.tasks.length} tasks done · this week{" "}
              {thisWeek.filter((t) => plan.done[taskKey(t)]).length}/{thisWeek.length}
            </span>
          </div>
        </div>
      </Reveal>

      <div className="dash-stat-grid">
        <Reveal>
          <div className="dash-stat-card">
            <span className="dash-stat-label">Current</span>
            <span className="dash-stat-value">
              {plan.currentScore ? <CountUp to={plan.currentScore} /> : "—"}
            </span>
          </div>
        </Reveal>
        <Reveal delay={0.06}>
          <div className="dash-stat-card">
            <span className="dash-stat-label">Target</span>
            <span className="dash-stat-value">
              <CountUp to={plan.targetScore} />
            </span>
          </div>
        </Reveal>
        <Reveal delay={0.12}>
          <div className="dash-stat-card">
            <span className="dash-stat-label">Gap</span>
            <span className="dash-stat-value accent">
              {plan.gap !== null ? (
                <CountUp to={Math.max(0, plan.gap)} />
              ) : (
                "—"
              )}
            </span>
          </div>
        </Reveal>
        <Reveal delay={0.18}>
          <div className="dash-stat-card">
            <span className="dash-stat-label">Weeks</span>
            <span className="dash-stat-value">
              <CountUp to={plan.weeks} />
            </span>
          </div>
        </Reveal>
      </div>

      <Reveal>
        <div className="dash-card dash-plan-summary">
          <p className="eyebrow">Your strategy</p>
          <p className="plan-summary-text">{plan.summary}</p>
        </div>
      </Reveal>

      <div className="analytics-grid">
        <Reveal>
          <div className="dash-card">
            <h2 className="dash-section-title">📉 Weaknesses</h2>
            {plan.weaknesses.length ? (
              <ul className="plan-bullets">
                {plan.weaknesses.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : (
              <p className="dash-sub">Answer a few questions to reveal your weak spots.</p>
            )}
          </div>
        </Reveal>
        <Reveal>
          <div className="dash-card">
            <h2 className="dash-section-title">💪 Strengths</h2>
            {plan.strengths.length ? (
              <ul className="plan-bullets">
                {plan.strengths.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            ) : (
              <p className="dash-sub">No strong areas yet — keep practicing.</p>
            )}
          </div>
        </Reveal>
      </div>

      <div className="analytics-grid">
        <Reveal>
          <div className="dash-card">
            <h2 className="dash-section-title">💡 Insights</h2>
            <ul className="plan-bullets">
              {plan.insights.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </div>
        </Reveal>
        <Reveal>
          <div className="dash-card">
            <h2 className="dash-section-title">📚 From the SAT books</h2>
            <ul className="plan-bullets plan-tips">
              {plan.tips.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>

      <Reveal>
        <div className="dash-card">
          <h2 className="dash-section-title">🔍 Your priority order</h2>
          <p className="dash-sub" style={{ marginBottom: "1rem" }}>
            Weakest domains first — each week targets the next one on this list.
          </p>
          <div className="plan-focus-grid">
            {plan.focusDomains.map((d, i) => (
              <div className="plan-focus" key={d.domain}>
                <span className="plan-focus-rank">#{i + 1}</span>
                <span className="plan-focus-domain">{d.domain}</span>
                <span className="plan-focus-acc">
                  {d.accuracy !== null ? `${d.accuracy}%` : d.total > 0 ? "—" : "new"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      {weeks.map((w) => (
        <Reveal key={w.week}>
          <div className="dash-card">
            <h2 className="dash-section-title">
              Week {w.week}
              <span className="week-tag">
                {w.week === 1 ? "this week" : w.week === plan.weeks ? "final stretch" : ""}
              </span>
            </h2>
            <PlanChecklist tasks={w.tasks} done={plan.done} showProgress />
          </div>
        </Reveal>
      ))}
    </div>
  );
}

