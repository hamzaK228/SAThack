import { Suspense } from "react";
import { CountUp, Reveal } from "@/components/Reveal";
import PlanChecklist from "@/components/dashboard/PlanChecklist";
import RegeneratePlanButton from "@/components/dashboard/RegeneratePlanButton";
import { PlanSkeleton } from "@/components/dashboard/Skeletons";
import { getStudyPlan } from "@/lib/study-plan-data";
import { setStudyMinutes } from "@/app/dashboard/plan-actions";
import PlanAdjustments from "@/components/dashboard/PlanAdjustments";
import { taskKey } from "@/lib/plan";
import { BookOpenCheck, CalendarDays, Clock3, ExternalLink, Gauge, Target } from "lucide-react";

const OFFICIAL_RESOURCES = [
  {
    name: "Bluebook practice tests",
    description: "Take a full-length adaptive SAT in the real test interface.",
    href: "https://bluebook.collegeboard.org/students/practice",
    tag: "Test simulation",
  },
  {
    name: "Student Question Bank",
    description: "Build official question sets by domain, skill, and difficulty.",
    href: "https://satsuitequestionbank.collegeboard.org/",
    tag: "Targeted practice",
  },
  {
    name: "Official SAT Prep on Khan Academy",
    description: "Review concepts with short lessons, examples, and skill practice.",
    href: "https://www.khanacademy.org/test-prep/digital-sat",
    tag: "Learn concepts",
  },
] as const;

const PHASE_LABEL = {
  foundation: "Foundation",
  "skill-building": "Skill building",
  "test-readiness": "Test readiness",
  taper: "Final taper",
} as const;

export const dynamic = "force-dynamic";

export default function PlanPage() {
  // Same engine the dashboard preview uses — see src/lib/study-plan-data.ts.
  // The body streams separately: when the narrative needs an AI regeneration
  // this page still paints instantly (it can take ~30s after new practice).
  return (
    <div className="dash-page">
      <div className="dash-head">
        <div>
          <h1 className="dash-title">Study plan</h1>
          <p className="dash-sub">
            Built from your score, mistakes and the SAT books — rebalanced whenever your accuracy
            shifts.
          </p>
        </div>
        <RegeneratePlanButton />
      </div>
      <Suspense fallback={<PlanSkeleton />}>
        <PlanBody />
      </Suspense>
    </div>
  );
}

async function PlanBody() {
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
    <>
      <p className="dash-sub" style={{ marginTop: 0 }}>
        {plan.source === "ai"
          ? "✨ Built from your score, your mistakes and the SAT books."
          : "Personalized from your score, mistakes and the SAT books."}
        {plan.daysLeft !== null ? ` · ${plan.daysLeft} days until test day` : ""}
        {" · domains you have already drilled today are ticked for you."}
      </p>

      <Reveal>
        <section className="plan-command" aria-label="Plan overview">
          <div className="plan-command-main">
            <span className="plan-command-icon"><Target size={22} /></span>
            <div>
              <span className="plan-command-label">Your weekly pace</span>
              <strong>{plan.studyDaysPerWeek} study days · about {plan.dailyMinutes} min a day</strong>
              <p>{plan.daysLeft === null ? "Set a test date in Settings and the workload will automatically rebalance." : `${plan.daysLeft} days left. The plan gets more test-focused as your date approaches.`}</p>
            </div>
          </div>
          <div className="plan-command-metrics">
            <span><CalendarDays size={16} /><strong>{plan.weeks}</strong> week{plan.weeks === 1 ? "" : "s"}</span>
            <span><Clock3 size={16} /><strong>{plan.weeklyMinutes}</strong> min this week</span>
            <span><Gauge size={16} /><strong>{PHASE_LABEL[plan.tasks[0]?.phase ?? "foundation"]}</strong> phase</span>
          </div>
        </section>
      </Reveal>

      <Reveal>
        <form className="plan-budget" action={setStudyMinutes}>
          <label htmlFor="plan-minutes">
            <strong>How long is a normal study day?</strong>
            <span>
              The plan is built inside this budget, currently about {plan.dailyMinutes} min a day. Leave the field empty
              and the planner decides from your test date and your gap to target.
            </span>
          </label>
          <div className="plan-budget-input">
            <input
              id="plan-minutes"
              className="field-input"
              type="number"
              name="minutes"
              min={10}
              max={600}
              step={5}
              placeholder="auto"
              defaultValue={bundle.minutesPerDay ?? ""}
            />
            <span>min</span>
            <button className="btn btn-primary" type="submit">
              Save
            </button>
          </div>
        </form>
      </Reveal>

      <Reveal>
        <PlanAdjustments />
      </Reveal>

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

      <Reveal>
        <section className="dash-card plan-resources">
          <div className="plan-section-heading">
            <div>
              <p className="eyebrow">Trusted resources</p>
              <h2 className="dash-section-title">Use the right tool for each session</h2>
            </div>
            <BookOpenCheck size={24} aria-hidden="true" />
          </div>
          <div className="plan-resource-grid">
            {OFFICIAL_RESOURCES.map((resource) => (
              <a key={resource.name} href={resource.href} target="_blank" rel="noreferrer" className="plan-resource-card">
                <span>{resource.tag}</span>
                <strong>{resource.name}</strong>
                <p>{resource.description}</p>
                <small>Open official resource <ExternalLink size={13} /></small>
              </a>
            ))}
          </div>
        </section>
      </Reveal>

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
          <div className="dash-card plan-week-card">
            <h2 className="dash-section-title">
              Week {w.week}
              <span className="week-tag">
                {w.week === 1 ? "this week" : w.week === plan.weeks ? "final stretch" : ""}
              </span>
            </h2>
            <p className="plan-week-phase">{PHASE_LABEL[w.tasks[0]?.phase ?? "foundation"]}</p>
            <PlanChecklist tasks={w.tasks} done={plan.done} showProgress />
          </div>
        </Reveal>
      ))}
    </>
  );
}
