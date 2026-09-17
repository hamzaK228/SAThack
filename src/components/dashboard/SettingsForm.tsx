"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateGoals } from "@/app/dashboard/actions";
import { useExamDate } from "@/components/dashboard/ExamDate";

export default function SettingsForm({
  targetScore,
  currentScore,
  testDate,
}: {
  targetScore: number;
  currentScore: number | null;
  testDate: string | null;
}) {
  const router = useRouter();
  const { setTestDate } = useExamDate();
  const [target, setTarget] = useState(targetScore || 1400);
  const [current, setCurrent] = useState(currentScore ?? 0);
  const [date, setDate] = useState(testDate || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);

    const result = await updateGoals({
      target_score: target,
      current_score: current || null,
      test_date: date || null,
    });

    setSaving(false);

    if (!result.ok) {
      setError(result.error ?? "Couldn't save your goals. Please try again.");
      return;
    }

    // Keep the dashboard countdowns in step if they share this page's tree.
    setTestDate(date || null);
    setSaved(true);
    router.refresh();
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="dash-card">
      <h2 className="dash-section-title">Goals</h2>
      <p className="dash-sub" style={{ marginBottom: "1rem" }}>
        Set your current SAT score, target score and test date. Your plan is built around them.
      </p>
      <div className="settings-fields">
        <label className="field">
          <span className="field-label">Current SAT score (400–1600)</span>
          <input
            className="field-input"
            type="number"
            min={400}
            max={1600}
            step={10}
            placeholder="e.g. 1180"
            value={current || ""}
            onChange={(e) => setCurrent(e.target.valueAsNumber)}
            style={{ maxWidth: 180 }}
          />
        </label>
        <label className="field">
          <span className="field-label">Target score (400–1600)</span>
          <input
            className="field-input"
            type="number"
            min={400}
            max={1600}
            step={10}
            value={target}
            onChange={(e) => setTarget(e.target.valueAsNumber)}
            style={{ maxWidth: 180 }}
          />
        </label>
        <label className="field">
          <span className="field-label">SAT test date</span>
          <input
            className="field-input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{ maxWidth: 220 }}
          />
        </label>
      </div>
      {error && (
        <p className="feedback bad" role="alert" style={{ marginTop: "1rem" }}>
          {error}
        </p>
      )}
      <button className="btn btn-primary" onClick={save} disabled={saving} style={{ marginTop: "1.25rem" }}>
        {saving ? "Saving…" : saved ? "Saved ✓" : "Save goals"}
      </button>
    </div>
  );
}
