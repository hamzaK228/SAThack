"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { STATS_DIRTY_EVENT } from "@/lib/stats-dirty";

/**
 * Re-renders the dashboard's server components (the right rail's XP, counts
 * and recent activity) shortly after practice code records new stats, so the
 * rail updates while the student keeps working — no manual reload. The debounce
 * coalesces bursts (keyboard drills) into at most one refresh per ~1.2s.
 */
export default function StatsRefresher() {
  const router = useRouter();

  useEffect(() => {
    let timer: number | undefined;
    function onDirty() {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => router.refresh(), 1200);
    }
    window.addEventListener(STATS_DIRTY_EVENT, onDirty);
    return () => {
      window.removeEventListener(STATS_DIRTY_EVENT, onDirty);
      window.clearTimeout(timer);
    };
  }, [router]);

  return null;
}
