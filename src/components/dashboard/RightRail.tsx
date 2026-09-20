import { getProgressSummary } from "@/lib/progress-summary";

export default async function RightRail() {
  const {attempts:n,accuracy,level,streak,recent}=await getProgressSummary();
  return (
    <aside className="dash-rail">
      <div className="rail-card">
        <div className="rail-level">
          <div>
            <span className="rail-level-label">Level {level.level}</span>
            <div className="rail-xp">
              <div className="rail-xp-bar">
                <span style={{ width: `${(level.into / level.span) * 100}%` }}></span>
              </div>
              <span className="rail-xp-num">
                {level.into}/{level.span}
              </span>
            </div>
          </div>
          <span className="rail-level-badge">⚡</span>
        </div>
      </div>

      <div className="rail-card">
        <span className="rail-card-label">Practice</span>
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
