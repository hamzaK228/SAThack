import Link from "next/link";
import { getStudyPlan } from "@/lib/study-plan-data";
import PlanChecklist from "./PlanChecklist";
import { taskHref, taskKey } from "@/lib/plan";
import { snoozePlanTask } from "@/app/dashboard/plan-actions";
import { nowMs } from "@/lib/now";

/**
 * Today's mission. The plan has no calendar anchor, so "today" is not a date — it
 * is the next few things that are still undone, taken in week/day order from
 * wherever the student actually is. That is the promise a mentor makes: here is
 * what you do next and what it costs, not a whole week of homework to stare at.
 */
export default async function WeeklyPlan() {
  const bundle = await getStudyPlan();
  if (!bundle) return null;
  const { plan } = bundle;

  const todayIso = new Date().toISOString().slice(0, 10);
  const pending = plan.tasks
    .filter((task) => !plan.done[taskKey(task)] && task.kind !== "diagnostic")
    // A step the student pushed to tomorrow waits its turn — asking to skip one
    // evening has to mean something, or nobody bothers asking.
    .filter((task) => (bundle.snoozed[taskKey(task)] ?? "") <= todayIso)
    .sort((a, b) => a.week - b.week || a.day - b.day);

  // A mentor notices when someone disappears. Coming back after a break should
  // not mean facing the full three-step day — one step is the way back in, and
  // saying so out loud is what stops a two-day gap from becoming two weeks.
  const daysSince = bundle.lastPractisedAt
    ? Math.floor((nowMs() - new Date(bundle.lastPractisedAt).getTime()) / 86_400_000)
    : null;
  const returning = daysSince !== null && daysSince >= 2;

  // Size today to the pace the student actually keeps. "Three steps" is right for
  // nobody in particular: someone answering ten questions a day should get one
  // focused step rather than three they will never finish, and someone clearing
  // their week early can take a fourth. Coming back after a break starts at one.
  const candidates = pending.slice(0, 4);
  const perDay = bundle.recentQuestionsPerDay;
  let today = candidates.slice(0, 3);
  let paceNote: string | null = null;
  if (returning) {
    today = candidates.slice(0, 1);
  } else if (perDay !== null && candidates.length > 1) {
    const want = Math.max(8, perDay);
    const picked: typeof candidates = [];
    let cost = 0;
    for (const task of candidates) {
      const step = task.questionCount || 8;
      if (picked.length && cost + step > want * 1.25) break;
      picked.push(task);
      cost += step;
    }
    today = picked.length ? picked : candidates.slice(0, 1);
    if (today.length < 3) {
      paceNote = `Sized to your real pace — about ${perDay} questions a day over the last week.`;
    } else if (today.length > 3) {
      paceNote = "You have been moving faster than the plan assumed, so there is a fourth step today.";
    }
  }
  const todayMinutes = today.reduce((sum, task) => sum + task.minutes, 0);
  const doneCount = plan.tasks.filter((task) => plan.done[taskKey(task)]).length;

  return (
    <div className="dash-card">
      <div className="dash-plan-head">
        <div>
          <h2 className="dash-section-title" style={{ marginBottom: 0 }}>
            Today&apos;s mission
          </h2>
          <p className="dash-sub">
            {today.length
              ? `${today.length} steps · about ${todayMinutes} min · from week ${today[0].week} of your plan`
              : "Every step of your plan is done — it is time for another full-length test."}
          </p>
        </div>
        <Link className="btn btn-ghost" href="/dashboard/plan">
          Full plan →
        </Link>
      </div>

      {today.length > 0 && (
        <ol className="today-steps">
          {today.map((task) => (
            <li key={task.id}>
              <div>
                <strong>{task.title}</strong>
                <span>
                  {task.minutes} min
                  {task.questionCount ? ` · ${task.questionCount} questions` : ""}
                  {task.difficulty ? ` · ${task.difficulty}` : ""}
                </span>
              </div>
              <div className="today-step-actions">
                <form
                  action={snoozePlanTask.bind(
                    null,
                    taskKey(task),
                    task.week,
                    task.title,
                    task.kind,
                    task.domain,
                    task.minutes,
                    task.questionCount
                  )}
                >
                  <button className="today-skip" type="submit" title="Move this step to tomorrow">
                    Not today
                  </button>
                </form>
                <Link className="btn btn-primary" href={taskHref(task)}>
                  Start →
                </Link>
              </div>
            </li>
          ))}
        </ol>
      )}

      {(returning || paceNote) && (
        <p className="today-return">
          {returning
            ? `${daysSince === 1 ? "Yesterday" : `${daysSince} days`} since your last session — no guilt, just start with this one step. The rest of the plan will still be here tomorrow.`
            : paceNote}
        </p>
      )}

      <div className="today-progress">
        <span>
          {doneCount} of {plan.tasks.length} tasks done
        </span>
        <Link href="/dashboard/plan">See the whole plan</Link>
      </div>

      <details className="dash-week-details">
        <summary>This week in full</summary>
        <PlanChecklist tasks={plan.tasks.filter((task) => task.week === 1)} done={plan.done} />
      </details>
    </div>
  );
}
