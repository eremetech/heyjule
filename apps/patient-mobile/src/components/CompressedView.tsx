import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { smoothPath } from '../lib/path';
import { colors, fonts, phaseLabel, phaseTint } from '../theme';
import {
  days,
  signalMeta,
  type Entry,
  type ProactiveQuestion,
  type SignalKey,
} from '../data/mock';

// Pinched out: conversation fades, a month of the body appears.
// Phase bands dominate, entries become severity markers,
// the Margin widens into a full trace. This is what the clinician receives.
export function CompressedView({
  entries,
  questions,
  signal,
  height,
  width,
}: {
  entries: Entry[];
  questions: ProactiveQuestion[];
  signal: SignalKey;
  height: number;
  width: number;
}) {
  const [selected, setSelected] = useState<Entry | null>(null);
  const rowH = (height - 24) / days.length;
  const meta = signalMeta[signal];

  const yOf = (iso: string) => {
    const i = days.findIndex((d) => d.iso === iso);
    return i < 0 ? -100 : 12 + i * rowH + rowH / 2;
  };

  const trace = useMemo(() => {
    const values = days.map((d) => d[signal]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const x0 = width * 0.57;
    const x1 = width - 26;
    return smoothPath(
      values.map((v, i) => ({
        x: x0 + ((v - min) / span) * (x1 - x0),
        y: 12 + i * rowH + rowH / 2,
      })),
    );
  }, [signal, rowH, width]);

  // phase band segments
  const bands = useMemo(() => {
    const segs: { phase: keyof typeof phaseTint; from: number; to: number }[] = [];
    days.forEach((d, i) => {
      const last = segs[segs.length - 1];
      if (last && last.phase === d.phase) last.to = i;
      else segs.push({ phase: d.phase, from: i, to: i });
    });
    return segs;
  }, []);

  return (
    <View style={[styles.wrap, { height }]}>
      {/* phase bands */}
      {bands.map((b, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            top: 12 + b.from * rowH,
            height: (b.to - b.from + 1) * rowH,
            left: 0,
            right: 0,
          }}
        >
          <Text style={styles.bandLabel}>{phaseLabel[b.phase].toUpperCase()}</Text>
        </View>
      ))}

      {/* week rules + dates */}
      {days.map((d, i) =>
        i % 7 === 0 ? (
          <View key={d.iso} style={[styles.weekRule, { top: 12 + i * rowH }]}>
            <Text style={styles.weekDate}>{d.iso.slice(5)}</Text>
          </View>
        ) : null,
      )}

      {/* widened signal trace + markers */}
      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Path
          d={trace}
          fill="none"
          stroke={colors.pistachioDeep}
          strokeWidth={1.25}
          strokeLinecap="round"
        />
        {questions.filter((q) => !q.dismissed).map((q) => {
          const y = yOf(q.iso);
          const x = width * 0.57 - 13;
          return (
            <Path
              key={q.id}
              d={`M ${x} ${y - 5} L ${x + 5} ${y} L ${x} ${y + 5} L ${x - 5} ${y} Z`}
            fill={colors.pistachioDeep}
            />
          );
        })}
        {entries.map((e) => (
          <Circle
            key={e.id}
            cx={54 + (e.symptom.charCodeAt(0) % 9) * 14}
            cy={yOf(e.iso)}
            r={3 + e.severity * 1.1}
            fill={colors.ink}
            opacity={0.8}
          />
        ))}
      </Svg>

      {/* touch layer for markers */}
      {entries.map((e) => (
        <Pressable
          key={e.id}
          onPress={() => setSelected(selected?.id === e.id ? null : e)}
          style={{
            position: 'absolute',
            left: 54 + (e.symptom.charCodeAt(0) % 9) * 14 - 20,
            top: yOf(e.iso) - 24,
            width: 40,
            height: 48,
          }}
        />
      ))}

      <Text style={styles.traceLabel}>{meta.label} — {meta.device}</Text>

      {selected && (
        <View style={[styles.popover, { top: Math.min(yOf(selected.iso) + 10, height - 120) }]}>
          <Text style={styles.popRaw}>“{selected.raw}”</Text>
          <Text style={styles.popContext}>CD {selected.context.cycleDay}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  bandLabel: {
    position: 'absolute',
    top: 3,
    left: 16,
    fontFamily: fonts.monoMed,
    fontSize: 10,
    letterSpacing: 1.4,
    color: colors.muted,
  },
  weekRule: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.rule,
  },
  weekDate: {
    position: 'absolute',
    right: 18,
    top: 3,
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.muted,
  },
  traceLabel: {
    position: 'absolute',
    bottom: 18,
    right: 18,
    fontFamily: fonts.mono,
    fontSize: 12,
    letterSpacing: 0.6,
    color: colors.muted,
  },
  popover: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: colors.paper,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.rule,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  popSymptom: { fontFamily: fonts.monoMed, fontSize: 13, color: colors.tennis },
  popRaw: {
    fontFamily: fonts.bodyItalic,
    fontSize: 16,
    color: colors.ink,
    marginTop: 6,
  },
  popContext: { fontFamily: fonts.mono, fontSize: 12, color: colors.pistachioDeep, marginTop: 8 },
  popSources: { fontFamily: fonts.mono, fontSize: 11, color: colors.muted, marginTop: 4 },
});
