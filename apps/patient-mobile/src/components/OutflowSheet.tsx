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
import { sources } from '../data/mock';
import { QRCode } from './QRCode';
import { tapLight, confirm } from '../lib/haptics';

interface Share {
  id: string;
  recipient: string;
  scope: string;
  expiresAt: number; // epoch ms
}

const RANGES = ['7 days', '30 days', '90 days'] as const;
const VALIDITY = [
  { label: '1 hour', ms: 3600e3 },
  { label: '24 hours', ms: 86400e3 },
  { label: '7 days', ms: 604800e3 },
] as const;

// Pull up from the bottom: the only ways data leaves the device.
export function OutflowSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const slide = useRef(new Animated.Value(0)).current;
  const { height: winH } = useWindowDimensions();
  const [mode, setMode] = useState<'menu' | 'show' | 'scan'>('menu');
  const [range, setRange] = useState<(typeof RANGES)[number]>('30 days');
  const [validity, setValidity] = useState<(typeof VALIDITY)[number]>(VALIDITY[1]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [shares, setShares] = useState<Share[]>([
    {
      id: 's1',
      recipient: 'Dr. Keller — Gynäkologie USZ',
      scope: '30 days · 3 sources',
      expiresAt: Date.now() + 14.5 * 3600e3,
    },
  ]);
  const [, forceTick] = useState(0);

  useEffect(() => {
    Animated.spring(slide, {
      toValue: open ? 1 : 0,
      useNativeDriver: true,
      speed: 14,
      bounciness: 3,
    }).start();
    if (!open) setMode('menu');
  }, [open]);

  // countdown tick
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [open]);

  const liveSources = sources.filter((s) => s.live);
  const included = liveSources.filter((s) => !excluded.has(s.id));
  const scopeSummary = `${range} · ${included.map((s) => s.example).join(' · ') || 'no sources'} · expires in ${validity.label}`;

  const generate = () => {
    confirm();
    setShares((prev) => [
      {
        id: `s${Date.now()}`,
        recipient: 'Awaiting scan…',
        scope: `${range} · ${included.length} sources`,
        expiresAt: Date.now() + validity.ms,
      },
      ...prev,
    ]);
  };

  return (
    <Animated.View
      pointerEvents={open ? 'auto' : 'none'}
      style={[
        styles.wrap,
        {
          transform: [
            { translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [winH, 0] }) },
          ],
        },
      ]}
    >
      <Pressable onPress={onClose} style={styles.grabberZone}>
        <View style={styles.grabber} />
        <Text style={styles.boundaryText}>nothing leaves without you</Text>
      </Pressable>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headRow}>
          <Text style={styles.title}>Outflow</Text>
          <Text style={styles.subtitle}>what leaves the device</Text>
        </View>

        {mode === 'menu' && (
          <>
            <View style={styles.doorRow}>
              <Pressable style={styles.door} onPress={() => { tapLight(); setMode('show'); }}>
                <Text style={styles.doorGlyph}>▦</Text>
                <Text style={styles.doorTitle}>Show my code</Text>
                <Text style={styles.doorSub}>they scan, the record opens read-only</Text>
              </Pressable>
              <Pressable style={[styles.door, styles.doorAlt]} onPress={() => { tapLight(); setMode('scan'); }}>
                <Text style={styles.doorGlyph}>⌖</Text>
                <Text style={styles.doorTitle}>Scan theirs</Text>
                <Text style={styles.doorSub}>send a scoped payload to their endpoint</Text>
              </Pressable>
            </View>

            <Text style={styles.sectionLabel}>ACTIVE SHARES</Text>
            {shares.map((sh) => (
              <ShareCard
                key={sh.id}
                share={sh}
                onRevoke={() => setShares((p) => p.filter((x) => x.id !== sh.id))}
              />
            ))}
            {shares.length === 0 && (
              <Text style={styles.emptyShares}>none — the record is only on this device</Text>
            )}
          </>
        )}

        {mode === 'show' && (
          <>
            <Text style={styles.sectionLabel}>SCOPE — set before the code exists</Text>

            <Text style={styles.controlLabel}>date range</Text>
            <View style={styles.chipRow}>
              {RANGES.map((r) => (
                <Chip key={r} label={r} on={range === r} onPress={() => setRange(r)} />
              ))}
            </View>

            <Text style={styles.controlLabel}>sources included</Text>
            <View style={styles.chipRow}>
              {liveSources.map((s) => (
                <Chip
                  key={s.id}
                  label={s.example}
                  on={!excluded.has(s.id)}
                  onPress={() =>
                    setExcluded((prev) => {
                      const next = new Set(prev);
                      next.has(s.id) ? next.delete(s.id) : next.add(s.id);
                      return next;
                    })
                  }
                />
              ))}
            </View>

            <Text style={styles.controlLabel}>valid for</Text>
            <View style={styles.chipRow}>
              {VALIDITY.map((v) => (
                <Chip
                  key={v.label}
                  label={v.label}
                  on={validity.label === v.label}
                  onPress={() => setValidity(v)}
                />
              ))}
            </View>

            {/* The scope literally frames the code */}
            <View style={styles.qrFrame}>
              <Text style={styles.frameText} numberOfLines={1}>
                {scopeSummary}
              </Text>
              <View style={styles.qrRow}>
                <View style={styles.frameVerticalWrap}>
                  <Text style={[styles.frameText, styles.frameVertical]} numberOfLines={1}>
                    read-only · expires · revocable
                  </Text>
                </View>
                <View style={styles.qrBox}>
                  <QRCode seed={scopeSummary} size={168} />
                </View>
                <View style={styles.frameVerticalWrap}>
                  <Text style={[styles.frameText, styles.frameVertical]} numberOfLines={1}>
                    scoped by her · before it left
                  </Text>
                </View>
              </View>
              <Text style={styles.frameText} numberOfLines={1}>
                {included.length} sources · {range} · {validity.label}
              </Text>
            </View>

            <Pressable style={styles.primaryBtn} onPress={generate}>
              <Text style={styles.primaryBtnText}>Generate & start countdown</Text>
            </Pressable>
            <Pressable onPress={() => setMode('menu')} style={styles.backLink}>
              <Text style={styles.backLinkText}>‹ back</Text>
            </Pressable>
          </>
        )}

        {mode === 'scan' && (
          <>
            <View style={styles.scannerBox}>
              <View style={styles.scannerCorner} />
              <View style={[styles.scannerCorner, styles.cTR]} />
              <View style={[styles.scannerCorner, styles.cBL]} />
              <View style={[styles.scannerCorner, styles.cBR]} />
              <Text style={styles.scannerText}>point at the clinician’s code</Text>
              <Text style={styles.scannerSub}>camera opens here — UI only for now</Text>
            </View>
            <Pressable onPress={() => setMode('menu')} style={styles.backLink}>
              <Text style={styles.backLinkText}>‹ back</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </Animated.View>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

function ShareCard({ share, onRevoke }: { share: Share; onRevoke: () => void }) {
  const left = Math.max(0, share.expiresAt - Date.now());
  const h = Math.floor(left / 3600e3);
  const m = Math.floor((left % 3600e3) / 60e3);
  const s = Math.floor((left % 60e3) / 1e3);
  return (
    <View style={styles.shareCard}>
      <View style={{ flex: 1 }}>
        <Text style={styles.shareRecipient}>{share.recipient}</Text>
        <Text style={styles.shareScope}>{share.scope}</Text>
        <Text style={styles.shareCountdown}>
          expires in {h}h {String(m).padStart(2, '0')}m {String(s).padStart(2, '0')}s
        </Text>
      </View>
      <Pressable onPress={onRevoke} style={styles.revokeBtn}>
        <Text style={styles.revokeText}>revoke</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '88%',
    backgroundColor: colors.ink,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    zIndex: 30,
  },
  grabberZone: { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
  grabber: { width: 44, height: 4, borderRadius: 2, backgroundColor: '#4A473C' },
  boundaryText: {
    marginTop: 8,
    fontFamily: fonts.monoMed,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.tennis,
  },
  content: { paddingHorizontal: 20, paddingBottom: 34, paddingTop: 6 },
  headRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 14 },
  title: { fontFamily: fonts.display, fontSize: 28, letterSpacing: -0.8, color: colors.paper },
  subtitle: { fontFamily: fonts.mono, fontSize: 10, color: colors.muted },
  doorRow: { flexDirection: 'row', gap: 10, marginBottom: 22 },
  door: {
    flex: 1,
    backgroundColor: colors.tennis,
    borderRadius: 22,
    padding: 18,
    minHeight: 132,
  },
  doorAlt: {
    backgroundColor: colors.paper,
  },
  doorGlyph: { fontSize: 22, color: colors.ink, marginBottom: 8 },
  doorTitle: { fontFamily: fonts.display, fontSize: 18, letterSpacing: -0.4, color: colors.ink },
  doorSub: {
    fontFamily: fonts.mono,
    fontSize: 9,
    lineHeight: 13,
    color: colors.inkSoft,
    marginTop: 5,
  },
  sectionLabel: {
    fontFamily: fonts.monoMed,
    fontSize: 9,
    letterSpacing: 2,
    color: colors.muted,
    marginBottom: 10,
  },
  controlLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.pistachio,
    marginBottom: 6,
    marginTop: 4,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  chip: {
    borderWidth: 1,
    borderColor: '#4A473C',
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  chipOn: { backgroundColor: colors.tennis, borderColor: colors.tennis },
  chipText: { fontFamily: fonts.mono, fontSize: 11, color: colors.muted },
  chipTextOn: { color: colors.ink },
  qrFrame: {
    alignSelf: 'center',
    alignItems: 'center',
    marginVertical: 14,
    gap: 6,
  },
  qrRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  frameText: {
    fontFamily: fonts.mono,
    fontSize: 8,
    letterSpacing: 0.5,
    color: colors.pistachio,
    maxWidth: 240,
  },
  frameVerticalWrap: {
    width: 16,
    height: 184,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frameVertical: {
    width: 184,
    textAlign: 'center',
    transform: [{ rotate: '-90deg' }],
  },
  qrBox: {
    padding: 8,
    backgroundColor: colors.paper,
    borderRadius: 4,
  },
  primaryBtn: {
    backgroundColor: colors.tennis,
    borderRadius: 999,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnText: { fontFamily: fonts.display, fontSize: 15, letterSpacing: -0.2, color: colors.ink },
  backLink: { alignSelf: 'center', marginTop: 14, padding: 6 },
  backLinkText: { fontFamily: fonts.mono, fontSize: 12, color: colors.muted },
  emptyShares: { fontFamily: fonts.bodyItalic, fontSize: 13, color: colors.muted },
  shareCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2B2B26',
    borderRadius: 16,
    padding: 15,
    marginBottom: 8,
  },
  shareRecipient: { fontFamily: fonts.displaySoft, fontSize: 14, color: colors.paper },
  shareScope: { fontFamily: fonts.mono, fontSize: 10, color: colors.muted, marginTop: 3 },
  shareCountdown: { fontFamily: fonts.monoMed, fontSize: 10, color: colors.tennis, marginTop: 5 },
  revokeBtn: {
    borderWidth: 1,
    borderColor: '#8C4A3A',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  revokeText: { fontFamily: fonts.monoMed, fontSize: 11, color: '#D08A76' },
  scannerBox: {
    height: 240,
    borderRadius: 22,
    backgroundColor: '#111110',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  scannerCorner: {
    position: 'absolute',
    top: 18,
    left: 18,
    width: 26,
    height: 26,
    borderLeftWidth: 2,
    borderTopWidth: 2,
    borderColor: colors.tennis,
  },
  cTR: { left: undefined, right: 18, borderLeftWidth: 0, borderRightWidth: 2 },
  cBL: { top: undefined, bottom: 18, borderTopWidth: 0, borderBottomWidth: 2 },
  cBR: {
    top: undefined,
    left: undefined,
    right: 18,
    bottom: 18,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderRightWidth: 2,
    borderBottomWidth: 2,
  },
  scannerText: { fontFamily: fonts.displaySoft, fontSize: 15, color: colors.paper },
  scannerSub: { fontFamily: fonts.mono, fontSize: 9, color: colors.muted, marginTop: 6 },
});
