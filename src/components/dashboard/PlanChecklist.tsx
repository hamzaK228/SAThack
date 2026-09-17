"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { taskHref, taskKey, type PlanTask } from "@/lib/plan";
import { setPlanTaskDone } from "@/app/dashboard/actions";

const KIND_ICON: Record<PlanTask["kind"], string> = {
  learn: "📖",
  practice: "⚡",
  review: "✎",
  test: "▣",
  diagnostic: "🚀",
};

/**
 * The plan task list with check-off. Ticking a box persists to `plan_tasks`
 * (keyed by the task's stable key) so progress survives plan regeneration.
 */
export default function PlanChecklist({
  tasks,
  done = {},
  showProgress = false,
}: {
  tasks: PlanTask[];
  done?: Record<string, boolean>;
  showProgress?: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<Record<string, boolean>>(done);
  const [, startTransition] = useTransition();

  if (tasks.length === 0) {
    return <p className="dash-sub">No tasks yet.</p>;
  }

  const completed = tasks.filter((t) => state[taskKey(t)]).length;
  const pct = Math.round((completed / tasks.length) * 100);

  function toggle(task: PlanTask, next: boolean) {
    const key = taskKey(task);
    setState((s) => ({ ...s, [key]: next }));
    startTransition(async () => {
      const result = await setPlanTaskDone({
        task_key: key,
        week: task.week,
        title: task.title,
        kind: task.kind,
        domain: task.domain,
        minutes: task.minutes,
        done: next,
      });
      // The write didn't land — put the tick back rather than pretend.
      if (!result.ok) {
        setState((s) => ({ ...s, [key]: !next }));
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="checklist">
      {showProgress && (
        <div className="checklist-progress">
          <div className="checklist-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${pct}%` }} />
          </div>
          <span className="checklist-count">
            {completed}/{tasks.length} done · {pct}%
          </span>
        </div>
      )}

      <ul className="task-list">
        {tasks.map((task) => {
          const key = taskKey(task);
          const isDone = !!state[key];
          return (
            <li className={`task${isDone ? " task-done" : ""}`} key={key}>
              <label className="task-check" title={isDone ? "Mark as not done" : "Mark as done"}>
                <input
                  type="checkbox"
                  checked={isDone}
                  onChange={(e) => toggle(task, e.target.checked)}
                />
                <span className="task-check-box" aria-hidden="true">
                  {isDone ? "✓" : ""}
                </span>
                <span className="sr-only">
                  {isDone ? "Mark as not done" : "Mark as done"}: {task.title}
                </span>
              </label>

              <Link className="task-main" href={taskHref(task)}>
                <span className="task-icon" aria-hidden="true">
                  {KIND_ICON[task.kind]}
                </span>
                <span className="task-body">
                  <span className="task-title">{task.title}</span>
                  <span className="task-meta">
                    {task.minutes} min
                    {task.questionCount ? ` · ${task.questionCount} questions` : ""}
                  </span>
                </span>
                <span className="task-arrow" aria-hidden="true">
                  →
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
