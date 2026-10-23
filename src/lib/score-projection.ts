/**
 * Score projection for analytics.
 *
 * Deliberately conservative: a straight line through the last few valid
 * practice-test totals projected to the test date, with a confidence label
 * based on how many tests back it. It is a study-planning aid, not a College
 * Board prediction, and the UI says so.
 */

export type ScorePoint = {
  total: number | null;
  rw: number | null;
  math: number | null;
  completed_at: string;
};

export type Projection = {
  projected: number;
  last: number;
  slopePerWeek: number;
  weeks: number;
  used: number;
  confidence: "low" | "medium" | "high";
};

function clampScore(value: number): number {
  return Math.min(1600, Math.max(400, Math.round(value / 10) * 10));
}

export function projectScore(points: ScorePoint[], testDate: string | null): Projection | null {
  if (!testDate) return null;
  const valid = points
    .filter((point) => typeof point.total === "number" && Number.isFinite(point.total))
    .slice(-6);
  if (valid.length < 2) return null;

  const last = valid[valid.length - 1];
  const lastTime = new Date(last.completed_at).getTime();
  if (!Number.isFinite(lastTime)) return null;

  const target = new Date(`${testDate}T00:00:00`).getTime();
  if (!Number.isFinite(target)) return null;

  const daysToTest = Math.max(0, Math.round((target - lastTime) / 86_400_000));
  if (daysToTest > 365) return null;

  // Least squares on days since the first point.
  const firstTime = new Date(valid[0].completed_at).getTime();
  const xs = valid.map((point) => (new Date(point.completed_at).getTime() - firstTime) / 86_400_000);
  const ys = valid.map((point) => Number(point.total));
  const n = valid.length;
  const meanX = xs.reduce((sum, value) => sum + value, 0) / n;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / n;
  const denominator = xs.reduce((sum, value) => sum + (value - meanX) ** 2, 0);
  const slope = denominator > 0
    ? xs.reduce((sum, value, index) => sum + (value - meanX) * (ys[index] - meanY), 0) / denominator
    : 0;

  const projectedRaw = meanY + slope * (daysToTest + (lastTime - firstTime) / 86_400_000 - meanX);
  // Cap a single projection at a realistic improvement (~120 points) so a
  // three-test hot streak cannot promise a 500-point jump.
  const projected = clampScore(Math.max(ys[ys.length - 1] - 60, Math.min(ys[ys.length - 1] + 120, projectedRaw)));

  return {
    projected,
    last: clampScore(Number(last.total)),
    slopePerWeek: Math.round(slope * 7),
    weeks: Math.max(0, Math.round(daysToTest / 7)),
    used: valid.length,
    confidence: valid.length >= 5 ? "high" : valid.length >= 3 ? "medium" : "low",
  };
}
