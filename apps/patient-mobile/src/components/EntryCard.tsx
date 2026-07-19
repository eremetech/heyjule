import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, phaseLabel } from '../theme';
import type { Entry } from '../data/mock';

// A coded record card. Not a chat bubble — an index card in the journal.
export function EntryCard({ entry }: { entry: Entry }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Pressable onPress={() => setExpanded((e) => !e)} style={styles.card}>
      <View style={styles.headRow}>
        <Text style={styles.time}>{entry.time}</Text>
        <Text style={styles.symptom}>{entry.symptom}</Text>
        <View style={styles.dots}>
          {[1, 2, 3].map((i) => (
            <View
              key={i}
              style={[styles.dot, i <= entry.severity ? styles.dotOn : styles.dotOff]}
            />
          ))}
        </View>
        <Text style={styles.category}>{entry.category.toUpperCase()}</Text>
      </View>

      <View style={styles.contextRow}>
        <Text style={styles.context}>
          CD {entry.context.cycleDay} · {phaseLabel[entry.context.phase].toLowerCase()} ·{' '}
          {entry.context.sleepHours.toFixed(1)} h sleep · {entry.context.signalValue}{' '}
          {entry.context.signalName.toLowerCase()}
        </Text>
        <Text style={styles.viaMark}>{entry.via === 'voice' ? '◉ voice' : '¶ text'}</Text>
      </View>

      {expanded && (
        <View style={styles.provenance}>
          <Text style={styles.raw}>“{entry.raw}”</Text>
          <Text style={styles.provTitle}>PROVENANCE</Text>
          {entry.context.sources.map((s, i) => (
            <View key={i} style={styles.provRow}>
              <Text style={styles.provValue}>{s.value}</Text>
              <Text style={styles.provDevice}>{s.device}</Text>
            </View>
          ))}
          <View style={styles.provRow}>
            <Text style={styles.provValue}>verbatim utterance</Text>
            <Text style={styles.provDevice}>stored on device</Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.paper,
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  time: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.muted,
  },
  symptom: {
    fontFamily: fonts.display,
    fontSize: 18,
    letterSpacing: -0.4,
    color: colors.ink,
  },
  dots: { flexDirection: 'row', gap: 3, alignSelf: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotOn: { backgroundColor: colors.ink },
  dotOff: { backgroundColor: colors.rule },
  category: {
    marginLeft: 'auto',
    fontFamily: fonts.monoMed,
    fontSize: 9,
    letterSpacing: 1.2,
    color: colors.ink,
    backgroundColor: colors.tennis,
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 9,
    overflow: 'hidden',
  },
  raw: {
    fontFamily: fonts.bodyItalic,
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkSoft,
    marginBottom: 10,
  },
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  context: {
    flex: 1,
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.muted,
  },
  viaMark: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.muted,
  },
  provenance: {
    marginTop: 8,
    backgroundColor: colors.cream,
    borderRadius: 12,
    padding: 12,
  },
  provTitle: {
    fontFamily: fonts.monoMed,
    fontSize: 8,
    letterSpacing: 2,
    color: colors.muted,
    marginBottom: 6,
  },
  provRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  provValue: { fontFamily: fonts.mono, fontSize: 11, color: colors.ink },
  provDevice: { fontFamily: fonts.mono, fontSize: 11, color: colors.pistachioDeep },
});
