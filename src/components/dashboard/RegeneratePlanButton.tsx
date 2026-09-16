"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { regeneratePlan } from "@/app/dashboard/actions";

/**
 * Hands the plan back to the AI: rebuilds it from the latest results and
 * snapshots it, so the agent stays the single planner.
 */
export default function RegeneratePlanButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  function run() {
    setDone(false);
    startTransition(async () => {
      await regeneratePlan();
      router.refresh();
      setDone(true);
      setTimeout(() => setDone(false), 2500);
    });
  }

  return (
    <button className="btn btn-primary" onClick={run} disabled={pending}>
      {pending ? "Re-planning…" : done ? "Plan updated ✓" : "✨ Re-plan with AI"}
    </button>
  );
}
