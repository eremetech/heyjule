import React, { useMemo, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
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

import { colors, fonts, phaseLabel, phaseTint, type Phase } from './src/theme';
import {
  days,
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
import { EntryCard } from './src/components/EntryCard';
import { ProactiveCard } from './src/components/ProactiveCard';
import { Margin } from './src/components/Margin';
import { CaptureBar } from './src/components/CaptureBar';
import { TextCapture } from './src/components/TextCapture';
import { VoiceCapture } from './src/components/VoiceCapture';
import { InflowShelf } from './src/components/InflowShelf';
import { OutflowSheet } from './src/components/OutflowSheet';
import { CompressedView } from './src/components/CompressedView';
import { confirm } from './src/lib/haptics';

const PHASES: Phase[] = ['menstrual', 'follicular', 'ovulation', 'luteal'];
const SIGNALS: SignalKey[] = ['rhr', 'skinTemp', 'sleepHours'];

export default function App() {
  const [fontsLoaded] = useFonts({
    HankenGrotesk_400Regular,
    HankenGrotesk_400Regular_Italic,
    HankenGrotesk_600SemiBold,
    HankenGrotesk_800ExtraBold,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
  });

  const { width, height } = useWindowDimensions();

  // ------- record state -------
  const [entries, setEntries] = useState<Entry[]>(seedEntries);
  const [questions, setQuestions] = useState<ProactiveQuestion[]>(seedQuestions);
  const [signal, setSignal] = useState<SignalKey>('rhr');
  const [compressed, setCompressed] = useState(false);

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

  // ------- stream scroll → ambient phase + margin cursor -------
  const scrollRef = useRef<ScrollView>(null);
  const layout = useRef({ content: 1, viewport: 1 });
  const [scrollFraction, setScrollFraction] = useState(1);
  const phaseAnim = useRef(new Animated.Value(PHASES.indexOf(days[days.length - 1].phase))).current;
  const lastPhase = useRef<Phase>(days[days.length - 1].phase);
  const didInitialScroll = useRef(false);

  const bgColor = phaseAnim.interpolate({
    inputRange: [0, 1, 2, 3],
    outputRange: PHASES.map((p) => phaseTint[p]),
  });

  const onScroll = (offsetY: number) => {
    const { content, viewport } = layout.current;
    const denom = Math.max(1, content - viewport);
    const f = Math.min(1, Math.max(0, offsetY / denom));
    setScrollFraction(f);
    const day = days[Math.round(f * (days.length - 1))];
    if (day && day.phase !== lastPhase.current) {
      lastPhase.current = day.phase;
      Animated.timing(phaseAnim, {
        toValue: PHASES.indexOf(day.phase),
        duration: 450,
        useNativeDriver: false,
      }).start();
    }
    // overscroll gestures (native bounce): top opens inflow, bottom opens outflow
    if (offsetY < -60) setShelfOpen(true);
    if (offsetY > denom + 60) setSheetOpen(true);
  };

  // ------- stream items grouped by day -------
  const itemsByDay = useMemo(() => {
    const map = new Map<string, (Entry | ProactiveQuestion)[]>();
    [...entries, ...questions].forEach((it) => {
      const arr = map.get(it.iso) ?? [];
      arr.push(it);
      map.set(it.iso, arr);
    });
    map.forEach((arr) => arr.sort((a, b) => a.time.localeCompare(b.time)));
    return map;
  }, [entries, questions]);

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
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
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

  const today = days[days.length - 1];
  const streamHeight = height - 92; // below header

  return (
    <Animated.View style={[styles.root, { backgroundColor: bgColor }]}>
      <StatusBar style="dark" />

      {/* ---- header: wordmark, today, day/month toggle ---- */}
      <View style={styles.header}>
        <Pressable onPress={() => setShelfOpen(true)} style={styles.inflowHandle}>
          <View style={styles.handleBar} />
        </Pressable>
        <View style={styles.headerRow}>
          <Text style={styles.wordmark}>heyjule</Text>
          <Text style={styles.headerMeta}>
            CD {today.cycleDay} · {phaseLabel[today.phase].toLowerCase()}
          </Text>
          <View style={styles.toggle}>
            {(['day', 'month'] as const).map((m) => {
              const on = (m === 'month') === compressed;
              return (
                <Pressable key={m} onPress={() => setCompressed(m === 'month')} hitSlop={6}>
                  <Text style={[styles.toggleText, on && styles.toggleTextOn]}>
                    {m.toUpperCase()}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      {/* ---- the Stream / the Month ---- */}
      <View style={{ flex: 1 }}>
        {compressed ? (
          <CompressedView
            entries={entries}
            questions={questions}
            signal={signal}
            height={streamHeight}
            width={width}
          />
        ) : (
          <>
            <ScrollView
              ref={scrollRef}
              style={{ flex: 1 }}
              contentContainerStyle={styles.streamContent}
              scrollEventThrottle={16}
              onScroll={(e) => onScroll(e.nativeEvent.contentOffset.y)}
              onLayout={(e) => (layout.current.viewport = e.nativeEvent.layout.height)}
              onContentSizeChange={(_, h) => {
                layout.current.content = h;
                if (!didInitialScroll.current) {
                  didInitialScroll.current = true;
                  scrollRef.current?.scrollToEnd({ animated: false });
                }
              }}
            >
              {days.map((d) => {
                const items = itemsByDay.get(d.iso) ?? [];
                const isToday = d.iso === todayIso;
                return (
                  <View key={d.iso}>
                    <View style={styles.dayRule}>
                      <Text style={[styles.dayDate, isToday && styles.dayDateToday]}>
                        {isToday ? 'TODAY' : d.iso.slice(5).replace('-', '·')}
                      </Text>
                      <View style={styles.dayLine} />
                      <Text style={styles.dayMeta}>
                        CD{d.cycleDay} {d.phase.slice(0, 3)} · {Math.round(d.rhr)}bpm ·{' '}
                        {d.sleepHours.toFixed(1)}h
                      </Text>
                    </View>
                    {items.map((it) =>
                      it.kind === 'entry' ? (
                        <EntryCard key={it.id} entry={it} />
                      ) : (
                        <ProactiveCard
                          key={it.id}
                          q={it}
                          onAnswer={(q) => {
                            setAnswering({ label: q.question, questionId: q.id });
                            setTextOpen(true);
                          }}
                          onDismiss={(q) =>
                            setQuestions((prev) =>
                              prev.map((x) => (x.id === q.id ? { ...x, dismissed: true } : x)),
                            )
                          }
                        />
                      ),
                    )}
                  </View>
                );
              })}
              <View style={{ height: 180 }} />
            </ScrollView>

            <Margin
              height={streamHeight}
              signal={signal}
              anomalies={questions.filter((q) => !q.dismissed).map((q) => q.iso)}
              scrollFraction={scrollFraction}
              onCycle={() => setSignal(SIGNALS[(SIGNALS.indexOf(signal) + 1) % SIGNALS.length])}
              onJump={(f) => {
                const { content, viewport } = layout.current;
                scrollRef.current?.scrollTo({ y: f * (content - viewport), animated: true });
              }}
            />
          </>
        )}
      </View>

      {/* ---- outflow handle ---- */}
      <Pressable onPress={() => setSheetOpen(true)} style={styles.outflowHandle}>
        <View style={styles.handleBar} />
      </Pressable>

      {/* ---- capture: the only inputs; no chat ---- */}
      {!compressed && (
        <>
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
        </>
      )}

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
    paddingTop: 46,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  inflowHandle: {
    position: 'absolute',
    top: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingVertical: 4,
    zIndex: 5,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(33,31,25,0.25)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
    marginTop: 8,
  },
  wordmark: {
    fontFamily: fonts.display,
    fontSize: 26,
    color: colors.ink,
    letterSpacing: -1,
  },
  headerMeta: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.muted,
  },
  toggle: {
    marginLeft: 'auto',
    flexDirection: 'row',
    gap: 10,
  },
  toggleText: {
    fontFamily: fonts.monoMed,
    fontSize: 10,
    letterSpacing: 1.5,
    color: colors.muted,
    paddingBottom: 2,
  },
  toggleTextOn: {
    color: colors.ink,
    borderBottomWidth: 2,
    borderBottomColor: colors.tennis,
  },
  streamContent: {
    paddingHorizontal: 18,
    paddingRight: 34, // room for the Margin
    paddingTop: 6,
  },
  dayRule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    marginBottom: 8,
  },
  dayDate: {
    fontFamily: fonts.monoMed,
    fontSize: 9,
    letterSpacing: 1,
    color: colors.inkSoft,
  },
  dayDateToday: {
    backgroundColor: colors.tennis,
    color: colors.ink,
    borderRadius: 999,
    paddingVertical: 2,
    paddingHorizontal: 8,
    overflow: 'hidden',
  },
  dayLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(23,23,20,0.12)',
  },
  dayMeta: {
    fontFamily: fonts.mono,
    fontSize: 8,
    color: colors.muted,
  },
  outflowHandle: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingVertical: 5,
    zIndex: 5,
  },
});
