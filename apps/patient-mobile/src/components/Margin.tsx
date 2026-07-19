import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors, fonts } from '../theme';
import { days, signalMeta, type SignalKey } from '../data/mock';
import { smoothPath, angleAt, type Pt } from '../lib/path';

const W = 26;

// A small leaf, drawn at the origin pointing right; scaled ~7px long.
const LEAF = 'M 0 0 C 2.5 -3, 6 -3, 8 0 C 6 3, 2.5 3, 0 0 Z';

// The Margin as a vine: the signal grows up the edge of the Stream as a smooth
// stem with small leaves; anomalies ripen into lime berries. Same data,
// friendlier plant.
export function Margin({
  height,
  signal,
  anomalies, // day isos that produced a proactive question
  scrollFraction, // 0 top (oldest) .. 1 bottom (today)
  onCycle,
  onJump,
}: {
  height: number;
  signal: SignalKey;
  anomalies: string[];
  scrollFraction: number;
  onCycle: () => void;
  onJump: (fraction: number) => void;
}) {
  const meta = signalMeta[signal];

  const { stem, leaves, berries } = useMemo(() => {
    const values = days.map((d) => d[signal]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const pts: Pt[] = values.map((v, i) => ({
      x: 5 + ((v - min) / span) * (W - 12),
      y: (i / (days.length - 1)) * (height - 16) + 8,
    }));

    // leaves sprout every few days, alternating sides of the stem
    const lv = pts
      .map((p, i) => ({ p, i }))
      .filter(({ i }) => i % 4 === 2)
      .map(({ p, i }, k) => {
        const side = k % 2 === 0 ? 1 : -1;
        const angle = angleAt(pts, i) + side * 55;
        return { x: p.x, y: p.y, angle, side };
      });

    const br = anomalies
      .map((iso) => days.findIndex((d) => d.iso === iso))
      .filter((i) => i >= 0)
      .map((i) => pts[i]);

    return { stem: smoothPath(pts), leaves: lv, berries: br };
  }, [signal, height, anomalies]);

  const cursorY = 8 + scrollFraction * (height - 16);

  return (
    <View style={[styles.wrap, { height }]} pointerEvents="box-none">
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={(e) => {
          const y = e.nativeEvent.locationY;
          const hit = berries.find((b) => Math.abs(b.y - y) < 18);
          if (hit) onJump((hit.y - 8) / (height - 16));
          else onCycle();
        }}
      >
        <Svg width={W} height={height}>
          {/* stem */}
          <Path
            d={stem}
            fill="none"
            stroke={colors.pistachioDeep}
            strokeWidth={1.6}
            strokeLinecap="round"
          />
          {/* leaves */}
          {leaves.map((l, i) => (
            <Path
              key={i}
              d={LEAF}
              fill={colors.pistachio}
              opacity={0.85}
              transform={`translate(${l.x}, ${l.y}) rotate(${l.angle})`}
            />
          ))}
          {/* berries at anomalies */}
          {berries.map((b, i) => (
            <React.Fragment key={i}>
              <Circle cx={b.x} cy={b.y} r={8} fill={colors.tennisGlow} />
              <Circle cx={b.x} cy={b.y} r={4} fill={colors.tennis} stroke={colors.pistachioDeep} strokeWidth={1} />
            </React.Fragment>
          ))}
          {/* scroll cursor */}
          <Rect x={0} y={cursorY - 1} width={5} height={2} rx={1} fill={colors.ink} />
        </Svg>
      </Pressable>
      <View style={styles.labelWrap} pointerEvents="none">
        <Text style={styles.label}>{meta.label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: W,
  },
  labelWrap: {
    position: 'absolute',
    top: 6,
    right: W + 2,
  },
  label: {
    fontFamily: fonts.monoMed,
    fontSize: 8,
    letterSpacing: 1.5,
    color: colors.muted,
    transform: [{ rotate: '90deg' }],
  },
});
