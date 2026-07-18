import React, { useMemo } from 'react';
import Svg, { Rect } from 'react-native-svg';
import { colors } from '../theme';

// Deterministic mock QR — a real payload comes later with the backend.
function hash(str: string, i: number): number {
  let h = 2166136261 ^ i;
  for (let c = 0; c < str.length; c++) {
    h ^= str.charCodeAt(c);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

const N = 25;

export function QRCode({ seed, size }: { seed: string; size: number }) {
  const cells = useMemo(() => {
    const out: { x: number; y: number }[] = [];
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const inFinder =
          (x < 7 && y < 7) || (x >= N - 7 && y < 7) || (x < 7 && y >= N - 7);
        if (inFinder) continue;
        if (hash(seed, y * N + x) > 0.52) out.push({ x, y });
      }
    }
    return out;
  }, [seed]);

  const u = size / N;
  const finder = (fx: number, fy: number) => (
    <>
      <Rect x={fx * u} y={fy * u} width={7 * u} height={7 * u} fill={colors.ink} />
      <Rect x={(fx + 1) * u} y={(fy + 1) * u} width={5 * u} height={5 * u} fill={colors.paper} />
      <Rect x={(fx + 2) * u} y={(fy + 2) * u} width={3 * u} height={3 * u} fill={colors.ink} />
    </>
  );

  return (
    <Svg width={size} height={size}>
      <Rect x={0} y={0} width={size} height={size} fill={colors.paper} />
      {cells.map((c, i) => (
        <Rect key={i} x={c.x * u} y={c.y * u} width={u * 0.92} height={u * 0.92} fill={colors.ink} />
      ))}
      {finder(0, 0)}
      {finder(N - 7, 0)}
      {finder(0, N - 7)}
    </Svg>
  );
}
