"use client";

import { useState } from "react";

/**
 * Score trend — an interactive, dependency-free SVG line chart of practice-test
 * history. Total, Reading & Writing and Math are separate series, with an area
 * fill under Total and a hover tooltip. No data is stored here.
 */

export type TrendPoint = {
  label: string;
  total: number | null;
  rw: number | null;
  math: number | null;
};

const SERIES = [
  { key: "total", name: "Total", tone: "total" },
  { key: "rw", name: "Reading & Writing", tone: "rw" },
  { key: "math", name: "Math", tone: "math" },
] as const;

const W = 760;
const H = 300;
const PL = 52;
const PR = 20;
const PT = 18;
const PB = 40;

export default function ScoreTrend({ points }: { points: TrendPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const values = points.flatMap((p) => [p.total, p.rw, p.math]).filter((v): v is number => v !== null);
  if (points.length === 0 || values.length === 0) return null;

  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const span = Math.max(100, rawMax - rawMin);
  const pad = span * 0.2;
  let min = Math.floor((rawMin - pad) / 50) * 50;
  let max = Math.ceil((rawMax + pad) / 50) * 50;
  if (max - min < 100) {
    min = Math.max(200, min - 50);
    max = Math.min(1600, max + 50);
  }

  const n = points.length;
  const x = (i: number) => PL + (n === 1 ? (W - PL - PR) / 2 : (i / (n - 1)) * (W - PL - PR));
  const y = (v: number) => PT + (1 - (v - min) / (max - min)) * (H - PT - PB);

  const ticks = Array.from({ length: 5 }, (_, i) => min + ((max - min) * i) / 4);

  const totalPts = points.map((p, i) => ({ v: p.total, i })).filter((d): d is { v: number; i: number } => d.v !== null);
  const areaPath =
    totalPts.length >= 2
      ? `M ${x(totalPts[0].i)} ${y(totalPts[0].v)} ${totalPts
          .slice(1)
          .map((p) => `L ${x(p.i)} ${y(p.v)}`)
          .join(" ")} L ${x(totalPts[totalPts.length - 1].i)} ${H - PB} L ${x(totalPts[0].i)} ${H - PB} Z`
      : null;

  const firstTotal = totalPts.length ? totalPts[0].v : null;
  const lastTotal = totalPts.length ? totalPts[totalPts.length - 1].v : null;
  const delta = firstTotal !== null && lastTotal !== null ? lastTotal - firstTotal : null;

  return (
    <div className="trend">
      <div className="trend-head">
        <div className="trend-legend">
          {SERIES.map((s) => (
            <span className="trend-key" key={s.key}>
              <span className={`trend-swatch ${s.tone}`} aria-hidden="true" />
              {s.name}
            </span>
          ))}
        </div>
        {delta !== null && (
          <span className={`trend-delta${delta > 0 ? " up" : delta < 0 ? " down" : ""}`}>
            {delta > 0 ? "▲" : delta < 0 ? "▼" : "▬"} {delta > 0 ? "+" : ""}
            {delta} pts
          </span>
        )}
      </div>

      <div className="trend-tip" aria-live="polite">
        {hover !== null ? (
          <>
            <strong>{points[hover].label}</strong>
            {SERIES.map((s) => (
              <span key={s.key} className={`trend-key ${s.tone}`}>
                {s.name}: {points[hover][s.key] ?? "—"}
              </span>
            ))}
          </>
        ) : (
          <span className="trend-tip-hint">hover a point to inspect</span>
        )}
      </div>

      <svg
        className="trend-svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Practice test score trend across ${n} tests`}
        preserveAspectRatio="xMidYMid meet"
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: "#c6ff4a", stopOpacity: 0.22 }} />
            <stop offset="100%" style={{ stopColor: "#c6ff4a", stopOpacity: 0 }} />
          </linearGradient>
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line className="trend-grid" x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} />
            <text className="trend-tick" x={PL - 10} y={y(t) + 4} textAnchor="end">
              {Math.round(t)}
            </text>
          </g>
        ))}

        {points.map((p, i) => (
          <text className="trend-tick" key={`x${i}`} x={x(i)} y={H - PB + 22} textAnchor="middle">
            {p.label}
          </text>
        ))}

        {areaPath && <path className="trend-area" d={areaPath} />}

        {SERIES.map((s) => {
          const pts = points
            .map((p, i) => ({ v: p[s.key], i }))
            .filter((d): d is { v: number; i: number } => d.v !== null);
          if (pts.length === 0) return null;
          return (
            <g key={s.key} className={`trend-series ${s.tone}`}>
              {pts.length > 1 && (
                <polyline className="trend-line" points={pts.map((d) => `${x(d.i)},${y(d.v)}`).join(" ")} />
              )}
              {pts.map((d) => (
                <circle
                  className={`trend-dot${hover === d.i ? " hot" : ""}`}
                  key={d.i}
                  cx={x(d.i)}
                  cy={y(d.v)}
                  r={hover === d.i ? 5.5 : 3.5}
                />
              ))}
            </g>
          );
        })}

        {points.map((_, i) => (
          <rect
            key={`hit${i}`}
            className="trend-hit"
            x={n === 1 ? PL : i === 0 ? PL : x(i) - (x(1) - x(0)) / 2}
            width={n === 1 ? W - PL - PR : (x(1) - x(0)) / (i === 0 || i === n - 1 ? 2 : 1)}
            y={PT}
            height={H - PT - PB}
            onMouseEnter={() => setHover(i)}
          />
        ))}

        {hover !== null && (
          <line className="trend-guide" x1={x(hover)} x2={x(hover)} y1={PT} y2={H - PB} />
        )}
      </svg>

      <table className="sr-only">
        <caption>Practice test score history</caption>
        <thead>
          <tr>
            <th scope="col">Test</th>
            {SERIES.map((s) => (
              <th scope="col" key={s.key}>
                {s.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {points.map((p, i) => (
            <tr key={`row${i}`}>
              <th scope="row">{p.label}</th>
              <td>{p.total ?? "—"}</td>
              <td>{p.rw ?? "—"}</td>
              <td>{p.math ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
