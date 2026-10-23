import { getStudyPlan } from "@/lib/study-plan-data";
import { getProgressSummary } from "@/lib/progress-summary";
import { taskKey } from "@/lib/plan";

export type TutorContext = {
  /** The next few undone steps, in plan order — the same "today" the dashboard shows. */
  mission: { title: string; minutes: number; domain: string | null }[];
  weakSkills: { skill: string; domain: string; accuracy: number; total: number }[];
  streak: number;
};

/**
 * What the mentor should know about this student before answering: what they are
 * weak at, what they were asked to do today, and how consistent they have been.
 * Scores alone make advice generic — a tutor that knows "you are at 41% on
 * systems of equations and today's step is the Algebra drill" can be concrete.
 */
export async function getTutorContext(): Promise<TutorContext | null> {
  const [bundle, progress] = await Promise.all([getStudyPlan(), getProgressSummary()]);
  if (!bundle) return null;
  const { plan, skillStats } = bundle;

  const mission = plan.tasks
    .filter((task) => !plan.done[taskKey(task)] && task.kind !== "diagnostic")
    .sort((a, b) => a.week - b.week || a.day - b.day)
    .slice(0, 3)
    .map((task) => ({ title: task.title, minutes: task.minutes, domain: task.domain }));

  const weakSkills = (skillStats ?? [])
    .filter((s) => s.total >= 3 && s.accuracy !== null)
    .sort((a, b) => (a.accuracy ?? 100) - (b.accuracy ?? 100) || b.total - a.total)
    .slice(0, 4)
    .map((s) => ({ skill: s.skill, domain: s.domain, accuracy: s.accuracy ?? 0, total: s.total }));

  return { mission, weakSkills, streak: progress?.streak ?? 0 };
}
