import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { colors, fonts } from '../theme';
import { sources, type Source } from '../data/mock';
import { tapLight } from '../lib/haptics';

// Pull down from the top: what feeds the record.
// Live tiles breathe; dormant tiles wait in grayscale.
export function InflowShelf({
  open,
  onClose,
  paused,
  onTogglePause,
  consent,
  onToggleConsent,
}: {
  open: boolean;
  onClose: () => void;
  paused: Set<string>;
  onTogglePause: (id: string) => void;
  consent: Set<string>;
  onToggleConsent: (id: string) => void;
}) {
  const [consentFor, setConsentFor] = useState<Source | null>(null);
  const slide = useRef(new Animated.Value(0)).current;
  const { height: winH } = useWindowDimensions();

  useEffect(() => {
    Animated.spring(slide, {
      toValue: open ? 1 : 0,
      useNativeDriver: true,
      speed: 14,
      bounciness: 3,
    }).start();
    if (!open) setConsentFor(null);
  }, [open]);

  return (
    <Animated.View
      pointerEvents={open ? 'auto' : 'none'}
      style={[
        styles.wrap,
        {
          transform: [
            { translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [-winH, 0] }) },
          ],
        },
      ]}
    >
      <View style={styles.head}>
        <Text style={styles.title}>Inflow</Text>
        <Text style={styles.subtitle}>what feeds the record</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.grid}>
        {sources.map((s) => {
          const isPaused = paused.has(s.id);
          const alive = s.live && !isPaused;
          return (
            <Pressable
              key={s.id}
              onPress={() => {
                tapLight();
                onTogglePause(s.id);
              }}
              onLongPress={() => setConsentFor(s)}
              style={[styles.tile, alive ? styles.tileLive : styles.tileDormant]}
            >
              <View style={styles.tileTop}>
                <Text style={[styles.tileCategory, alive && styles.tileCategoryLive]}>
                  {s.category.toUpperCase()}
                </Text>
                {alive && <BreathingDot />}
                {isPaused && <Text style={styles.pausedMark}>paused</Text>}
                {consent.has(s.id) && <Text style={styles.openSci}>◍</Text>}
              </View>
              <Text style={[styles.tileName, !alive && styles.tileNameDormant]}>{s.example}</Text>
              <Text style={styles.tileKind}>{s.kind}</Text>
              {alive && s.reading ? (
                <Text style={styles.tileReading}>{s.reading}</Text>
              ) : (
                <Text style={styles.tileReadingDormant}>{isPaused ? 'tap to resume' : 'tap to connect'}</Text>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* the boundary where the claim is architecturally true */}
      <Pressable onPress={onClose} style={styles.boundary}>
        <Text style={styles.boundaryText}>everything below this stays on this device</Text>
        <View style={styles.grabber} />
      </Pressable>

      {/* research consent panel, long-press */}
      {consentFor && (
        <View style={styles.consentPanel}>
          <Text style={styles.consentTitle}>Research contribution — {consentFor.example}</Text>
          <Text style={styles.consentBody}>
            If you opt in, de-identified {consentFor.kind.toLowerCase()} data joins an open
            longitudinal dataset. Name, contacts, exact locations, and device identifiers are
            stripped. Per data type, revocable at any time, off by default.
          </Text>
          <View style={styles.consentActions}>
            <Pressable
              style={[styles.consentBtn, consent.has(consentFor.id) && styles.consentBtnOn]}
              onPress={() => {
                onToggleConsent(consentFor.id);
                setConsentFor(null);
              }}
            >
              <Text style={styles.consentBtnText}>
                {consent.has(consentFor.id) ? 'Withdraw consent' : 'Contribute this source'}
              </Text>
            </Pressable>
            <Pressable onPress={() => setConsentFor(null)} hitSlop={8}>
              <Text style={styles.consentClose}>close</Text>
            </Pressable>
          </View>
        </View>
      )}
    </Animated.View>
  );
}

function BreathingDot() {
  const breath = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: 1400, useNativeDriver: true }),
        Animated.timing(breath, { toValue: 0.4, duration: 1400, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return <Animated.View style={[styles.breathDot, { opacity: breath }]} />;
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    maxHeight: '86%',
    backgroundColor: colors.ink,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    paddingTop: 54,
    zIndex: 30,
  },
  head: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
  },
  title: { fontFamily: fonts.display, fontSize: 28, letterSpacing: -0.8, color: colors.paper },
  subtitle: { fontFamily: fonts.mono, fontSize: 10, color: colors.muted },
  scroll: { flexGrow: 0 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  tile: {
    width: '31.5%',
    minWidth: 104,
    borderRadius: 16,
    padding: 11,
  },
  tileLive: {
    backgroundColor: '#2B2B26',
  },
  tileDormant: {
    backgroundColor: '#222220',
  },
  tileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  tileCategory: {
    fontFamily: fonts.monoMed,
    fontSize: 7,
    letterSpacing: 1.5,
    color: '#6B6858',
  },
  tileCategoryLive: { color: colors.pistachio },
  breathDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.tennis,
    marginLeft: 'auto',
  },
  pausedMark: {
    marginLeft: 'auto',
    fontFamily: fonts.mono,
    fontSize: 8,
    color: colors.muted,
  },
  openSci: { color: colors.tennis, fontSize: 9, marginLeft: 2 },
  tileName: {
    fontFamily: fonts.displaySoft,
    fontSize: 13,
    lineHeight: 17,
    color: colors.paper,
  },
  tileNameDormant: { color: '#8A8778' },
  tileKind: {
    fontFamily: fonts.mono,
    fontSize: 8,
    color: '#6B6858',
    marginTop: 2,
  },
  tileReading: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: colors.tennis,
    marginTop: 7,
  },
  tileReadingDormant: {
    fontFamily: fonts.mono,
    fontSize: 8,
    color: '#55534A',
    marginTop: 7,
  },
  boundary: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#3A382F',
  },
  boundaryText: {
    fontFamily: fonts.monoMed,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.tennis,
  },
  grabber: {
    marginTop: 9,
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#4A473C',
  },
  consentPanel: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 58,
    backgroundColor: colors.paper,
    borderRadius: 22,
    padding: 18,
  },
  consentTitle: { fontFamily: fonts.display, fontSize: 16, letterSpacing: -0.3, color: colors.ink },
  consentBody: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.inkSoft,
    marginTop: 6,
  },
  consentActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 12,
  },
  consentBtn: {
    backgroundColor: colors.ink,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 18,
  },
  consentBtnOn: { backgroundColor: colors.pistachioDeep },
  consentBtnText: { fontFamily: fonts.displaySoft, fontSize: 12, color: colors.paper },
  consentClose: { fontFamily: fonts.mono, fontSize: 11, color: colors.muted },
});
