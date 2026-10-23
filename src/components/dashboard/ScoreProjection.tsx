import { projectScore, type ScorePoint } from "@/lib/score-projection";

function confidenceLabel(confidence: "low" | "medium" | "high") {
  if (confidence === "high") return "based on your last five or more tests";
  if (confidence === "medium") return "based on your last three or four tests";
  return "based on only two tests — treat it as a rough line";
}

export default function ScoreProjection({
  points,
  testDate,
  target,
}: {
  points: ScorePoint[];
  testDate: string | null;
  target: number | null;
}) {
  const projection = projectScore(points, testDate);
  if (!projection) {
    return (
      <div className="dash-card">
        <h2 className="dash-section-title">🎯 Test-day projection</h2>
        <p className="dash-sub">
          Finish at least two practice tests and set a test date to see a conservative projection.
        </p>
      </div>
    );
  }

  const delta = projection.projected - projection.last;
  const onTrack = target !== null && projection.projected >= target;
  const gap = target !== null ? target - projection.projected : null;

  return (
    <div className="dash-card score-projection">
      <div className="score-projection-head">
        <div>
          <h2 className="dash-section-title">🎯 Test-day projection</h2>
          <p className="dash-sub">
            A straight line through your last {projection.used} scored test{projection.used === 1 ? "" : "s"},
            projected {projection.weeks} week{projection.weeks === 1 ? "" : "s"} to test day.
          </p>
        </div>
        <span className={`score-projection-badge ${onTrack ? "ok" : ""}`}>
          {onTrack ? "On track" : "Below target"}
        </span>
      </div>
      <div className="score-projection-row">
        <div>
          <span className="score-projection-label">Last test</span>
          <strong>{projection.last}</strong>
        </div>
        <div>
          <span className="score-projection-label">Projected</span>
          <strong className="accent">{projection.projected}</strong>
        </div>
        <div>
          <span className="score-projection-label">Pace</span>
          <strong>{projection.slopePerWeek > 0 ? "+" : ""}{projection.slopePerWeek}/wk</strong>
        </div>
        {target !== null && (
          <div>
            <span className="score-projection-label">{gap !== null && gap > 0 ? "Gap to target" : "Target"}</span>
            <strong>{gap !== null && gap > 0 ? gap : target}</strong>
          </div>
        )}
      </div>
      <div className="score-projection-bar" aria-hidden="true">
        <span style={{ width: `${Math.min(100, Math.max(0, ((projection.projected - 400) / 1200) * 100))}%` }} />
      </div>
      <p className="dash-sub">
        If these tests are representative, the line reaches {projection.projected} by test day
        ({confidenceLabel(projection.confidence)}). This is a practice estimate, not a prediction.
      </p>
      {delta > 0 && (
        <p className="score-projection-note">
          Your most recent test is {delta} point{delta === 1 ? "" : "s"} below the projection — keep the trend,
          not the single score, in view.
        </p>
      )}
    </div>
  );
}
