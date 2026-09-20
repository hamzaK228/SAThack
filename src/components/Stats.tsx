"use client";

import { CountUp, Reveal } from "./Reveal";

const stats = [
  { value: 3766, label: "available College Board questions", comma: true, suffix: "" },
  { value: 8, label: "SAT domains tracked", comma: false, suffix: "" },
  { value: 1915, label: "SAT vocabulary words", comma: true, suffix: "" },
  { value: 4, label: "adaptive modules", comma: false, suffix: "" },
];

export default function Stats() {
  return (
    <section className="stats" aria-label="Platform statistics">
      <div className="wrap">
        <div className="stats-grid">
          {stats.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.08}>
              <div className="stat">
                <span className="stat-num">
                  <CountUp to={s.value} comma={s.comma} suffix={s.suffix} />
                </span>
                <span className="stat-label">{s.label}</span>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
