"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateGoals } from "@/app/dashboard/actions";
import { useExamDate } from "@/components/dashboard/ExamDate";

export default function DashboardGoals({
  currentScore,
  targetScore,
  testDate,
}: {
  currentScore: number | null;
  targetScore: number | null;
  testDate: string | null;
}) {
  const router = useRouter();
  const { setTestDate } = useExamDate();
  const [current, setCurrent] = useState(currentScore ?? 0);
  const [target, setTarget] = useState(targetScore ?? 0);
  const [date, setDate] = useState(testDate ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gap = target && current ? target - current : null;

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);

    // Move the countdowns now — the refresh below only confirms it.
    const previousDate = testDate ?? "";
    setTestDate(date || null);

    const result = await updateGoals({
      target_score: target || undefined,
      current_score: current || null,
      test_date: date || null,
    });

    setSaving(false);

    if (!result.ok) {
      setTestDate(previousDate || null);
      setError(result.error ?? "Couldn't save your goals. Please try again.");
      return;
    }

    setSaved(true);
    router.refresh();
    setTimeout(() => setSaved(false), 2200);
  }

  // Position the markers on a 400–1600 scale.
  const pos = (v: number | null | undefined) =>
    v ? Math.min(100, Math.max(0, ((v - 400) / 1200) * 100)) : 0;

  return (
    <div className="goals-card">
      <div className="goals-head">
        <span className="dash-section-title" style={{ marginBottom: 0 }}>
          🎯 Your goals
        </span>
        {gap !== null && (
          <span className={`goals-gap ${gap >= 0 ? "up" : "down"}`}>
            {gap >= 0 ? `+${gap} to go` : `${Math.abs(gap)} above target`}
          </span>
        )}
      </div>

      <div className="goals-track" aria-hidden="true">
        <span className="goals-track-label">400</span>
        <span className="goals-track-bar">
          <span
            className="goals-track-current"
            style={{ left: `${pos(current || target)}%` }}
          />
          <span
            className="goals-track-target"
            style={{ left: `${pos(target || current)}%` }}
          />
        </span>
        <span className="goals-track-label">1600</span>
      </div>

      <div className="goals-fields">
        <label className="field">
          <span className="field-label">Current SAT score</span>
          <input
            className="field-input goals-input"
            type="number"
            inputMode="numeric"
            min={400}
            max={1600}
            step={10}
            placeholder="e.g. 1180"
            value={current || ""}
            onChange={(e) => setCurrent(e.target.valueAsNumber)}
          />
        </label>
        <label className="field">
          <span className="field-label">Target score</span>
          <input
            className="field-input goals-input"
            type="number"
            inputMode="numeric"
            min={400}
            max={1600}
            step={10}
            placeholder="e.g. 1500"
            value={target || ""}
            onChange={(e) => setTarget(e.target.valueAsNumber)}
          />
        </label>
        <label className="field">
          <span className="field-label">Test date</span>
          <input
            className="field-input goals-input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
      </div>

      {error && (
        <p className="feedback bad" role="alert" style={{ marginTop: "1rem" }}>
          {error}
        </p>
      )}

      <button className="btn btn-primary" onClick={save} disabled={saving}>
        {saving ? "Saving…" : saved ? "Saved ✓" : "Save goals"}
      </button>
    </div>
  );
}
