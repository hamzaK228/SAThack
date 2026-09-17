"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { updateGoals } from "@/app/dashboard/actions";

const STEPS = ["Welcome", "Target score", "Where you are", "Ready"] as const;
const PRESETS = [1200, 1300, 1400, 1500, 1600];

export type OnboardingInitial = {
  fullName: string | null;
  targetScore: number | null;
  currentScore: number | null;
  testDate: string | null;
};

/**
 * Three quick questions, then straight into the diagnostic — the setup flow a
 * new account lands on so the AI planner has a goal and a deadline to work from.
 */
export default function OnboardingForm({ initial }: { initial: OnboardingInitial }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [target, setTarget] = useState(initial.targetScore ?? 1400);
  const [current, setCurrent] = useState<string>(initial.currentScore?.toString() ?? "");
  const [date, setDate] = useState(initial.testDate ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const firstName = initial.fullName?.split(" ")[0] ?? "there";

  async function finish(withDiagnostic: boolean) {
    setSaving(true);
    setError(null);
    try {
      const result = await updateGoals({
        target_score: target,
        current_score: current === "" ? null : Number(current),
        test_date: date || null,
      });
      if (!result.ok) {
        setError(result.error ?? "Couldn't save your goals — you can set them later in Settings.");
        setSaving(false);
        return;
      }
      router.replace(withDiagnostic ? "/dashboard/diagnostic" : "/dashboard");
    } catch {
      setError("Couldn't save your goals — you can set them later in Settings.");
      setSaving(false);
    }
  }

  return (
    <div className="onboard-card">
      <ol className="onboard-steps" aria-label="Setup progress">
        {STEPS.map((s, i) => (
          <li key={s} className={`onboard-step${i === step ? " active" : ""}${i < step ? " done" : ""}`}>
            <span className="onboard-dot" aria-hidden="true">
              {i < step ? "✓" : i + 1}
            </span>
            <span className="onboard-step-label">{s}</span>
          </li>
        ))}
      </ol>

      <div className="onboard-body">
        {step === 0 && (
          <>
            <h1 className="auth-title">Hey {firstName} 👋</h1>
            <p className="onboard-text">
              Let&apos;s set up your study plan. Three quick questions — target score, where you are now,
              and when you sit the test. Then we&apos;ll find your weak spots with a short diagnostic.
            </p>
          </>
        )}

        {step === 1 && (
          <>
            <h1 className="auth-title">What score are you aiming for?</h1>
            <p className="onboard-text">Everything in your plan is built backwards from this number.</p>
            <div className="onboard-target">
              <span className="onboard-target-num">{target}</span>
              <input
                className="onboard-range"
                type="range"
                min={400}
                max={1600}
                step={10}
                value={target}
                onChange={(e) => setTarget(Number(e.target.value))}
                aria-label="Target score"
              />
              <div className="onboard-presets">
                {PRESETS.map((p) => (
                  <button
                    type="button"
                    key={p}
                    className={`chip${target === p ? " active" : ""}`}
                    onClick={() => setTarget(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="auth-title">Where are you right now?</h1>
            <p className="onboard-text">
              Optional — skip if you haven&apos;t taken a test yet. The diagnostic will fill this in.
            </p>
            <label className="field">
              <span className="field-label">Latest score</span>
              <input
                className="field-input"
                type="number"
                min={400}
                max={1600}
                step={10}
                placeholder="e.g. 1180"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">Test date</span>
              <input
                className="field-input"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
          </>
        )}

        {step === 3 && (
          <>
            <h1 className="auth-title">You&apos;re all set 🎯</h1>
            <ul className="plain-list onboard-summary">
              <li>
                <strong>Target:</strong> {target}
              </li>
              <li>
                <strong>Current:</strong>{" "}
                {current === "" ? "unknown — the diagnostic will set it" : current}
              </li>
              <li>
                <strong>Test date:</strong> {date || "not set"}
              </li>
            </ul>
            <p className="onboard-text">
              Next up: a short adaptive diagnostic across Math and Reading &amp; Writing. It takes about
              20 minutes and unlocks your priority order.
            </p>
          </>
        )}
      </div>

      {error && <p className="feedback bad">{error}</p>}

      <div className="onboard-actions">
        {step > 0 ? (
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => setStep((s) => s - 1)}
            disabled={saving}
          >
            ← Back
          </button>
        ) : (
          <Link className="btn btn-ghost" href="/dashboard">
            Skip for now
          </Link>
        )}

        {step < STEPS.length - 1 ? (
          <button className="btn btn-primary" type="button" onClick={() => setStep((s) => s + 1)}>
            {step === 0 ? "Let's go" : "Next"} →
          </button>
        ) : (
          <>
            <button className="btn btn-ghost" type="button" onClick={() => finish(false)} disabled={saving}>
              Go to dashboard
            </button>
            <button className="btn btn-primary" type="button" onClick={() => finish(true)} disabled={saving}>
              {saving ? "Saving…" : "🚀 Start my diagnostic"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
