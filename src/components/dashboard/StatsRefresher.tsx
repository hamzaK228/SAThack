"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { STATS_DIRTY_EVENT } from "@/lib/stats-dirty";

/**
 * Re-renders the dashboard's server components (the right rail's XP, counts
 * and recent activity) shortly after practice code records new stats, so the
 * rail updates — no manual reload. The debounce coalesces bursts (keyboard
 * drills) into at most one refresh per ~1.2s.
 *
 * It deliberately does nothing while a drill or a timed test is open: a
 * full-route refresh after every answer re-ran the session loader and the
 * attempt scans while the student was still working. The next navigation gets
 * fresh server numbers anyway.
 */
export default function StatsRefresher() {
  const router = useRouter();
  const pathname = usePathname();
  const inLivePractice =
    pathname.startsWith("/dashboard/session") ||
    /^\/dashboard\/test\/(?!review\b)/.test(pathname);

  useEffect(() => {
    let timer: number | undefined;
    function onDirty() {
      if (inLivePractice) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => router.refresh(), 1200);
    }
    window.addEventListener(STATS_DIRTY_EVENT, onDirty);
    return () => {
      window.removeEventListener(STATS_DIRTY_EVENT, onDirty);
      window.clearTimeout(timer);
    };
  }, [router, inLivePractice]);

  return null;
}
