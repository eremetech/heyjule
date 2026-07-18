import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Polyline } from 'react-native-svg';
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
  const rowH = (height - 30) / days.length;
  const meta = signalMeta[signal];

  const yOf = (iso: string) => {
    const i = days.findIndex((d) => d.iso === iso);
    return i < 0 ? -100 : 15 + i * rowH + rowH / 2;
  };

  const trace = useMemo(() => {
    const values = days.map((d) => d[signal]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const x0 = width * 0.55;
    const x1 = width - 20;
    return values
      .map((v, i) => {
        const y = 15 + i * rowH + rowH / 2;
        const x = x0 + ((v - min) / span) * (x1 - x0);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
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
            top: 15 + b.from * rowH,
            height: (b.to - b.from + 1) * rowH,
            left: 0,
            right: 0,
            backgroundColor: phaseTint[b.phase],
          }}
        >
          <Text style={styles.bandLabel}>{phaseLabel[b.phase].toUpperCase()}</Text>
        </View>
      ))}

      {/* week rules + dates */}
      {days.map((d, i) =>
        i % 7 === 0 ? (
          <View key={d.iso} style={[styles.weekRule, { top: 15 + i * rowH }]}>
            <Text style={styles.weekDate}>{d.iso.slice(5)}</Text>
          </View>
        ) : null,
      )}

      {/* widened signal trace + markers */}
      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Polyline
          points={trace}
          fill="none"
          stroke={colors.pistachioDeep}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
        {questions.filter((q) => !q.dismissed).map((q) => {
          const y = yOf(q.iso);
          const x = width * 0.55 - 16;
          return (
            <Path
              key={q.id}
              d={`M ${x} ${y - 5} L ${x + 5} ${y} L ${x} ${y + 5} L ${x - 5} ${y} Z`}
              fill={colors.tennis}
              stroke={colors.ink}
              strokeWidth={0.6}
            />
          );
        })}
        {entries.map((e) => (
          <Circle
            key={e.id}
            cx={54 + (e.symptom.charCodeAt(0) % 9) * 14}
            cy={yOf(e.iso)}
            r={2.5 + e.severity * 1.6}
            fill={colors.ink}
            opacity={0.85}
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
            left: 54 + (e.symptom.charCodeAt(0) % 9) * 14 - 12,
            top: yOf(e.iso) - 12,
            width: 24,
            height: 24,
          }}
        />
      ))}

      <Text style={styles.traceLabel}>{meta.label} — {meta.device}</Text>

      {selected && (
        <View style={[styles.popover, { top: Math.min(yOf(selected.iso) + 10, height - 120) }]}>
          <Text style={styles.popSymptom}>
            {selected.symptom} · sev {selected.severity} · {selected.category}
          </Text>
          <Text style={styles.popRaw}>“{selected.raw}”</Text>
          <Text style={styles.popContext}>
            CD {selected.context.cycleDay} · {selected.context.sleepHours.toFixed(1)} h sleep ·{' '}
            {selected.context.signalValue}
          </Text>
          <Text style={styles.popSources}>
            {selected.context.sources.map((s) => s.device).join(' · ')}
          </Text>
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
    left: 8,
    fontFamily: fonts.monoMed,
    fontSize: 7,
    letterSpacing: 2,
    color: 'rgba(33,31,25,0.4)',
  },
  weekRule: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(33,31,25,0.18)',
  },
  weekDate: {
    position: 'absolute',
    right: 6,
    top: 1,
    fontFamily: fonts.mono,
    fontSize: 8,
    color: colors.muted,
  },
  traceLabel: {
    position: 'absolute',
    bottom: 6,
    right: 10,
    fontFamily: fonts.mono,
    fontSize: 8,
    letterSpacing: 1,
    color: colors.pistachioDeep,
  },
  popover: {
    position: 'absolute',
    left: 16,
    right: 40,
    backgroundColor: colors.ink,
    borderRadius: 4,
    padding: 12,
  },
  popSymptom: { fontFamily: fonts.monoMed, fontSize: 11, color: colors.tennis },
  popRaw: {
    fontFamily: fonts.bodyItalic,
    fontSize: 13,
    color: colors.cream,
    marginTop: 4,
  },
  popContext: { fontFamily: fonts.mono, fontSize: 10, color: colors.pistachio, marginTop: 6 },
  popSources: { fontFamily: fonts.mono, fontSize: 9, color: colors.muted, marginTop: 3 },
});
