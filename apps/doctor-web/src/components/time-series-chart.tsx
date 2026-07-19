"use client";

import { useMemo, useRef, useState } from "react";

/* Full-width interactive time-series chart: crosshair + tooltip that tracks
 * the pointer 1:1, symptom events as a marker rail under the plot, treatment
 * starts as dashed vertical lines. Server pages pass only serializable data. */

export type ChartPoint = { date: string; value: number | null };
export type ChartEvent = {
  date: string;
  title: string;
  severity?: "mild" | "moderate" | "severe";
  note?: string | null;
};
export type ChartMarker = { date: string; label: string };

const W = 800;
const H = 260;
const M = { top: 16, right: 16, bottom: 40, left: 44 };
const RAIL_Y = H - 14;

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

function niceTicks(min: number, max: number, count = 4) {
  const span = max - min || 1;
  const step = 10 ** Math.floor(Math.log10(span / count));
  const err = span / count / step;
  const mult = err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1;
  const s = mult * step;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / s) * s; v <= max + 1e-9; v += s) ticks.push(v);
  return ticks;
}

export function TimeSeriesChart({
  points,
  events = [],
  markers = [],
  unit,
  decimals = 0,
  scale = 1,
  yMin,
  yMax,
  label,
}: {
  points: ChartPoint[];
  events?: ChartEvent[];
  markers?: ChartMarker[];
  unit: string;
  decimals?: number;
  scale?: number;
  yMin?: number;
  yMax?: number;
  label: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const model = useMemo(() => {
    const valued = points
      .map((p, i) => ({ ...p, i, v: p.value == null ? null : p.value * scale }))
      .filter((p): p is typeof p & { v: number } => p.v != null);
    if (valued.length < 2) return null;

    const t0 = new Date(points[0].date).getTime();
    const t1 = new Date(points[points.length - 1].date).getTime();
    const vMin = yMin ?? Math.min(...valued.map((p) => p.v));
    const vMax = yMax ?? Math.max(...valued.map((p) => p.v));
    const pad = yMin != null && yMax != null ? 0 : (vMax - vMin || 1) * 0.12;
    const lo = yMin ?? vMin - pad;
    const hi = yMax ?? vMax + pad;

    const x = (date: string) =>
      M.left + ((new Date(date).getTime() - t0) / Math.max(t1 - t0, 1)) * (W - M.left - M.right);
    const y = (v: number) =>
      M.top + (1 - (v - lo) / (hi - lo)) * (H - M.top - M.bottom);

    const path = valued
      .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.date).toFixed(1)},${y(p.v).toFixed(1)}`)
      .join(" ");

    /* ~6 x-axis date labels */
    const xTickEvery = Math.max(1, Math.round(points.length / 6));
    const xTicks = points.filter((_, i) => i % xTickEvery === 0);

    return { valued, x, y, path, lo, hi, ticks: niceTicks(lo, hi), xTicks };
  }, [points, scale, yMin, yMax]);

  if (!model) return <p className="empty">Not enough data to chart.</p>;
  const { valued, x, y, path, ticks, xTicks } = model;

  const eventsByDate = new Map(events.map((e) => [e.date.slice(0, 10), e]));

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    let bestDist = Infinity;
    valued.forEach((p, i) => {
      const d = Math.abs(x(p.date) - px);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    setHover(best);
  }

  const h = hover != null ? valued[hover] : null;
  const hEvent = h ? eventsByDate.get(h.date.slice(0, 10)) : null;

  return (
    <div className="chart-wrap" ref={wrapRef}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={label}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={M.left}
              x2={W - M.right}
              y1={y(t)}
              y2={y(t)}
              className="chart-grid"
            />
            <text x={M.left - 8} y={y(t) + 3} className="chart-tick" textAnchor="end">
              {t.toFixed(decimals)}
            </text>
          </g>
        ))}
        {xTicks.map((p) => (
          <text
            key={p.date}
            x={x(p.date)}
            y={H - M.bottom + 18}
            className="chart-tick"
            textAnchor="middle"
          >
            {dateFmt.format(new Date(p.date))}
          </text>
        ))}

        {markers.map((m) => (
          <g key={m.date + m.label}>
            <line
              x1={x(m.date)}
              x2={x(m.date)}
              y1={M.top}
              y2={H - M.bottom}
              className="chart-marker"
            />
            <title>{m.label}</title>
          </g>
        ))}

        <path d={path} fill="none" stroke="var(--series-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {events.map((e) => (
          <circle
            key={e.date + e.title}
            cx={x(e.date)}
            cy={RAIL_Y}
            r="4"
            className={`chart-event ${e.severity ?? ""}`}
          >
            <title>{`${dateFmt.format(new Date(e.date))}: ${e.title}`}</title>
          </circle>
        ))}

        {h && (
          <g>
            <line x1={x(h.date)} x2={x(h.date)} y1={M.top} y2={H - M.bottom} className="chart-crosshair" />
            <circle cx={x(h.date)} cy={y(h.v)} r="4" fill="var(--series-1)" stroke="var(--surface)" strokeWidth="2" />
          </g>
        )}

        <rect
          x={M.left}
          y={0}
          width={W - M.left - M.right}
          height={H}
          fill="transparent"
        />
      </svg>

      {h && (
        <div
          className="chart-tip"
          style={{ left: `${(x(h.date) / W) * 100}%` }}
          role="status"
        >
          <span className="chart-tip-date">{dateFmt.format(new Date(h.date))}</span>
          <span className="chart-tip-value">
            {h.v.toFixed(decimals)} {unit}
          </span>
          {hEvent && (
            <span className="chart-tip-event">
              {hEvent.title}
              {hEvent.note ? ` — ${hEvent.note}` : ""}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
