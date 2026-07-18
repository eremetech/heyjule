import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Polyline, Rect } from 'react-native-svg';
import { colors, fonts } from '../theme';
import { days, signalMeta, type SignalKey } from '../data/mock';

const W = 24;

// The Margin: ~24px of living chart down the right edge,
// aligned to the Stream's time axis. Replaces an entire chart screen.
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

  const { points, glowYs } = useMemo(() => {
    const values = days.map((d) => d[signal]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const pts = values
      .map((v, i) => {
        const y = (i / (days.length - 1)) * (height - 16) + 8;
        const x = 4 + ((v - min) / span) * (W - 9);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
    const glows = anomalies
      .map((iso) => days.findIndex((d) => d.iso === iso))
      .filter((i) => i >= 0)
      .map((i) => (i / (days.length - 1)) * (height - 16) + 8);
    return { points: pts, glowYs: glows };
  }, [signal, height, anomalies]);

  const cursorY = 8 + scrollFraction * (height - 16);

  return (
    <View style={[styles.wrap, { height }]} pointerEvents="box-none">
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={(e) => {
          const y = e.nativeEvent.locationY;
          const hit = glowYs.find((g) => Math.abs(g - y) < 18);
          if (hit !== undefined) onJump((hit - 8) / (height - 16));
          else onCycle();
        }}
      >
        <Svg width={W} height={height}>
          <Rect x={0} y={0} width={StyleSheet.hairlineWidth} height={height} fill={colors.rule} />
          <Polyline
            points={points}
            fill="none"
            stroke={colors.pistachioDeep}
            strokeWidth={1.25}
            strokeLinejoin="round"
          />
          {glowYs.map((y, i) => (
            <React.Fragment key={i}>
              <Circle cx={W / 2} cy={y} r={8} fill={colors.tennisGlow} />
              <Circle cx={W / 2} cy={y} r={3} fill={colors.tennis} stroke={colors.ink} strokeWidth={0.5} />
            </React.Fragment>
          ))}
          {/* scroll cursor */}
          <Rect x={0} y={cursorY - 1} width={5} height={2} fill={colors.ink} />
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
