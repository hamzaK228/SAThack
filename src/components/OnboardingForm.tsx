"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { updateGoals } from "@/app/dashboard/actions";

const STEPS = ["Welcome", "Target", "Where you are", "Ready"] as const;
const PRESETS = [1200, 1300, 1400, 1500, 1600];
const BANDS = [
  { label: "Haven't taken one yet", value: "" },
  { label: "Below 1000", value: "900" },
  { label: "1000–1190", value: "1100" },
  { label: "1200–1390", value: "1300" },
  { label: "1400+", value: "1450" },
] as const;

export type OnboardingInitial = {
  fullName: string | null;
  targetScore: number | null;
  currentScore: number | null;
  testDate: string | null;
};

const pad2 = (n: number) => String(n).padStart(2, "0");

function daysUntil(date: string): number | null {
  if (!date) return null;
  const target = new Date(`${date}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/**
 * The setup flow a new account lands on: three quick questions so the AI
 * planner has a goal and a deadline. Presented as a full-screen mission
 * briefing in the site's terminal language.
 */
export default function OnboardingForm({ initial }: { initial: OnboardingInitial }) {
  const [step, setStep] = useState(0);
  const [target, setTarget] = useState(initial.targetScore ?? 1400);
  const [current, setCurrent] = useState<string>(initial.currentScore?.toString() ?? "");
  const [date, setDate] = useState(initial.testDate ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);

  const firstName = initial.fullName?.split(" ")[0] ?? "there";
  const progress = step / (STEPS.length - 1);
  const gap = Math.max(0, target - (current === "" ? 0 : Number(current)));
  const days = daysUntil(date);

  useEffect(() => {
    primaryRef.current?.focus();
  }, [step]);

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
      window.location.assign(withDiagnostic ? "/dashboard/diagnostic" : "/dashboard");
    } catch {
      setError("Couldn't save your goals — you can set them later in Settings.");
      setSaving(false);
    }
  }

  return (
    <div className="onb">
      <header className="onb-top">
        <span className="onb-brand">&gt; SAThack</span>
        <span className="onb-counter">
          {pad2(Math.min(step + 1, STEPS.length - 1))} / {pad2(STEPS.length - 1)}
        </span>
      </header>
      <div className="onb-progress" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${Math.max(4, progress * 100)}%` }} />
      </div>

      <div className="onb-stage" key={step}>
        {step === 0 && (
          <>
            <p className="onb-eyebrow">Mission setup</p>
            <h1 className="onb-title">
              Hey {firstName}
              <span className="onb-cursor" aria-hidden="true">_</span>
            </h1>
            <p className="onb-lead">
              Before you start, three quick questions. Your answers drive everything —
              the plan, the drills, the priority order. It takes under a minute.
            </p>
            <ul className="onb-list">
              <li><span>01</span> The score you&apos;re aiming for</li>
              <li><span>02</span> Where you stand right now</li>
              <li><span>03</span> When you sit the real test</li>
            </ul>
          </>
        )}

        {step === 1 && (
          <>
            <p className="onb-eyebrow">Question 01 — Target</p>
            <h1 className="onb-title">What score are you aiming for?</h1>
            <p className="onb-lead">Everything in your plan is built backwards from this number.</p>
            <div className="onb-target">
              <span className="onb-score" key={target}>{target}</span>
              <input
                className="onb-range"
                type="range"
                min={400}
                max={1600}
                step={10}
                value={target}
                onChange={(e) => setTarget(Number(e.target.value))}
                aria-label="Target score"
                style={{ ["--fill" as string]: `${((target - 400) / 1200) * 100}%` }}
              />
              <div className="onb-presets">
                {PRESETS.map((p) => (
                  <button type="button" key={p} className={`chip${target === p ? " active" : ""}`} onClick={() => setTarget(p)}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <p className="onb-eyebrow">Question 02 — Starting point</p>
            <h1 className="onb-title">Where are you right now?</h1>
            <p className="onb-lead">Pick the closest band, or type your latest score. Skip if you haven&apos;t taken a test — the diagnostic will fill it in.</p>
            <div className="onb-bands">
              {BANDS.map((band) => (
                <button
                  type="button"
                  key={band.label}
                  className={`onb-band${current === band.value ? " active" : ""}`}
                  onClick={() => setCurrent(band.value)}
                >
                  {band.label}
                </button>
              ))}
            </div>
            <div className="onb-row">
              <label className="onb-field">
                <span>Exact score (optional)</span>
                <input
                  type="number"
                  min={400}
                  max={1600}
                  step={10}
                  placeholder="e.g. 1180"
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                />
              </label>
              <label className="onb-field">
                <span>Test date</span>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
            </div>
            {days !== null && days > 0 && (
              <p className="onb-note">
                {days} {days === 1 ? "day" : "days"} out — that&apos;s about {Math.max(1, Math.round(days / 7))}{" "}
                {Math.round(days / 7) === 1 ? "week" : "weeks"} of prep
                {gap > 0 ? ` and roughly ${Math.round(gap / Math.max(1, Math.round(days / 7)))} points a week to close the gap.` : "."}
              </p>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <p className="onb-eyebrow">Locked in</p>
            <h1 className="onb-title">You&apos;re all set</h1>
            <p className="onb-lead">Here&apos;s the mission. Next up: a short adaptive diagnostic that finds your weak spots and unlocks your priority order.</p>
            <dl className="onb-summary">
              <div>
                <dt>Target</dt>
                <dd className="onb-summary-signal">{target}</dd>
              </div>
              <div>
                <dt>Starting point</dt>
                <dd>{current === "" ? "Diagnostic will set it" : current}</dd>
              </div>
              <div>
                <dt>Test date</dt>
                <dd>{date || "Not set — add it in Settings"}</dd>
              </div>
              {gap > 0 && (
                <div>
                  <dt>Points to gain</dt>
                  <dd>+{gap}</dd>
                </div>
              )}
            </dl>
          </>
        )}
      </div>

      {error && <p className="feedback bad">{error}</p>}

      <footer className="onb-actions">
        {step > 0 ? (
          <button className="onb-ghost" type="button" onClick={() => setStep((s) => s - 1)} disabled={saving}>
            ← Back
          </button>
        ) : (
          <Link className="onb-ghost" href="/dashboard">
            Skip for now
          </Link>
        )}
        {step < STEPS.length - 1 ? (
          <button className="onb-cta" type="button" ref={primaryRef} onClick={() => setStep((s) => s + 1)}>
            {step === 0 ? "Let's go" : "Continue"} →
          </button>
        ) : (
          <div className="onb-final">
            <button className="onb-ghost" type="button" onClick={() => finish(false)} disabled={saving}>
              Go to dashboard
            </button>
            <button className="onb-cta" type="button" ref={primaryRef} onClick={() => finish(true)} disabled={saving}>
              {saving ? "Saving…" : "Start my diagnostic →"}
            </button>
          </div>
        )}
      </footer>
    </div>
  );
}
