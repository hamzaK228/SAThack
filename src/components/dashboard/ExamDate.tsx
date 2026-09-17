"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { CountUp } from "@/components/Reveal";
import { daysUntil, formatTestDate } from "@/lib/exam-date";

/**
 * The test date, shared between the goals editor and the countdowns.
 *
 * Saving a goal used to depend on `router.refresh()` finishing a full server
 * re-render before the countdown moved — and that render waited on the study
 * plan. Holding the date on the client means every countdown on the page
 * updates the moment you save; the server value only ever *confirms* it.
 *
 * The day arithmetic itself lives in src/lib/exam-date.ts, so the dashboard,
 * the study plan and the AI prompt all count the same days.
 */

type ExamDateValue = {
  testDate: string | null;
  setTestDate: (date: string | null) => void;
};

const ExamDateContext = createContext<ExamDateValue>({
  testDate: null,
  setTestDate: () => {},
});

/** Read the shared test date. Safe to call outside a provider (no-op setter). */
export function useExamDate() {
  return useContext(ExamDateContext);
}

/** Recomputes every minute so a long-lived tab never shows a stale count. */
function useDaysUntil(date: string | null) {
  const [snapshot, setSnapshot] = useState(() => ({ date, days: daysUntil(date) }));

  // A new date (saved goal) is picked up on the spot, not on the next tick.
  if (snapshot.date !== date) setSnapshot({ date, days: daysUntil(date) });

  useEffect(() => {
    const id = window.setInterval(
      () => setSnapshot({ date, days: daysUntil(date) }),
      60_000
    );
    return () => window.clearInterval(id);
  }, [date]);

  return snapshot.days;
}

export function ExamDateProvider({
  initial,
  children,
}: {
  initial: string | null;
  children: ReactNode;
}) {
  const [testDate, setTestDate] = useState(initial);
  const [confirmed, setConfirmed] = useState(initial);

  // A refresh (or a navigation back into the dashboard) delivers the saved
  // value — adopt it instead of trusting the optimistic copy forever. Adjusting
  // state during render is React's recommended alternative to a syncing effect.
  if (initial !== confirmed) {
    setConfirmed(initial);
    setTestDate(initial);
  }

  const value = useMemo(() => ({ testDate, setTestDate }), [testDate]);

  return <ExamDateContext.Provider value={value}>{children}</ExamDateContext.Provider>;
}

/** The "N days until SAT" chip in the dashboard header. */
export function ExamCountdown() {
  const { testDate } = useExamDate();
  const days = useDaysUntil(testDate);
  if (days === null) return null;

  const past = days < 0;
  return (
    <div className="dash-countdown">
      <span className="dash-countdown-num">{Math.abs(days)}</span>
      <span className="dash-countdown-label">
        {past ? "days since your test date" : "days until SAT"}
      </span>
    </div>
  );
}

/** The contents of the "Days until SAT" stat card. */
export function DaysUntilExam() {
  const { testDate } = useExamDate();
  const days = useDaysUntil(testDate);
  const past = days !== null && days < 0;

  return (
    <>
      <span className="dash-stat-label">{past ? "Days since SAT" : "Days until SAT"}</span>
      <span className="dash-stat-value accent">
        {days === null ? "—" : <CountUp to={Math.abs(days)} />}
      </span>
      <span className="dash-stat-date">
        {testDate ? formatTestDate(testDate) : "Set your test date"}
      </span>
    </>
  );
}
