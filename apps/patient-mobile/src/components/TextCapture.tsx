import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { colors, fonts } from '../theme';
import { tapMedium, confirm } from '../lib/haptics';

// Text door: the Stream blurs away, one block of paper appears in the center,
// the keyboard rises. Haptic on entry, haptic on submit.
export function TextCapture({
  visible,
  answering, // follow-up / proactive question being answered, if any
  onSubmit,
  onClose,
}: {
  visible: boolean;
  answering: string | null;
  onSubmit: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);
  const pop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      tapMedium(); // haptic on pop-up
      setText('');
      pop.setValue(0);
      Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 6 }).start();
      const t = setTimeout(() => inputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [visible]);

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    confirm(); // haptic on submit
    onSubmit(trimmed);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill}>
        <Pressable style={styles.scrim} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.center}
          pointerEvents="box-none"
        >
          <Animated.View
            style={[
              styles.card,
              {
                opacity: pop,
                transform: [
                  { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
                ],
              },
            ]}
          >
            {answering ? (
              <View style={styles.answeringBox}>
                <Text style={styles.answeringKicker}>ANSWERING</Text>
                <Text style={styles.answeringText}>{answering}</Text>
              </View>
            ) : (
              <Text style={styles.prompt}>What’s happening?</Text>
            )}

            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={setText}
              multiline
              placeholder="say it however it comes…"
              placeholderTextColor={colors.muted}
              style={[styles.input, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]}
              onSubmitEditing={submit}
            />

            <View style={styles.row}>
              <Text style={styles.note}>stays on this device</Text>
              <Pressable
                onPress={submit}
                style={[styles.submit, !text.trim() && styles.submitDisabled]}
              >
                <Text style={styles.submitText}>Log it</Text>
              </Pressable>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </BlurView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(32, 33, 31, 0.14)',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.paper,
    borderRadius: 18,
    padding: 20,
  },
  prompt: {
    fontFamily: fonts.displaySoft,
    fontSize: 23,
    letterSpacing: -0.5,
    color: colors.ink,
    marginBottom: 10,
  },
  answeringBox: {
    backgroundColor: colors.pistachio,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
    borderRadius: 10,
  },
  answeringKicker: {
    fontFamily: fonts.monoMed,
    fontSize: 8,
    letterSpacing: 2,
    color: colors.ink,
    opacity: 0.55,
    marginBottom: 3,
  },
  answeringText: {
    fontFamily: fonts.displaySoft,
    fontSize: 15,
    color: colors.ink,
  },
  input: {
    fontFamily: fonts.body,
    fontSize: 17,
    lineHeight: 24,
    color: colors.ink,
    minHeight: 88,
    textAlignVertical: 'top',
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  note: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.muted,
    letterSpacing: 0.5,
  },
  submit: {
    backgroundColor: colors.ink,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  submitDisabled: { opacity: 0.35 },
  submitText: {
    fontFamily: fonts.displaySoft,
    fontSize: 14,
    letterSpacing: -0.1,
    color: colors.paper,
  },
});
