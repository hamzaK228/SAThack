export const STATS_DIRTY_EVENT = "sathack:stats-dirty";

/** Signal that server-side stats (XP, accuracy, streak, recent activity) just
 * changed. The dashboard's StatsRefresher listens and refreshes the route, so
 * the right rail updates without a manual reload. */
export function markStatsDirty() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(STATS_DIRTY_EVENT));
  }
}
