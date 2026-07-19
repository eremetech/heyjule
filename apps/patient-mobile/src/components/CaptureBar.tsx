import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../theme';
import { tapLight } from '../lib/haptics';

// Two doors into the record: Voice (hold) and Text (tap).
// No chat surface. When the extraction agent has a follow-up,
// it appears as a speech bubble growing from the top of the buttons.
export function CaptureBar({
  followUp,
  onVoicePressIn,
  onVoicePressOut,
  voiceActive,
  onTextPress,
  onFollowUpAnswer,
  onFollowUpDismiss,
}: {
  followUp: string | null;
  onVoicePressIn: () => void;
  onVoicePressOut: () => void;
  voiceActive: boolean;
  onTextPress: () => void;
  onFollowUpAnswer: () => void;
  onFollowUpDismiss: () => void;
}) {
  const bubbleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(bubbleAnim, {
      toValue: followUp ? 1 : 0,
      useNativeDriver: true,
      speed: 14,
      bounciness: 7,
    }).start();
    if (followUp) tapLight();
  }, [followUp]);

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {/* Follow-up speech bubble, sprouting from the buttons */}
      <Animated.View
        pointerEvents={followUp ? 'auto' : 'none'}
        style={[
          styles.bubbleWrap,
          {
            opacity: bubbleAnim,
            transform: [
              {
                translateY: bubbleAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [14, 0],
                }),
              },
              { scale: bubbleAnim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
            ],
          },
        ]}
      >
        <Pressable style={styles.bubble} onPress={onFollowUpAnswer}>
          <Text style={styles.bubbleKicker}>ONE MORE THING</Text>
          <Text style={styles.bubbleText}>{followUp ?? ''}</Text>
          <View style={styles.bubbleActions}>
            <Text style={styles.bubbleAnswer}>answer ›</Text>
            <Pressable onPress={onFollowUpDismiss} hitSlop={10}>
              <Text style={styles.bubbleDismiss}>skip</Text>
            </Pressable>
          </View>
        </Pressable>
        <View style={styles.bubbleTail} />
      </Animated.View>

      <View style={styles.dock}>
        <View style={styles.buttons}>
          <Pressable
            onPressIn={onVoicePressIn}
            onPressOut={onVoicePressOut}
            style={[styles.voiceBtn, voiceActive && styles.voiceBtnActive]}
          >
            <View style={[styles.voiceDot, voiceActive && styles.voiceDotActive]} />
            <Text style={[styles.voiceLabel, voiceActive && styles.voiceLabelActive]}>
              {voiceActive ? 'listening…' : 'Voice'}
            </Text>
          </Pressable>

          <Pressable onPress={onTextPress} style={styles.textBtn}>
            <Text style={styles.textGlyph}>¶</Text>
            <Text style={styles.textLabel}>Text</Text>
          </Pressable>
        </View>
        <Text style={styles.hint}>hold to speak · release to log</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 24,
    bottom: 24,
    alignItems: 'center',
  },
  bubbleWrap: {
    alignItems: 'center',
    marginBottom: 10,
    maxWidth: 300,
  },
  bubble: {
    backgroundColor: colors.ink,
    borderRadius: 20,
    borderBottomRightRadius: 4,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  bubbleTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.ink,
    marginTop: -1,
  },
  bubbleKicker: {
    fontFamily: fonts.monoMed,
    fontSize: 8,
    letterSpacing: 2,
    color: colors.tennis,
    marginBottom: 4,
  },
  bubbleText: {
    fontFamily: fonts.displaySoft,
    fontSize: 15,
    lineHeight: 20,
    color: colors.paper,
  },
  bubbleActions: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 8,
  },
  bubbleAnswer: { fontFamily: fonts.monoMed, fontSize: 11, color: colors.tennis },
  bubbleDismiss: { fontFamily: fonts.mono, fontSize: 11, color: colors.muted },
  dock: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 32,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  buttons: {
    flexDirection: 'row',
    gap: 10,
  },
  voiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: colors.tennis,
    borderRadius: 999,
    paddingVertical: 16,
    paddingHorizontal: 28,
  },
  voiceBtnActive: {
    backgroundColor: colors.ink,
  },
  voiceDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.ink,
  },
  voiceDotActive: { backgroundColor: colors.tennis },
  voiceLabel: {
    fontFamily: fonts.display,
    fontSize: 16,
    letterSpacing: -0.3,
    color: colors.ink,
  },
  voiceLabelActive: { color: colors.tennis },
  textBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'transparent',
    borderRadius: 999,
    paddingVertical: 15,
    paddingHorizontal: 26,
    borderWidth: 1.5,
    borderColor: colors.ink,
  },
  textGlyph: { fontFamily: fonts.mono, fontSize: 15, color: colors.ink },
  textLabel: {
    fontFamily: fonts.display,
    fontSize: 16,
    letterSpacing: -0.3,
    color: colors.ink,
  },
  hint: {
    marginTop: 9,
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 0.5,
    color: colors.muted,
  },
});
