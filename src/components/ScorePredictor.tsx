"use client";

import { useState } from "react";
import { Reveal } from "./Reveal";

const percentileTable: Record<number, number> = {
  400: 1, 500: 1, 600: 2, 700: 7, 800: 17, 900: 30, 1000: 45,
  1100: 61, 1200: 75, 1250: 81, 1300: 86, 1350: 89, 1400: 93,
  1450: 96, 1500: 98, 1550: 99, 1600: 99,
};

function clamp(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.min(800, Math.max(200, Math.round(v)));
}

function percentileFor(total: number): number {
  const keys = Object.keys(percentileTable).map(Number).sort((a, b) => a - b);
  let pct = 1;
  for (const k of keys) {
    if (total >= k) pct = percentileTable[k];
    else break;
  }
  return pct;
}

export default function ScorePredictor() {
  const [rw, setRw] = useState(700);
  const [math, setMath] = useState(700);

  const total = clamp(rw) + clamp(math);
  const pct = percentileFor(total);
  const barWidth = Math.round(((total - 400) / (1600 - 400)) * 100);

  return (
    <section className="section" id="predictor">
      <div className="wrap">
        <div className="section-head center">
          <Reveal>
            <p className="eyebrow">Tool</p>
            <h2>
              Where could you <span className="grad">actually land?</span>
            </h2>
            <p className="section-sub">
              Enter section scores to estimate your total and percentile. An estimate, not an
              official scaled score.
            </p>
          </Reveal>
        </div>

        <Reveal>
          <div className="predictor-panel">
            <form className="predictor-form" onSubmit={(e) => e.preventDefault()}>
              <label className="field">
                <span className="field-label">Reading &amp; Writing</span>
                <input
                  className="field-input"
                  type="number"
                  inputMode="numeric"
                  min={200}
                  max={800}
                  step={10}
                  value={rw}
                  onChange={(e) => setRw(e.target.valueAsNumber)}
                />
                <span className="field-help">200–800</span>
              </label>
              <label className="field">
                <span className="field-label">Math</span>
                <input
                  className="field-input"
                  type="number"
                  inputMode="numeric"
                  min={200}
                  max={800}
                  step={10}
                  value={math}
                  onChange={(e) => setMath(e.target.valueAsNumber)}
                />
                <span className="field-help">200–800</span>
              </label>
            </form>

            <div className="predictor-result" aria-live="polite">
              <div className="result-row">
                <span className="result-label">Total</span>
                <span className="result-big">{total}</span>
                <span className="unit">/ 1600</span>
              </div>
              <div className="result-row">
                <span className="result-label">Estimated percentile</span>
                <span className="result-val">{pct}{pct % 100 >= 11 && pct % 100 <= 13 ? "th" : ({1:"st",2:"nd",3:"rd"} as Record<number,string>)[pct % 10] ?? "th"}</span>
              </div>
              <div className="result-bar">
                <span style={{ ["--w" as string]: `${barWidth}%` }}></span>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
