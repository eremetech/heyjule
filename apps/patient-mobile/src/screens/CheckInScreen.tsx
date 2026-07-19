import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AnimatedOrb } from "../components/AnimatedOrb";
import { SoftPressable } from "../components/SoftPressable";
import { Waveform } from "../components/Waveform";
import { useAuth } from "../auth/AuthProvider";
import {
  createConversationClient,
  type ConversationEvent,
  type ConversationSession,
} from "../lib/conversation-client";
import { createHeyJuleApi } from "../lib/heyjule-api";
import { useHealthStore } from "../store/HealthStore";
import { colors, shadows, typography } from "../theme";
import type { SymptomKind } from "../types";

type CheckInScreenProps = {
  onClose: () => void;
  onComplete: () => void;
};

type Stage = "capture" | "review" | "saved";
type CaptureMode = "voice" | "text";
type VoiceState = "idle" | "connecting" | "listening" | "speaking" | "error";

type Message = {
  id: string;
  from: "jule" | "user";
  text: string;
};

const symptoms: SymptomKind[] = ["Headache", "Fatigue", "Nausea", "Pain", "Dizziness", "Other"];
function formatDuration(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function CheckInScreen({ onClose, onComplete }: CheckInScreenProps) {
  const insets = useSafeAreaInsets();
  const { addLog } = useHealthStore();
  const auth = useAuth();
  const api = useMemo(() => createHeyJuleApi(auth.getAccessToken), [auth.getAccessToken]);
  const conversationClient = useMemo(
    () => createConversationClient(api.getVoiceToken),
    [api],
  );
  const sessionRef = useRef<ConversationSession | null>(null);
  const sessionAbortRef = useRef<AbortController | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const userTranscriptRef = useRef<string[]>([]);
  const [stage, setStage] = useState<Stage>("capture");
  const [captureMode, setCaptureMode] = useState<CaptureMode>("voice");
  const [messages, setMessages] = useState<Message[]>([
    { id: "opening", from: "jule", text: "What feels different today?" },
  ]);
  const [draft, setDraft] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [selectedSymptoms, setSelectedSymptoms] = useState<SymptomKind[]>([]);
  const [severity, setSeverity] = useState(3);
  const [treatment, setTreatment] = useState("");
  const [voiceWasUsed, setVoiceWasUsed] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [recordingSaved, setRecordingSaved] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceLevel, setVoiceLevel] = useState(0.08);
  const [voiceDuration, setVoiceDuration] = useState(0);

  const userMessages = useMemo(() => messages.filter((message) => message.from === "user"), [messages]);
  const voiceActive = voiceState === "connecting" || voiceState === "listening" || voiceState === "speaking";

  useEffect(() => {
    if (!voiceActive || startedAtRef.current === null) return;
    const updateDuration = () => {
      if (startedAtRef.current !== null) setVoiceDuration(Date.now() - startedAtRef.current);
    };
    updateDuration();
    const interval = setInterval(updateDuration, 250);
    return () => clearInterval(interval);
  }, [voiceActive]);

  useEffect(() => () => {
    sessionAbortRef.current?.abort();
    void sessionRef.current?.end();
    sessionRef.current = null;
  }, []);

  function handleConversationEvent(event: ConversationEvent) {
    switch (event.type) {
      case "user_transcript":
        userTranscriptRef.current.push(event.text);
        setMessages((current) => [
          ...current,
          { id: `user_${Date.now()}`, from: "user", text: event.text },
        ]);
        break;
      case "agent_text":
        setMessages((current) => [
          ...current,
          { id: `jule_${Date.now()}`, from: "jule", text: event.text },
        ]);
        break;
      case "audio_level":
        setVoiceLevel(Math.max(0.04, event.value));
        break;
      case "status":
        setVoiceState(event.value);
        break;
      case "error":
        setVoiceState("error");
        Alert.alert("Voice check-in paused", event.message);
        break;
      case "ended":
        sessionRef.current = null;
        setVoiceState((current) => current === "error" ? current : "idle");
        setVoiceLevel(0.08);
        break;
    }
  }

  async function startRecording() {
    if (voiceActive) return;
    setVoiceState("connecting");
    setPermissionDenied(false);
    startedAtRef.current = Date.now();
    setVoiceDuration(0);
    const controller = new AbortController();
    sessionAbortRef.current = controller;
    try {
      const session = await conversationClient.start(handleConversationEvent, controller.signal);
      if (controller.signal.aborted) {
        await session.end();
        return;
      }
      sessionRef.current = session;
      setVoiceWasUsed(true);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (error) {
      if (controller.signal.aborted) {
        setVoiceState("idle");
        return;
      }
      const message = error instanceof Error ? error.message : "Voice check-in is unavailable.";
      const denied = /permission/iu.test(message);
      startedAtRef.current = null;
      setPermissionDenied(denied);
      sessionAbortRef.current = null;
      setVoiceState("error");
      Alert.alert(
        denied ? "Microphone access is off" : "Voice check-in unavailable",
        denied
          ? "You can still write your check-in, or allow microphone access in Settings."
          : "Please check your connection and try again. You can still write your check-in.",
      );
    }
  }

  async function stopRecording() {
    const session = sessionRef.current;
    sessionAbortRef.current?.abort();
    sessionAbortRef.current = null;
    sessionRef.current = null;
    startedAtRef.current = null;
    if (!session) {
      setVoiceState("idle");
      return;
    }
    await session.end();
    setVoiceState("idle");
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setRecordingSaved(true);
    setTimeout(() => setRecordingSaved(false), 2000);
  }

  async function handleClose() {
    await stopRecording();
    onClose();
  }

  async function openReview() {
    await stopRecording();
    const transcript = userTranscriptRef.current.join(" ");
    setReviewNote(transcript);
    setStage("review");
  }

  function sendMessage() {
    const text = draft.trim();
    if (!text) return;
    userTranscriptRef.current.push(text);
    const nextUserCount = userMessages.length + 1;
    const followUp =
      nextUserCount === 1
        ? "When did it start, and how strong is it from 1 to 5?"
        : "Did anything make it better or worse?";
    setMessages((current) => [
      ...current,
      { id: `user_${Date.now()}`, from: "user", text },
      { id: `jule_${Date.now()}`, from: "jule", text: followUp },
    ]);
    setDraft("");
    void Haptics.selectionAsync();
  }

  function toggleSymptom(symptom: SymptomKind) {
    setSelectedSymptoms((current) =>
      current.includes(symptom) ? current.filter((item) => item !== symptom) : [...current, symptom],
    );
    void Haptics.selectionAsync();
  }

  async function saveCheckIn() {
    await addLog({
      note: reviewNote.trim() || (voiceWasUsed ? "Voice check-in" : "Daily check-in"),
      symptoms: selectedSymptoms.length ? selectedSymptoms : ["Other"],
      severity,
      treatment: treatment.trim() || undefined,
      source: voiceWasUsed ? "voice" : "text",
      voiceDuration: voiceWasUsed ? Math.round(voiceDuration / 1000) : undefined,
    });
    setStage("saved");
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  if (stage === "saved") {
    return (
      <View style={[styles.screen, styles.savedScreen, { paddingTop: insets.top, paddingBottom: insets.bottom + 22 }]}>
        <AnimatedOrb size={218} mode="saved" />
        <Text style={styles.savedTitle}>You’re all caught up.</Text>
        <Text style={styles.savedCopy}>Today’s check-in is now part of your private health timeline.</Text>
        <SoftPressable onPress={onComplete} style={styles.primaryButton} accessibilityRole="button">
          <Text style={styles.primaryButtonText}>Done</Text>
          <Ionicons name="checkmark" size={18} color={colors.white} />
        </SoftPressable>
      </View>
    );
  }

  if (stage === "review") {
    return (
      <KeyboardAvoidingView
        style={[styles.screen, { paddingTop: insets.top }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.reviewHeader}>
          <SoftPressable onPress={() => setStage("capture")} style={styles.roundButton} accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={22} color={colors.ink} />
          </SoftPressable>
          <Text style={styles.headerLabel}>Review check-in</Text>
          <View style={styles.roundButton} />
        </View>
        <ScrollView
          contentContainerStyle={[styles.reviewContent, { paddingBottom: insets.bottom + 120 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.reviewTitle}>A quick look{`\n`}before you save.</Text>
          <Text style={styles.sectionEyebrow}>IN YOUR WORDS</Text>
          <TextInput
            value={reviewNote}
            onChangeText={setReviewNote}
            placeholder={voiceWasUsed ? "Add a note about what changed…" : "What changed today?"}
            placeholderTextColor={colors.inkFaint}
            multiline
            style={styles.reviewInput}
            textAlignVertical="top"
          />

          <Text style={styles.sectionEyebrow}>WHAT DID YOU NOTICE?</Text>
          <View style={styles.chipWrap}>
            {symptoms.map((symptom) => {
              const selected = selectedSymptoms.includes(symptom);
              return (
                <SoftPressable
                  key={symptom}
                  onPress={() => toggleSymptom(symptom)}
                  style={[styles.choiceChip, selected && styles.choiceChipSelected]}
                >
                  {selected ? <Ionicons name="checkmark" size={14} color={colors.coral} /> : null}
                  <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{symptom}</Text>
                </SoftPressable>
              );
            })}
          </View>

          <Text style={styles.sectionEyebrow}>HOW STRONG WAS IT?</Text>
          <View style={styles.severityRow}>
            {[1, 2, 3, 4, 5].map((value) => (
              <SoftPressable
                key={value}
                onPress={() => {
                  setSeverity(value);
                  void Haptics.selectionAsync();
                }}
                style={[styles.severityButton, value === severity && styles.severityButtonSelected]}
              >
                <Text style={[styles.severityText, value === severity && styles.severityTextSelected]}>{value}</Text>
              </SoftPressable>
            ))}
          </View>
          <View style={styles.severityLabels}>
            <Text style={styles.severityLabel}>Barely there</Text>
            <Text style={styles.severityLabel}>Very strong</Text>
          </View>

          <Text style={styles.sectionEyebrow}>WHAT HELPED? · OPTIONAL</Text>
          <TextInput
            value={treatment}
            onChangeText={setTreatment}
            placeholder="Rest, medication, movement…"
            placeholderTextColor={colors.inkFaint}
            style={styles.treatmentInput}
          />
        </ScrollView>
        <View style={[styles.reviewFooter, { paddingBottom: Math.max(insets.bottom, 14) }]}>
          <SoftPressable onPress={saveCheckIn} style={styles.primaryButton} accessibilityRole="button">
            <Text style={styles.primaryButtonText}>Save check-in</Text>
            <Ionicons name="arrow-forward" size={17} color={colors.white} />
          </SoftPressable>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingTop: insets.top + 4, paddingBottom: Math.max(insets.bottom, 12) }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.captureHeader}>
        <SoftPressable onPress={handleClose} style={styles.roundButton} accessibilityLabel="Close check-in">
          <Ionicons name="close" size={25} color={colors.ink} />
        </SoftPressable>
        <View style={styles.aiLabel}>
          <Ionicons name="sparkles" size={15} color={colors.coral} />
          <Text style={styles.headerLabel}>AI check-in</Text>
        </View>
        <SoftPressable
          onPress={() => Alert.alert(
            "How voice mode works",
            "While voice mode is active, audio is streamed to xAI for live responses. HeyJule saves only the transcript you review and approve.",
          )}
          style={styles.roundButton}
          accessibilityLabel="More options"
        >
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.ink} />
        </SoftPressable>
      </View>

      {captureMode === "voice" ? (
        <View style={styles.voiceBody}>
          <View style={styles.voicePrompt}>
            <Text style={styles.voiceTitle}>
              {voiceState === "speaking" ? "Jule is here with you." : voiceActive ? "Tell me what changed." : "Ready when you are."}
            </Text>
            <Text style={styles.voiceSubtitle}>
              {permissionDenied
                ? "Microphone is off — you can write instead."
                : voiceState === "connecting"
                  ? "Connecting securely…"
                  : voiceState === "speaking"
                    ? "You can interrupt at any time."
                    : voiceState === "listening"
                      ? "I’m listening."
                      : voiceState === "error"
                        ? "Tap the microphone to try again."
                  : voiceWasUsed
                    ? "Your conversation is ready to review."
                    : "Tap the microphone to begin."}
            </Text>
          </View>

          <View style={styles.voiceOrb}>
            <AnimatedOrb
              size={278}
              mode={voiceState === "listening" ? "listening" : "thinking"}
              level={voiceState === "listening" ? voiceLevel : voiceState === "speaking" ? 0.32 : 0.08}
            />
          </View>

          <Waveform level={voiceLevel} active={voiceActive} />
          <Text style={styles.timer}>{formatDuration(voiceDuration)}</Text>

          <View style={styles.voiceControls}>
            <SoftPressable
              onPress={() => {
                void stopRecording();
                setCaptureMode("text");
              }}
              style={styles.secondaryCircle}
              accessibilityLabel="Write instead"
            >
              <Ionicons name="keypad-outline" size={22} color={colors.inkSoft} />
            </SoftPressable>
            <SoftPressable
              onPress={voiceActive ? stopRecording : startRecording}
              style={[styles.micButton, voiceActive && styles.micButtonActive]}
              accessibilityLabel={voiceActive ? "Stop voice conversation" : "Start voice conversation"}
              disabled={voiceState === "connecting"}
            >
              <Ionicons name={voiceActive ? "stop" : "mic"} size={30} color={colors.white} />
            </SoftPressable>
            <SoftPressable onPress={openReview} style={styles.endButton} accessibilityLabel="End and review check-in">
              <Text style={styles.endText}>End</Text>
            </SoftPressable>
          </View>
          {recordingSaved && (
            <View style={styles.savedNotification}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              <Text style={styles.savedNotificationText}>Note saved</Text>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.textBody}>
          <View style={styles.textPrompt}>
            <Text style={styles.voiceTitle}>Tell me what changed.</Text>
            <Text style={styles.voiceSubtitle}>A few words are enough.</Text>
          </View>
          <ScrollView style={styles.messages} contentContainerStyle={styles.messagesContent} showsVerticalScrollIndicator={false}>
            {messages.map((message) => (
              <View key={message.id} style={[styles.message, message.from === "user" ? styles.userMessage : styles.juleMessage]}>
                <Text style={[styles.messageText, message.from === "user" && styles.userMessageText]}>{message.text}</Text>
              </View>
            ))}
          </ScrollView>
          <View style={styles.composer}>
            <SoftPressable onPress={() => setCaptureMode("voice")} style={styles.composerMic} accessibilityLabel="Use voice instead">
              <Ionicons name="mic-outline" size={21} color={colors.oliveDeep} />
            </SoftPressable>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={sendMessage}
              placeholder="Describe how you feel…"
              placeholderTextColor={colors.inkFaint}
              style={styles.composerInput}
              returnKeyType="send"
            />
            <SoftPressable onPress={sendMessage} style={[styles.sendButton, !draft.trim() && styles.sendButtonDisabled]} accessibilityLabel="Send message">
              <Ionicons name="arrow-up" size={18} color={colors.white} />
            </SoftPressable>
          </View>
          <SoftPressable onPress={openReview} style={styles.textReviewButton} accessibilityRole="button">
            <Text style={styles.textReviewLabel}>Review check-in</Text>
            <Ionicons name="arrow-forward" size={15} color={colors.coral} />
          </SoftPressable>
        </View>
      )}

      <View style={styles.privacyRow}>
        <Ionicons name="lock-closed-outline" size={13} color={colors.inkFaint} />
        <Text style={styles.privacyText}>Nothing is saved until you review it.</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  captureHeader: {
    height: 58,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  reviewHeader: {
    height: 58,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  roundButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  aiLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerLabel: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
  voiceBody: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 24,
  },
  voicePrompt: {
    alignItems: "center",
    paddingTop: 48,
  },
  voiceTitle: {
    fontFamily: typography.display,
    color: colors.ink,
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: -0.6,
    textAlign: "center",
  },
  voiceSubtitle: {
    color: colors.inkFaint,
    fontSize: 13,
    marginTop: 8,
    textAlign: "center",
  },
  voiceOrb: {
    flex: 1,
    minHeight: 284,
    alignItems: "center",
    justifyContent: "center",
  },
  timer: {
    color: colors.inkFaint,
    fontSize: 13,
    fontVariant: ["tabular-nums"],
    marginTop: 6,
  },
  voiceControls: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    marginTop: 26,
    marginBottom: 22,
  },
  secondaryCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(255,255,255,0.55)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  micButton: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: colors.olive,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.lifted,
  },
  micButtonActive: {
    backgroundColor: colors.coral,
  },
  endButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "rgba(255,255,255,0.55)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  endText: {
    color: colors.coral,
    fontSize: 12,
    fontWeight: "600",
  },
  savedNotification: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginVertical: 12,
    borderRadius: 18,
    backgroundColor: "rgba(245,200,190,0.24)",
    alignSelf: "center",
  },
  savedNotificationText: {
    color: colors.coral,
    fontSize: 14,
    fontWeight: "600",
  },
  privacyRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 20,
    paddingBottom: 6,
  },
  privacyText: {
    color: colors.inkFaint,
    fontSize: 10,
    letterSpacing: 0.05,
  },
  textBody: {
    flex: 1,
    paddingHorizontal: 20,
  },
  textPrompt: {
    alignItems: "center",
    paddingTop: 26,
    paddingBottom: 20,
  },
  messages: {
    flex: 1,
  },
  messagesContent: {
    paddingVertical: 8,
    gap: 12,
  },
  message: {
    maxWidth: "82%",
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 19,
  },
  juleMessage: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.68)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  userMessage: {
    alignSelf: "flex-end",
    backgroundColor: colors.olive,
  },
  messageText: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20,
  },
  userMessageText: {
    color: colors.white,
  },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.78)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    borderRadius: 25,
    padding: 5,
    paddingLeft: 8,
    ...shadows.quiet,
  },
  composerMic: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(136,148,96,0.12)",
  },
  composerInput: {
    flex: 1,
    color: colors.ink,
    fontSize: 14,
    paddingVertical: 10,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.olive,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    opacity: 0.36,
  },
  textReviewButton: {
    alignSelf: "center",
    height: 46,
    paddingHorizontal: 14,
    marginTop: 10,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  textReviewLabel: {
    color: colors.coral,
    fontSize: 13,
    fontWeight: "600",
  },
  reviewContent: {
    paddingHorizontal: 22,
    paddingTop: 30,
  },
  reviewTitle: {
    fontFamily: typography.display,
    fontSize: 34,
    lineHeight: 37,
    color: colors.ink,
    letterSpacing: -0.7,
    marginBottom: 32,
  },
  sectionEyebrow: {
    color: colors.inkFaint,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.1,
    marginBottom: 10,
    marginTop: 20,
  },
  reviewInput: {
    minHeight: 112,
    borderRadius: 20,
    padding: 16,
    color: colors.ink,
    fontSize: 15,
    lineHeight: 22,
    backgroundColor: "rgba(255,255,255,0.65)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
  },
  choiceChip: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  choiceChipSelected: {
    borderColor: "rgba(233,128,121,0.42)",
    backgroundColor: "rgba(245,200,190,0.26)",
  },
  choiceText: {
    color: colors.inkSoft,
    fontSize: 13,
    fontWeight: "500",
  },
  choiceTextSelected: {
    color: colors.coral,
  },
  severityRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  severityButton: {
    flex: 1,
    aspectRatio: 1,
    maxHeight: 58,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.5)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  severityButtonSelected: {
    backgroundColor: colors.olive,
    borderColor: colors.olive,
  },
  severityText: {
    color: colors.inkSoft,
    fontSize: 15,
    fontWeight: "600",
  },
  severityTextSelected: {
    color: colors.white,
  },
  severityLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 7,
  },
  severityLabel: {
    color: colors.inkFaint,
    fontSize: 10,
  },
  treatmentInput: {
    height: 52,
    borderRadius: 18,
    paddingHorizontal: 16,
    color: colors.ink,
    fontSize: 14,
    backgroundColor: "rgba(255,255,255,0.6)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  reviewFooter: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 22,
    paddingTop: 14,
    backgroundColor: "rgba(251,248,245,0.96)",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  primaryButton: {
    minWidth: 210,
    height: 56,
    paddingHorizontal: 22,
    borderRadius: 28,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    backgroundColor: colors.olive,
    ...shadows.lifted,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: "600",
  },
  savedScreen: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 36,
    gap: 10,
  },
  savedTitle: {
    fontFamily: typography.display,
    color: colors.ink,
    fontSize: 34,
    letterSpacing: -0.8,
    marginTop: 4,
  },
  savedCopy: {
    color: colors.inkFaint,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    maxWidth: 280,
    marginBottom: 28,
  },
});
