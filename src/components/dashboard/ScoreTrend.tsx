"use client";

import { useState } from "react";

/**
 * Score trend — an interactive, dependency-free SVG line chart of practice-test
 * history. Total, Reading & Writing and Math are separate series, drawn as
 * monotone cubic curves (smooth, no overshoot), with an area fill under Total,
 * a point-tied tooltip card and an emphasised latest score. No data is stored
 * here; the numbers all come from completed practice tests.
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
const PL = 56;
const PR = 24;
const PT = 20;
const PB = 44;
const TIP_W = 176;
const TIP_H = 84;

type Pt = { x: number; y: number };

/** Round tick values (…600, 800, 1000…) instead of arbitrary fractions. */
function niceTicks(min: number, max: number, count = 5): number[] {
  const rawStep = (max - min) / (count - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(rawStep, 1))));
  const norm = rawStep / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const first = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = first; v <= max + 1e-6; v += step) out.push(Math.round(v));
  return out;
}

/**
 * Straight segments between the points, the classic dot-and-line plot. The
 * smoothed curve this replaced looked elegant but told a lie: it invented
 * intermediate scores between tests and made a two-point history read like a
 * sweeping trend. Every bend here is a real test.
 */
function linePath(pts: Pt[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

export default function ScoreTrend({ points, target = null }: { points: TrendPoint[]; target?: number | null }) {
  const [hover, setHover] = useState<number | null>(null);

  const values = points.flatMap((p) => [p.total, p.rw, p.math]).filter((v): v is number => v !== null);
  if (points.length === 0 || values.length === 0) return null;

  // The target is deliberately NOT folded into the range: a distant goal (400
  // scored, 1550 aimed for) stretched the axis until the real point sat alone in
  // an empty grid. The goal is drawn inside the plot when it fits there, and
  // pinned to the top edge as an off-scale marker when it doesn't.

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

  // Snap the range out to the round tick values so the grid is readable.
  const ticks = niceTicks(min, max);
  if (ticks.length) {
    min = Math.min(min, ticks[0]);
    max = Math.max(max, ticks[ticks.length - 1]);
  }

  const x = (i: number) => PL + (n === 1 ? (W - PL - PR) / 2 : (i / (n - 1)) * (W - PL - PR));
  const y = (v: number) => PT + (1 - (v - min) / (max - min)) * (H - PT - PB);
  const targetInRange =
    target !== null && Number.isFinite(target) && target >= min && target <= max;

  // Thin the x labels so a long history never collides with itself.
  const labelEvery = n <= 8 ? 1 : Math.ceil(n / 8);
  const showLabel = (i: number) => i === 0 || i === n - 1 || i % labelEvery === 0;

  const seriesPts = (key: (typeof SERIES)[number]["key"]) =>
    points
      .map((p, i) => ({ v: p[key], i }))
      .filter((d): d is { v: number; i: number } => d.v !== null);

  const totalPts = seriesPts("total");

  const firstTotal = totalPts[0] ?? null;
  const lastTotal = totalPts[totalPts.length - 1] ?? null;
  const delta = firstTotal && lastTotal ? lastTotal.v - firstTotal.v : null;

  const lastScore = lastTotal?.v ?? null;
  const bestScore = totalPts.length ? Math.max(...totalPts.map((d) => d.v)) : null;
  const gap = target !== null && lastScore !== null ? target - lastScore : null;

  // Tooltip card flips left once the point passes the midline, so it never
  // runs off the plot — and it sits beside the point it describes.
  const tipAnchor = hover === null ? null : (points[hover].total ?? points[hover].rw ?? points[hover].math ?? min);
  const tipX =
    hover === null
      ? 0
      : x(hover) + 16 + TIP_W > W - PR
        ? x(hover) - 16 - TIP_W
        : x(hover) + 16;
  const tipY =
    hover === null || tipAnchor === null
      ? 0
      : Math.min(Math.max(PT + 4, y(tipAnchor) - TIP_H / 2), H - PB - TIP_H);

  // A single scored test is not a trend, and an empty grid with one dot in it
  // reads as broken. Show the numbers instead; the chart appears with test two.
  if (n === 1 && lastScore !== null) {
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
          {gap !== null && (
            <span className={`trend-gap${gap > 0 ? "" : " met"}`}>
              {gap > 0 ? `${gap} pts to target ${target}` : `Target ${target} reached`}
            </span>
          )}
        </div>
        <div className="trend-summary">
          <div>
            <span>Latest</span>
            <strong>{lastScore}</strong>
          </div>
          <div>
            <span>Best</span>
            <strong>{bestScore}</strong>
          </div>
          {gap !== null && (
            <div>
              <span>{gap > 0 ? "To target" : "Over target"}</span>
              <strong>{Math.abs(gap)}</strong>
            </div>
          )}
          <p className="trend-summary-note">
            One full-length mock scored. The moment you finish a second, the trend line appears here.
          </p>
        </div>
      </div>
    );
  }

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
        {delta !== null && firstTotal && (
          <span className={`trend-delta${delta > 0 ? " up" : delta < 0 ? " down" : ""}`}>
            {delta > 0 ? "▲" : delta < 0 ? "▼" : "▬"} {delta > 0 ? "+" : ""}
            {delta} pts since {points[firstTotal.i].label}
          </span>
        )}
        {gap !== null && (
          <span className={`trend-gap${gap > 0 ? "" : " met"}`}>
            {gap > 0 ? `${gap} pts to target ${target}` : `Target ${target} reached`}
          </span>
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
        {ticks.map((t) => (
          <g key={t}>
            <line className="trend-grid" x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} />
            <text className="trend-tick" x={PL - 12} y={y(t) + 4} textAnchor="end">
              {Math.round(t)}
            </text>
          </g>
        ))}

        {target !== null && Number.isFinite(target) &&
          (targetInRange ? (
            <g className="trend-target">
              <line className="trend-target-line" x1={PL} x2={W - PR} y1={y(target)} y2={y(target)} />
              <text className="trend-target-label" x={W - PR} y={y(target) - 9} textAnchor="end">
                Target {target}
              </text>
            </g>
          ) : (
            /* Off the top of this view: pin the goal to the edge with an arrow, so
               the distance stays legible without squashing the real scores. */
            <g className="trend-target">
              <line className="trend-target-line off" x1={PL} x2={W - PR} y1={PT + 10} y2={PT + 10} />
              <text className="trend-target-label" x={W - PR} y={PT + 2} textAnchor="end">
                Target {target} ↑ above this view
              </text>
            </g>
          ))}

        {points.map((p, i) =>
          showLabel(i) ? (
            <text className="trend-tick" key={`x${i}`} x={x(i)} y={H - PB + 24} textAnchor="middle">
              {p.label}
            </text>
          ) : null
        )}

        {SERIES.map((s, si) => {
          const pts = seriesPts(s.key);
          if (pts.length === 0) return null;
          const xy: Pt[] = pts.map((d) => ({ x: x(d.i), y: y(d.v) }));
          return (
            <g key={s.key} className={`trend-series ${s.tone}`}>
              {pts.length > 1 && (
                <path className="trend-line" d={linePath(xy)} pathLength={1} style={{ animationDelay: `${si * 90}ms` }} />
              )}
              {pts.map((d, k) => (
                <circle
                  className={`trend-dot${hover === d.i ? " hot" : ""}`}
                  key={d.i}
                  cx={x(d.i)}
                  cy={y(d.v)}
                  r={hover === d.i ? 7.5 : 5.5}
                  style={{ animationDelay: `${Math.min(si * 90 + k * 35, 520)}ms` }}
                />
              ))}
            </g>
          );
        })}

        {/* The latest total, called out — the number the student came for.
            Anchored above-left of its point so it never runs off the plot, with
            a single pulse on arrival so the eye lands on it. */}
        {lastTotal && (
          <>
            <circle className="trend-pulse" cx={x(lastTotal.i)} cy={y(lastTotal.v)} r={13} aria-hidden="true" />
            <text
              className="trend-last"
              x={n === 1 ? x(lastTotal.i) : x(lastTotal.i) - 6}
              y={y(lastTotal.v) - 12}
              textAnchor={n === 1 ? "middle" : "end"}
            >
              {lastTotal.v}
            </text>
          </>
        )}

        {points.map((_, i) => (
          <rect
            key={`hit${i}`}
            className="trend-hit"
            x={n === 1 ? PL : i === 0 ? PL : (x(i - 1) + x(i)) / 2}
            width={
              n === 1
                ? W - PL - PR
                : i === 0
                  ? (x(0) + x(1)) / 2 - PL
                  : i === n - 1
                    ? W - PR - (x(i - 1) + x(i)) / 2
                    : (x(i + 1) - x(i - 1)) / 2
            }
            y={PT}
            height={H - PT - PB}
            onMouseEnter={() => setHover(i)}
          />
        ))}

        {hover !== null && (
          <>
            <line className="trend-guide" x1={x(hover)} x2={x(hover)} y1={PT} y2={H - PB} />
            <g className="trend-tipcard" transform={`translate(${tipX}, ${tipY})`} aria-hidden="true">
              <rect className="trend-tip-bg" x={0} y={0} width={TIP_W} height={TIP_H} rx={12} />
              <text className="trend-tip-title" x={14} y={25}>
                {points[hover].label}
              </text>
              {SERIES.map((s, i) => (
                <g key={s.key}>
                  <circle className={`trend-tip-dot ${s.tone}`} cx={19} cy={43 + i * 18} r={3.5} />
                  <text className="trend-tip-row" x={32} y={47 + i * 18}>
                    {s.name}
                  </text>
                  <text className="trend-tip-val" x={TIP_W - 14} y={47 + i * 18} textAnchor="end">
                    {points[hover][s.key] ?? "—"}
                  </text>
                </g>
              ))}
            </g>
          </>
        )}
      </svg>

      {(n === 2 && lastScore !== null) && (
        <div className="trend-summary">
          <div>
            <span>Latest</span>
            <strong>{lastScore}</strong>
          </div>
          <div>
            <span>Best</span>
            <strong>{bestScore}</strong>
          </div>
          {gap !== null && (
            <div>
              <span>{gap > 0 ? "To target" : "Over target"}</span>
              <strong>{Math.abs(gap)}</strong>
            </div>
          )}
          <p className="trend-summary-note">
            Two mocks so far. The picture sharpens with every full-length test you finish.
          </p>
        </div>
      )}
      <p className="trend-caption">
        Each dot is one completed full-length practice test · hover a point for the reading, math and total breakdown.
      </p>

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
