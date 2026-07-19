/* Server-rendered single-series sparkline. One hue (series slot 1), 2px line,
 * native <title> tooltips on invisible per-day hit targets — no client JS. */

const W = 120;
const H = 32;
const PAD = 3;

export function Sparkline({
  points,
  labels,
  format,
  fixedRange,
}: {
  points: (number | null)[];
  labels: string[];
  format: (v: number) => string;
  fixedRange?: [number, number];
}) {
  const values = points.filter((v): v is number => v != null);
  if (values.length < 2) return null;

  const min = fixedRange ? fixedRange[0] : Math.min(...values);
  const max = fixedRange ? fixedRange[1] : Math.max(...values);
  const span = max - min || 1;
  const step = (W - PAD * 2) / (points.length - 1);

  const x = (i: number) => PAD + i * step;
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);

  const d = points
    .map((v, i) => (v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`))
    .filter(Boolean)
    .map((p, i) => (i === 0 ? `M${p}` : `L${p}`))
    .join(" ");

  const last = [...points].reverse().find((v) => v != null);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Trend over time">
      <path d={d} fill="none" stroke="var(--series-1)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {last != null && (
        <circle
          cx={x(points.lastIndexOf(last))}
          cy={y(last)}
          r="2.5"
          fill="var(--series-1)"
        />
      )}
      {points.map((v, i) =>
        v == null ? null : (
          <rect
            key={i}
            x={x(i) - step / 2}
            y={0}
            width={step}
            height={H}
            fill="transparent"
          >
            <title>{`${labels[i]}: ${format(v)}`}</title>
          </rect>
        )
      )}
    </svg>
  );
}
