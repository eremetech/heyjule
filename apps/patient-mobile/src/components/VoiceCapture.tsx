import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../theme';

// Demo utterance "transcribed" live while the voice button is held.
const DEMO_UTTERANCE = 'Sharp cramps since this morning, worse than usual';

// Live transcription strip that rises above the capture bar while holding.
// UI-only: words arrive on a timer; release logs whatever has arrived.
export function VoiceCapture({
  active,
  onTranscript,
}: {
  active: boolean;
  onTranscript: (partial: string) => void;
}) {
  const [words, setWords] = useState<string[]>([]);
  const bars = useRef([...Array(12)].map(() => new Animated.Value(0.3))).current;
  const rise = useRef(new Animated.Value(0)).current;

  // waveform choreography
  useEffect(() => {
    if (!active) return;
    const loops = bars.map((b, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(b, {
            toValue: 0.25 + Math.abs(Math.sin(i * 1.7)) * 0.75,
            duration: 260 + (i % 5) * 60,
            useNativeDriver: true,
          }),
          Animated.timing(b, {
            toValue: 0.2,
            duration: 240 + (i % 3) * 80,
            useNativeDriver: true,
          }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [active]);

  // words arriving
  useEffect(() => {
    if (active) {
      Animated.spring(rise, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 4 }).start();
      setWords([]);
      const all = DEMO_UTTERANCE.split(' ');
      let i = 0;
      const t = setInterval(() => {
        i += 1;
        const next = all.slice(0, i);
        setWords(next);
        onTranscript(next.join(' '));
        if (i >= all.length) clearInterval(t);
      }, 240);
      return () => clearInterval(t);
    }
    Animated.timing(rise, { toValue: 0, duration: 160, useNativeDriver: true }).start();
  }, [active]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wrap,
        {
          opacity: rise,
          transform: [
            { translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }) },
          ],
        },
      ]}
    >
      <View style={styles.waveRow}>
        {bars.map((b, i) => (
          <Animated.View key={i} style={[styles.bar, { transform: [{ scaleY: b }] }]} />
        ))}
      </View>
      <Text style={styles.transcript}>
        {words.length ? words.join(' ') : 'listening…'}
        <Text style={styles.caret}>▎</Text>
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 90,
    backgroundColor: colors.paper,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.rule,
    padding: 14,
    zIndex: 19,
  },
  waveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 26,
    marginBottom: 10,
  },
  bar: {
    width: 3,
    height: 24,
    borderRadius: 2,
    backgroundColor: colors.pistachioDeep,
  },
  transcript: {
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 22,
    color: colors.ink,
  },
  caret: { color: colors.pistachioDeep },
});
