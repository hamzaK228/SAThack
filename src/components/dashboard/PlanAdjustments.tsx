import { createClient } from "@/lib/supabase/server";
import { decidePlanAdjustment, proposePlanAdjustments } from "@/app/dashboard/plan-actions";
import RefreshPlanAgent from "./RefreshPlanAgent";
import { nowMs } from "@/lib/now";

const ACTION_LABEL: Record<string, string> = {
  snooze: "Move to tomorrow",
  harder: "Make it harder",
  easier: "Make it easier",
};

/** How long a review stays current before the agent quietly looks again. */
const REVIEW_TTL_HOURS = 20;

/**
 * The AI agent's part of the study plan: it reads the student's own numbers and
 * proposes at most three concrete changes, each with a reason. Every proposal is a
 * pending row until the student accepts it — the plan can never move under them,
 * and each change is one of two reversible levers.
 *
 * Staleness is judged here so the page can wake the agent on arrival: no pending
 * suggestions and nothing reviewed in the last day means it is time to think again.
 */
export default async function PlanAdjustments() {
  const supabase = await createClient();
  const { data: reviews } = await supabase
    .from("plan_adjustments")
    .select("id, action, title, reason, status, created_at")
    .order("created_at", { ascending: false })
    .limit(8);

  const rows = (reviews ?? []).filter((row) => row.status === "pending").slice(0, 5);
  const newest = (reviews ?? [])[0];
  const stale =
    rows.length === 0 &&
    (!newest || nowMs() - new Date(newest.created_at).getTime() > REVIEW_TTL_HOURS * 3_600_000);

  return (
    <section className="plan-ai" aria-label="AI suggestions for your plan">
      <RefreshPlanAgent stale={stale} />
      <div className="plan-ai-head">
        <div>
          <span className="plan-ai-kicker">AI agent</span>
          <strong>Let the tutor review your plan</strong>
          <p>
            It suggests at most three changes — push a step to tomorrow, or raise or lower its difficulty — and each
            one waits for your yes. Nothing in the plan moves on its own.
          </p>
        </div>
        <form action={proposePlanAdjustments}>
          <button className="btn btn-primary" type="submit">
            {rows.length ? "Ask again" : "Ask for suggestions"}
          </button>
        </form>
      </div>

      {rows.length > 0 && (
        <ul className="plan-ai-list">
          {rows.map((row) => (
            <li key={row.id}>
              <div>
                <span className="plan-ai-action">{ACTION_LABEL[row.action] ?? row.action}</span>
                <strong>{row.title}</strong>
                <p>{row.reason}</p>
              </div>
              <div className="plan-ai-buttons">
                <form action={decidePlanAdjustment}>
                  <input type="hidden" name="id" value={row.id} />
                  <input type="hidden" name="decision" value="accept" />
                  <button className="btn btn-know" type="submit">
                    Accept
                  </button>
                </form>
                <form action={decidePlanAdjustment}>
                  <input type="hidden" name="id" value={row.id} />
                  <input type="hidden" name="decision" value="dismiss" />
                  <button className="btn btn-ghost" type="submit">
                    Dismiss
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
