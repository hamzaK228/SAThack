"use client";

import { motion } from "framer-motion";

type Day = { label: string; count: number; accuracy: number | null };

export default function ActivityChart({ days }: { days: Day[] }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  return (
    <div className="activity-chart">
      {days.map((d, i) => (
        <div className="activity-col" key={d.label}>
          <motion.span
            className="activity-bar"
            initial={{ height: 0 }}
            whileInView={{ height: `${(d.count / max) * 100}%` }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: i * 0.02 }}
            style={{
              background:
                d.accuracy === null
                  ? "var(--border-bright)"
                  : d.accuracy < 70
                    ? "var(--bad)"
                    : "var(--ok)",
            }}
            title={`${d.label}: ${d.count} answered${d.accuracy !== null ? ` · ${d.accuracy}% correct` : ""}`}
          />
          <span className="activity-day">{d.label}</span>
        </div>
      ))}
    </div>
  );
}
