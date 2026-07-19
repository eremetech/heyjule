import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../theme';
import type { ProactiveQuestion } from '../data/mock';

// The assistant's question, anchored at the anomaly it describes.
// Visually distinct from her entries: green-edged, observation first, never a verdict.
export function ProactiveCard({
  q,
  onAnswer,
  onDismiss,
}: {
  q: ProactiveQuestion;
  onAnswer: (q: ProactiveQuestion) => void;
  onDismiss: (q: ProactiveQuestion) => void;
}) {
  if (q.dismissed) return null;
  const answered = !!q.answeredByEntryId;

  return (
    <View style={[styles.card, answered && styles.cardAnswered]}>
      <View style={styles.spine} />
      <View style={styles.body}>
        <Text style={styles.kicker}>NOTICED · {q.time}</Text>
        <Text style={styles.observation}>{q.observation}</Text>
        <Text style={styles.question}>{q.question}</Text>
        {!answered ? (
          <View style={styles.actions}>
            <Pressable onPress={() => onAnswer(q)} style={styles.answerBtn}>
              <Text style={styles.answerText}>Answer</Text>
            </Pressable>
            <Pressable onPress={() => onDismiss(q)} hitSlop={8}>
              <Text style={styles.dismissText}>dismiss</Text>
            </Pressable>
          </View>
        ) : (
          <Text style={styles.answeredMark}>✓ answered — linked to this moment</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: colors.tennis,
    borderRadius: 20,
    marginBottom: 10,
    overflow: 'hidden',
  },
  cardAnswered: { opacity: 0.55 },
  spine: {
    width: 0,
  },
  body: { flex: 1, paddingVertical: 14, paddingHorizontal: 16 },
  kicker: {
    fontFamily: fonts.monoMed,
    fontSize: 10,
    letterSpacing: 1.5,
    color: colors.ink,
    opacity: 0.55,
    marginBottom: 6,
  },
  observation: {
    fontFamily: fonts.mono,
    fontSize: 12,
    lineHeight: 18,
    color: colors.ink,
    opacity: 0.75,
  },
  question: {
    fontFamily: fonts.display,
    fontSize: 18,
    letterSpacing: -0.4,
    color: colors.ink,
    marginTop: 8,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 12,
  },
  answerBtn: {
    backgroundColor: colors.ink,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  answerText: { fontFamily: fonts.displaySoft, fontSize: 16, color: colors.paper },
  dismissText: { fontFamily: fonts.mono, fontSize: 14, color: colors.ink, opacity: 0.5 },
  answeredMark: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.ink,
    opacity: 0.6,
    marginTop: 10,
  },
});
