"use client";

import Link from "next/link";
import { motion } from "framer-motion";

export type BarItem = { label: string; accuracy: number | null; total: number; href?: string };

function Row({ d, i }: { d: BarItem; i: number }) {
  return (
    <>
      <span className="domain-name" title={d.label}>
        {d.label}
        {d.total > 0 && <span className="domain-count">{d.total}</span>}
      </span>
      <span className="domain-bar">
        <motion.span
          className="domain-bar-fill"
          initial={{ width: 0 }}
          whileInView={{ width: `${d.accuracy ?? 0}%` }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.9, delay: i * 0.03, ease: [0.22, 1, 0.36, 1] }}
          style={{
            background:
              d.accuracy !== null && d.accuracy < 70 ? "var(--bad)" : "var(--ok)",
          }}
        />
      </span>
      <motion.span
        className="domain-pct"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ delay: 0.4 + i * 0.03 }}
      >
        {d.accuracy !== null ? `${d.accuracy}%` : d.total ? "—" : "0"}
      </motion.span>
    </>
  );
}

export default function AccBars({ items }: { items: BarItem[] }) {
  return (
    <div className="domain-list">
      {items.map((d, i) =>
        d.href ? (
          // A row with an href is a one-click session scoped to exactly these
          // questions, so a weak area is one click from being drilled.
          <Link
            className="domain-row domain-row-link"
            href={d.href}
            key={d.label}
            title={`Practice ${d.label} (${d.total} questions)`}
          >
            <Row d={d} i={i} />
          </Link>
        ) : (
          <div className="domain-row" key={d.label}>
            <Row d={d} i={i} />
          </div>
        )
      )}
    </div>
  );
}
