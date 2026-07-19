import { useMemo } from "react";
import { View } from "react-native";

const MODULES = 21;

function hashSeed(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(state: number) {
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function finderCell(row: number, col: number) {
  const corners: [number, number][] = [
    [0, 0],
    [0, MODULES - 7],
    [MODULES - 7, 0],
  ];
  for (const [r0, c0] of corners) {
    const r = row - r0;
    const c = col - c0;
    if (r >= 0 && r < 7 && c >= 0 && c < 7) {
      const ring = Math.min(r, c, 6 - r, 6 - c);
      return { finder: true, filled: ring === 0 || ring >= 2 };
    }
  }
  return { finder: false, filled: false };
}

type QRCodeProps = {
  seed: string;
  size: number;
  color?: string;
  background?: string;
};

// Deterministic QR-style visual for the prototype: same seed, same pattern.
// Not a scannable code — swap for a real encoder when the backend exists.
export function QRCode({ seed, size, color = "#30302E", background = "#FFFFFF" }: QRCodeProps) {
  const grid = useMemo(() => {
    const rand = mulberry32(hashSeed(seed));
    const rows: boolean[][] = [];
    for (let row = 0; row < MODULES; row++) {
      const cells: boolean[] = [];
      for (let col = 0; col < MODULES; col++) {
        const cell = finderCell(row, col);
        cells.push(cell.finder ? cell.filled : rand() < 0.46);
      }
      rows.push(cells);
    }
    return rows;
  }, [seed]);

  const cell = size / MODULES;

  return (
    <View style={{ width: size, height: size, backgroundColor: background }}>
      {grid.map((row, rowIndex) => (
        <View key={rowIndex} style={{ flexDirection: "row" }}>
          {row.map((filled, colIndex) => (
            <View
              key={colIndex}
              style={{ width: cell, height: cell, backgroundColor: filled ? color : background }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}
