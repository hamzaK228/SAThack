import { createClient } from "@/lib/supabase/server";

export default async function RightRail({ userId }: { userId: string }) {
  const supabase = await createClient();

  const { count: total } = await supabase
    .from("practice_attempts")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  const { count: correct } = await supabase
    .from("practice_attempts")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_correct", true);

  const { data: recent } = await supabase
    .from("practice_attempts")
    .select("domain, is_correct, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(6);

  const { data: days } = await supabase
    .from("practice_attempts")
    .select("created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(120);

  const n = total ?? 0;
  const c = correct ?? 0;
  const accuracy = n ? Math.round((c / n) * 100) : 0;
  const level = Math.floor(n / 20) + 1;
  const xp = n % 20;

  const activeDays = new Set(
    (days ?? []).map((d) => new Date(d.created_at).toISOString().slice(0, 10))
  );
  let streak = 0;
  const cursor = new Date();
  if (!activeDays.has(cursor.toISOString().slice(0, 10))) cursor.setDate(cursor.getDate() - 1);
  while (activeDays.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return (
    <aside className="dash-rail">
      <div className="rail-card">
        <div className="rail-level">
          <div>
            <span className="rail-level-label">Level {level}</span>
            <div className="rail-xp">
              <div className="rail-xp-bar">
                <span style={{ width: `${(xp / 20) * 100}%` }}></span>
              </div>
              <span className="rail-xp-num">
                {xp}/20
              </span>
            </div>
          </div>
          <span className="rail-level-badge">⚡</span>
        </div>
      </div>

      <div className="rail-card">
        <span className="rail-card-label">Today</span>
        <div className="rail-stat-grid">
          <div className="rail-stat">
            <span className="rail-stat-num">{n}</span>
            <span className="rail-stat-label">Questions</span>
          </div>
          <div className="rail-stat">
            <span className="rail-stat-num">{accuracy}%</span>
            <span className="rail-stat-label">Accuracy</span>
          </div>
        </div>
        <div className="rail-streak">
          <span className="rail-streak-icon" aria-hidden="true">
            🔥
          </span>
          <span>
            <strong>{streak}</strong> day streak
          </span>
        </div>
      </div>

      <div className="rail-card">
        <span className="rail-card-label">Recent activity</span>
        {recent && recent.length > 0 ? (
          <ul className="rail-activity">
            {recent.map((a, i) => (
              <li key={i} className="rail-activity-row">
                <span
                  className={`rail-activity-dot ${a.is_correct ? "ok" : "bad"}`}
                  aria-hidden="true"
                ></span>
                <span className="rail-activity-text">
                  {a.domain || "Question"}
                </span>
                <span className={`rail-activity-status ${a.is_correct ? "ok" : "bad"}`}>
                  {a.is_correct ? "correct" : "missed"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rail-empty">No practice yet. Start a session to build your log.</p>
        )}
      </div>
    </aside>
  );
}

