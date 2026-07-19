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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 22,
    alignItems: 'center',
    zIndex: 20,
  },
  bubbleWrap: {
    alignItems: 'center',
    marginBottom: 12,
    width: '100%',
    maxWidth: 420,
  },
  bubble: {
    backgroundColor: colors.paper,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.rule,
    paddingVertical: 15,
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
    borderTopColor: colors.paper,
    marginTop: -1,
  },
  bubbleKicker: {
    fontFamily: fonts.monoMed,
    fontSize: 10,
    letterSpacing: 2,
    color: colors.pistachioDeep,
    marginBottom: 6,
  },
  bubbleText: {
    fontFamily: fonts.displaySoft,
    fontSize: 18,
    lineHeight: 24,
    color: colors.ink,
  },
  bubbleActions: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 12,
  },
  bubbleAnswer: { fontFamily: fonts.monoMed, fontSize: 13, color: colors.pistachioDeep },
  bubbleDismiss: { fontFamily: fonts.mono, fontSize: 13, color: colors.muted },
  dock: {
    alignItems: 'center',
  },
  buttons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  voiceBtn: {
    width: 68,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: colors.ink,
    borderRadius: 16,
  },
  voiceBtnActive: {
    backgroundColor: colors.pistachio,
  },
  voiceDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.pistachio,
  },
  voiceDotActive: { backgroundColor: colors.ink },
  voiceLabel: {
    fontFamily: fonts.displaySoft,
    fontSize: 13,
    letterSpacing: -0.2,
    color: colors.paper,
  },
  voiceLabelActive: { color: colors.ink },
  textBtn: {
    width: 68,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: colors.paper,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.rule,
  },
  textGlyph: { fontFamily: fonts.mono, fontSize: 14, color: colors.ink },
  textLabel: {
    fontFamily: fonts.displaySoft,
    fontSize: 13,
    letterSpacing: -0.3,
    color: colors.ink,
  },
});
