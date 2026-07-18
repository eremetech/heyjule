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
    fontSize: 8,
    letterSpacing: 2,
    color: colors.ink,
    opacity: 0.55,
    marginBottom: 6,
  },
  observation: {
    fontFamily: fonts.mono,
    fontSize: 11,
    lineHeight: 16,
    color: colors.ink,
    opacity: 0.75,
  },
  question: {
    fontFamily: fonts.display,
    fontSize: 17,
    letterSpacing: -0.3,
    color: colors.ink,
    marginTop: 7,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 9,
  },
  answerBtn: {
    backgroundColor: colors.ink,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 18,
  },
  answerText: { fontFamily: fonts.displaySoft, fontSize: 13, color: colors.paper },
  dismissText: { fontFamily: fonts.mono, fontSize: 11, color: colors.ink, opacity: 0.5 },
  answeredMark: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.ink,
    opacity: 0.6,
    marginTop: 8,
  },
});
