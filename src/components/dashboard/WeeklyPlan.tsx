import Link from "next/link";
import { getStudyPlan } from "@/lib/study-plan-data";
import PlanChecklist from "./PlanChecklist";

export default async function WeeklyPlan() {
  const bundle = await getStudyPlan();
  if (!bundle) return null;
  const { plan } = bundle;
  return <div className="dash-card">
    <div className="dash-plan-head">
      <h2 className="dash-section-title" style={{ marginBottom: 0 }}>This week&apos;s plan</h2>
      <Link className="btn btn-ghost" href="/dashboard/plan">Full plan &rarr;</Link>
    </div>
    <PlanChecklist tasks={plan.tasks.filter((task) => task.week === 1)} done={plan.done} />
  </div>;
}
