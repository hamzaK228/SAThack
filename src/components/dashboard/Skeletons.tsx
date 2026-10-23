import type { CSSProperties } from "react";

/*
 * Loading skeletons for the AI-plan surfaces. The plan engine can take ~30s
 * when it regenerates the narrative after new attempts, so these pages stream
 * a shell instantly and keep a heartbeat here until it lands.
 */

export function SkeletonBlock({ h = 90, style }: { h?: number; style?: CSSProperties }) {
  return <div className="skeleton" style={{ height: h, ...style }} aria-hidden="true" />;
}

export function PlanSkeleton() {
  return (
    <div role="status" aria-live="polite">
      <div className="dash-stat-grid" style={{ marginTop: "1rem" }}>
        {[0, 1, 2, 3].map((i) => (
          <SkeletonBlock key={i} h={104} />
        ))}
      </div>
      <SkeletonBlock h={120} style={{ marginTop: "1rem" }} />
      <SkeletonBlock h={150} style={{ marginTop: "1rem" }} />
      <div className="dash-stat-grid" style={{ marginTop: "1rem" }}>
        <SkeletonBlock h={130} />
        <SkeletonBlock h={130} />
      </div>
      <SkeletonBlock h={210} style={{ marginTop: "1rem" }} />
      <SkeletonBlock h={160} style={{ marginTop: "1rem" }} />
      <p className="sk-note">
        Checking your latest answers and rebalancing your plan — this can take up to half a minute
        after new practice.
      </p>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="dash-page" role="status" aria-live="polite">
      <SkeletonBlock h={44} style={{ width: "55%", minWidth: 220 }} />
      <SkeletonBlock h={210} style={{ marginTop: "1.2rem" }} />
      <div className="dash-stat-grid" style={{ marginTop: "1rem" }}>
        {[0, 1, 2, 3].map((i) => (
          <SkeletonBlock key={i} h={104} />
        ))}
      </div>
      <SkeletonBlock h={180} style={{ marginTop: "1rem" }} />
      <p className="sk-note">Loading your dashboard…</p>
    </div>
  );
}
