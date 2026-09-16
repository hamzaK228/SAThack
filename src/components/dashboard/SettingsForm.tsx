"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateGoals } from "@/app/dashboard/actions";

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
  const [target, setTarget] = useState(targetScore || 1400);
  const [current, setCurrent] = useState(currentScore ?? 0);
  const [date, setDate] = useState(testDate || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    await updateGoals({
      target_score: target,
      current_score: current || null,
      test_date: date || null,
    });
    setSaving(false);
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
      <button className="btn btn-primary" onClick={save} disabled={saving} style={{ marginTop: "1.25rem" }}>
        {saving ? "Saving…" : saved ? "Saved ✓" : "Save goals"}
      </button>
    </div>
  );
}


