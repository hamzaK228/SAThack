"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { proposePlanAdjustments } from "@/app/dashboard/plan-actions";

/**
 * Keeps the mentor awake without a scheduler: when a student opens their plan and
 * the last review is older than a day, the agent looks at the numbers again and
 * files fresh suggestions. Quiet by design — it never sends a message, it only
 * makes sure that by the time the student looks, the thinking is already done.
 */
export default function RefreshPlanAgent({ stale }: { stale: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const fired = useRef(false);

  useEffect(() => {
    if (!stale || fired.current) return;
    fired.current = true;
    startTransition(async () => {
      await proposePlanAdjustments();
      router.refresh();
    });
  }, [stale, router]);

  return null;
}
