import React, { useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import {
  HankenGrotesk_400Regular,
  HankenGrotesk_400Regular_Italic,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_800ExtraBold,
} from '@expo-google-fonts/hanken-grotesk';
import {
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
} from '@expo-google-fonts/ibm-plex-mono';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { colors, fonts } from './src/theme';
import {
  extract,
  followUpFor,
  contextFor,
  seedEntries,
  seedQuestions,
  todayIso,
  type Entry,
  type ProactiveQuestion,
  type SignalKey,
} from './src/data/mock';
import { CaptureBar } from './src/components/CaptureBar';
import { TextCapture } from './src/components/TextCapture';
import { VoiceCapture } from './src/components/VoiceCapture';
import { InflowShelf } from './src/components/InflowShelf';
import { OutflowSheet } from './src/components/OutflowSheet';
import { CompressedView } from './src/components/CompressedView';
import { CyclePhaseGrid } from './src/components/CyclePhaseGrid';
import { confirm } from './src/lib/haptics';

function SettingsIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        stroke={colors.ink}
        strokeWidth={1.8}
      />
      <Path
        d="M19.4 13.1c.05-.36.05-.74 0-1.1l1.7-1.33a.5.5 0 0 0 .12-.64l-1.6-2.78a.5.5 0 0 0-.6-.22l-2 .8a7.1 7.1 0 0 0-.95-.55l-.3-2.14A.5.5 0 0 0 15.3 4h-3.2a.5.5 0 0 0-.5.43l-.3 2.14c-.34.14-.66.32-.95.55l-2-.8a.5.5 0 0 0-.6.22L4.55 9.32a.5.5 0 0 0 .12.64L6.37 11.3c-.05.36-.05.74 0 1.1l-1.7 1.33a.5.5 0 0 0-.12.64l1.6 2.78c.13.23.39.32.6.22l2-.8c.29.23.61.41.95.55l.3 2.14c.04.24.25.43.5.43h3.2c.25 0 .46-.19.5-.43l.3-2.14c.34-.14.66-.32.95-.55l2 .8c.22.1.47 0 .6-.22l1.6-2.78a.5.5 0 0 0-.12-.64L19.4 13.1Z"
        stroke={colors.ink}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function QrIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={3} width={8} height={8} rx={1.2} stroke={colors.ink} strokeWidth={1.8} />
      <Rect x={13} y={3} width={8} height={8} rx={1.2} stroke={colors.ink} strokeWidth={1.8} />
      <Rect x={3} y={13} width={8} height={8} rx={1.2} stroke={colors.ink} strokeWidth={1.8} />
      <Path
        d="M13 13h3v3h-3v-3Zm5 0h3v2h-2v3h-3v-2h2v-3Zm-2 5h2v3h-3v-2h1v-1Zm4 1h2v2h-2v-2Z"
        fill={colors.ink}
      />
      <Circle cx={7} cy={7} r={1.5} fill={colors.ink} />
      <Circle cx={17} cy={7} r={1.5} fill={colors.ink} />
      <Circle cx={7} cy={17} r={1.5} fill={colors.ink} />
    </Svg>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    HankenGrotesk_400Regular,
    HankenGrotesk_400Regular_Italic,
    HankenGrotesk_600SemiBold,
    HankenGrotesk_800ExtraBold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
  });

  const { width } = useWindowDimensions();

  // ------- record state -------
  const [entries, setEntries] = useState<Entry[]>(seedEntries);
  const [questions, setQuestions] = useState<ProactiveQuestion[]>(seedQuestions);
  const [signal] = useState<SignalKey>('rhr');
  // ------- surfaces -------
  const [shelfOpen, setShelfOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [textOpen, setTextOpen] = useState(false);
  const [answering, setAnswering] = useState<{ label: string; questionId?: string } | null>(null);
  const [followUp, setFollowUp] = useState<string | null>(null);
  const [voiceActive, setVoiceActive] = useState(false);
  const voiceTranscript = useRef('');

  // ------- inflow state -------
  const [paused, setPaused] = useState<Set<string>>(new Set());
  const [consent, setConsent] = useState<Set<string>>(new Set());

  // stream / layout
  const [traceHeight, setTraceHeight] = useState(0);

  // ------- capture -------
  const logUtterance = (raw: string, via: 'voice' | 'text') => {
    const coded = extract(raw);
    const now = new Date();
    const entry: Entry = {
      id: `e${Date.now()}`,
      kind: 'entry',
      iso: todayIso,
      time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      symptom: coded.symptom,
      severity: coded.severity,
      category: coded.category,
      raw,
      via,
      context: contextFor(todayIso, signal),
      answersQuestionId: answering?.questionId,
    };
    setEntries((prev) => [...prev, entry]);

    if (answering?.questionId) {
      setQuestions((prev) =>
        prev.map((q) => (q.id === answering.questionId ? { ...q, answeredByEntryId: entry.id } : q)),
      );
      setFollowUp(null);
    } else if (!answering) {
      setFollowUp(followUpFor(coded.symptom));
    } else {
      setFollowUp(null);
    }
    setAnswering(null);
    setTextOpen(false);
    requestAnimationFrame(() => setTraceHeight((prev) => prev));
  };

  const onVoiceRelease = () => {
    setVoiceActive(false);
    const t = voiceTranscript.current.trim();
    voiceTranscript.current = '';
    if (t.split(' ').length >= 3) {
      confirm();
      logUtterance(t, 'voice');
    }
  };

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: colors.cream }} />;
  }

  return (
    <Animated.View style={[styles.root, { backgroundColor: colors.paper }]}>
      <StatusBar style="dark" />

      {/* header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.wordmark}>heyjule</Text>
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => setShelfOpen(true)}
              style={styles.iconBtn}
              accessibilityLabel="Settings"
            >
              <SettingsIcon />
            </Pressable>
            <Pressable
              onPress={() => setSheetOpen(true)}
              style={styles.iconBtn}
              accessibilityLabel="Share QR"
            >
              <QrIcon />
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.gridWrap}>
        <CyclePhaseGrid />
      </View>

      <View style={styles.traceArea} onLayout={(e) => setTraceHeight(e.nativeEvent.layout.height)}>
        <View style={{ flex: 1 }}>
          {traceHeight > 0 && (
            <CompressedView
              entries={entries}
              questions={questions}
              signal={signal}
              height={Math.max(0, traceHeight - 96)}
              width={width}
            />
          )}
        </View>
      </View>

      {/* ---- capture: the only inputs; no chat ---- */}
      <VoiceCapture
        active={voiceActive}
        onTranscript={(t) => (voiceTranscript.current = t)}
      />
      <CaptureBar
        followUp={followUp}
        voiceActive={voiceActive}
        onVoicePressIn={() => setVoiceActive(true)}
        onVoicePressOut={onVoiceRelease}
        onTextPress={() => {
          setAnswering(null);
          setTextOpen(true);
        }}
        onFollowUpAnswer={() => {
          setAnswering(followUp ? { label: followUp } : null);
          setTextOpen(true);
        }}
        onFollowUpDismiss={() => setFollowUp(null)}
      />

      <TextCapture
        visible={textOpen}
        answering={answering?.label ?? null}
        onSubmit={(t) => logUtterance(t, 'text')}
        onClose={() => {
          setTextOpen(false);
          setAnswering(null);
        }}
      />

      <InflowShelf
        open={shelfOpen}
        onClose={() => setShelfOpen(false)}
        paused={paused}
        onTogglePause={(id) =>
          setPaused((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
          })
        }
        consent={consent}
        onToggleConsent={(id) =>
          setConsent((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
          })
        }
      />

      <OutflowSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingTop: 56,
    paddingHorizontal: 24,
    paddingBottom: 6,
  },
  gridWrap: {
    paddingHorizontal: 24,
  },
  traceArea: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  wordmark: {
    fontFamily: fonts.displaySoft,
    fontSize: 24,
    color: colors.ink,
    letterSpacing: -0.8,
  },
  headerActions: {
    marginLeft: 'auto',
    flexDirection: 'row',
    gap: 4,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cream,
  },
});
