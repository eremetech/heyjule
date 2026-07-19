import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { QRCode } from "../components/QRCode";
import { SoftPressable } from "../components/SoftPressable";
import { useHealthStore } from "../store/HealthStore";
import { colors, shadows, typography } from "../theme";
import type { ShareGrant, ShareScope } from "../types";

type ShareScreenProps = {
  onClose: () => void;
};

type Mode = "menu" | "show" | "scan";

const RANGES = ["7 days", "30 days", "90 days"] as const;

const VALIDITY = [
  { label: "1 hour", days: 1 / 24 },
  { label: "24 hours", days: 1 },
  { label: "7 days", days: 7 },
] as const;

const SOURCES: { key: keyof ShareScope; label: string }[] = [
  { key: "symptoms", label: "Symptoms" },
  { key: "wearables", label: "Wearables" },
  { key: "treatments", label: "Treatments" },
  { key: "conversations", label: "Conversations" },
];

function countdownParts(expiresAt: string) {
  const left = Math.max(0, new Date(expiresAt).getTime() - Date.now());
  const hours = Math.floor(left / 3_600_000);
  const minutes = Math.floor((left % 3_600_000) / 60_000);
  const seconds = Math.floor((left % 60_000) / 1000);
  return { hours, minutes, seconds };
}

export function ShareScreen({ onClose }: ShareScreenProps) {
  const insets = useSafeAreaInsets();
  const { grants, createGrant, revokeGrant } = useHealthStore();
  const [mode, setMode] = useState<Mode>("menu");
  const [range, setRange] = useState<(typeof RANGES)[number]>("30 days");
  const [validity, setValidity] = useState<(typeof VALIDITY)[number]>(VALIDITY[1]);
  const [scope, setScope] = useState<ShareScope>({
    symptoms: true,
    wearables: true,
    treatments: true,
    conversations: false,
  });
  const [creating, setCreating] = useState(false);
  const [, setTick] = useState(0);

  // countdown tick for active shares
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const included = SOURCES.filter((source) => scope[source.key]);
  const activeGrants = grants.filter(
    (grant) => grant.status === "active" && new Date(grant.expiresAt).getTime() > Date.now(),
  );
  const scopeSummary = `${range} · ${
    included.map((source) => source.label.toLowerCase()).join(" · ") || "no sources"
  } · expires in ${validity.label}`;

  function toggleSource(key: keyof ShareScope) {
    void Haptics.selectionAsync();
    setScope((current) => ({ ...current, [key]: !current[key] }));
  }

  async function generate() {
    if (included.length === 0) {
      Alert.alert("Choose something to share", "Select at least one source for your doctor.");
      return;
    }
    setCreating(true);
    try {
      await createGrant(scope, validity.days);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setMode("menu");
    } finally {
      setCreating(false);
    }
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 4 }]}>
      <View style={styles.header}>
        <SoftPressable onPress={onClose} style={styles.roundButton} accessibilityLabel="Back to today">
          <Ionicons name="chevron-back" size={27} color={colors.ink} />
        </SoftPressable>
        <Text style={styles.headerTitle}>Share with your doctor</Text>
        <SoftPressable
          onPress={() =>
            Alert.alert(
              "Your privacy",
              "You choose what leaves this device. Every share is scoped, expires, and can be revoked.",
            )
          }
          style={styles.roundButton}
          accessibilityLabel="Privacy information"
        >
          <Ionicons name="shield-checkmark-outline" size={25} color={colors.oliveDeep} />
        </SoftPressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 36 }]}
      >
        <View style={styles.intro}>
          <Text style={styles.displayCopy}>
            Show a code or scan theirs. Every share is scoped before it exists.
          </Text>
        </View>

        {mode === "menu" ? (
          <>
            <View style={styles.doorRow}>
              <SoftPressable
                onPress={() => {
                  void Haptics.selectionAsync();
                  setMode("show");
                }}
                style={[styles.door, styles.doorPrimary]}
                accessibilityRole="button"
              >
                <View style={styles.doorIcon}>
                  <Ionicons name="qr-code-outline" size={25} color={colors.ink} />
                </View>
                <Text style={styles.doorTitle}>Show my code</Text>
                <Text style={styles.doorSub}>They scan, the record opens read-only</Text>
              </SoftPressable>
              <SoftPressable
                onPress={() => {
                  void Haptics.selectionAsync();
                  setMode("scan");
                }}
                style={styles.door}
                accessibilityRole="button"
              >
                <View style={styles.doorIcon}>
                  <Ionicons name="scan-outline" size={25} color={colors.ink} />
                </View>
                <Text style={styles.doorTitle}>Scan theirs</Text>
                <Text style={styles.doorSub}>Send a scoped summary to their screen</Text>
              </SoftPressable>
            </View>

            <Text style={styles.sectionLabel}>ACTIVE SHARES</Text>
            {activeGrants.map((grant) => (
              <GrantCard key={grant.id} grant={grant} onRevoke={() => void revokeGrant(grant.id)} />
            ))}
            {activeGrants.length === 0 ? (
              <Text style={styles.emptyShares}>None — your record is only on this device.</Text>
            ) : null}
          </>
        ) : null}

        {mode === "show" ? (
          <>
            <Text style={styles.sectionLabel}>SCOPE — SET BEFORE THE CODE EXISTS</Text>

            <Text style={styles.controlLabel}>Date range</Text>
            <View style={styles.chipRow}>
              {RANGES.map((item) => (
                <Chip
                  key={item}
                  label={item}
                  on={range === item}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setRange(item);
                  }}
                />
              ))}
            </View>

            <Text style={styles.controlLabel}>Sources included</Text>
            <View style={styles.chipRow}>
              {SOURCES.map((source) => (
                <Chip
                  key={source.key}
                  label={source.label}
                  on={scope[source.key]}
                  onPress={() => toggleSource(source.key)}
                />
              ))}
            </View>

            <Text style={styles.controlLabel}>Valid for</Text>
            <View style={styles.chipRow}>
              {VALIDITY.map((item) => (
                <Chip
                  key={item.label}
                  label={item.label}
                  on={validity.label === item.label}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setValidity(item);
                  }}
                />
              ))}
            </View>

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
                  <QRCode seed={scopeSummary} size={210} color={colors.ink} background={colors.white} />
                </View>
                <View style={styles.frameVerticalWrap}>
                  <Text style={[styles.frameText, styles.frameVertical]} numberOfLines={1}>
                    scoped by you · before it left
                  </Text>
                </View>
              </View>
              <Text style={styles.frameText} numberOfLines={1}>
                {included.length} sources · {range} · {validity.label}
              </Text>
            </View>

            <SoftPressable
              onPress={generate}
              disabled={creating}
              style={[styles.primaryButton, creating && styles.primaryButtonDisabled]}
              accessibilityRole="button"
            >
              <Text style={styles.primaryButtonText}>
                {creating ? "Creating…" : "Generate & start countdown"}
              </Text>
            </SoftPressable>
            <SoftPressable onPress={() => setMode("menu")} style={styles.backLink}>
              <Text style={styles.backLinkText}>‹ Back</Text>
            </SoftPressable>
          </>
        ) : null}

        {mode === "scan" ? (
          <>
            <View style={styles.scannerBox}>
              <View style={styles.scannerCorner} />
              <View style={[styles.scannerCorner, styles.cornerTR]} />
              <View style={[styles.scannerCorner, styles.cornerBL]} />
              <View style={[styles.scannerCorner, styles.cornerBR]} />
              <Text style={styles.scannerText}>Point at the clinician’s code</Text>
              <Text style={styles.scannerSub}>Camera opens here — UI only for now</Text>
            </View>
            <SoftPressable onPress={() => setMode("menu")} style={styles.backLink}>
              <Text style={styles.backLinkText}>‹ Back</Text>
            </SoftPressable>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <SoftPressable
      onPress={onPress}
      style={[styles.chip, on && styles.chipOn]}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </SoftPressable>
  );
}

function GrantCard({ grant, onRevoke }: { grant: ShareGrant; onRevoke: () => void }) {
  const { hours, minutes, seconds } = countdownParts(grant.expiresAt);
  const scopeCount = Object.values(grant.scope).filter(Boolean).length;
  return (
    <View style={styles.grantCard}>
      <View style={styles.grantCopy}>
        <Text style={styles.grantRecipient}>Code {grant.code}</Text>
        <Text style={styles.grantScope}>{scopeCount} sources · read-only</Text>
        <Text style={styles.grantCountdown}>
          Expires in {hours}h {String(minutes).padStart(2, "0")}m {String(seconds).padStart(2, "0")}s
        </Text>
      </View>
      <SoftPressable
        onPress={() =>
          Alert.alert("Revoke this access?", "The share will stop working immediately.", [
            { text: "Keep access", style: "cancel" },
            { text: "Revoke", style: "destructive", onPress: onRevoke },
          ])
        }
        style={styles.revokeButton}
      >
        <Text style={styles.revokeText}>Revoke</Text>
      </SoftPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  header: {
    height: 58,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  roundButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "600",
  },
  scrollContent: {
    paddingHorizontal: 24,
  },
  intro: {
    paddingTop: 32,
    paddingBottom: 30,
  },
  displayTitle: {
    fontFamily: typography.display,
    color: colors.ink,
    fontSize: 43,
    lineHeight: 47,
    letterSpacing: -1.1,
  },
  displayCopy: {
    color: colors.inkFaint,
    fontSize: 16,
    lineHeight: 23,
    marginTop: 12,
    maxWidth: 340,
  },
  doorRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 30,
  },
  door: {
    flex: 1,
    minHeight: 156,
    borderRadius: 24,
    padding: 20,
    backgroundColor: "rgba(255,255,255,0.64)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    ...shadows.quiet,
  },
  doorPrimary: {
    backgroundColor: "rgba(245,200,190,0.4)",
  },
  doorIcon: {
    width: 46,
    height: 46,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.72)",
    marginBottom: 14,
  },
  doorTitle: {
    fontFamily: typography.displayMedium,
    color: colors.ink,
    fontSize: 22,
    letterSpacing: -0.5,
  },
  doorSub: {
    color: colors.inkSoft,
    fontSize: 12.5,
    lineHeight: 17,
    marginTop: 6,
  },
  sectionLabel: {
    color: colors.inkFaint,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.3,
    marginBottom: 12,
  },
  controlLabel: {
    color: colors.oliveDeep,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    marginTop: 5,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 17,
  },
  chip: {
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 17,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  chipOn: {
    borderColor: colors.olive,
    backgroundColor: "rgba(136,148,96,0.14)",
  },
  chipText: {
    color: colors.inkFaint,
    fontSize: 14,
    fontWeight: "600",
  },
  chipTextOn: {
    color: colors.oliveDeep,
  },
  qrFrame: {
    alignSelf: "center",
    alignItems: "center",
    marginVertical: 19,
    gap: 8,
  },
  qrRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  frameText: {
    color: colors.inkFaint,
    fontSize: 10.5,
    letterSpacing: 0.6,
    maxWidth: 300,
  },
  frameVerticalWrap: {
    width: 20,
    height: 234,
    alignItems: "center",
    justifyContent: "center",
  },
  frameVertical: {
    width: 234,
    textAlign: "center",
    transform: [{ rotate: "-90deg" }],
  },
  qrBox: {
    padding: 12,
    backgroundColor: colors.white,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    ...shadows.quiet,
  },
  primaryButton: {
    height: 62,
    borderRadius: 31,
    marginTop: 5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.olive,
    ...shadows.lifted,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "600",
  },
  backLink: {
    alignSelf: "center",
    marginTop: 16,
    padding: 10,
  },
  backLinkText: {
    color: colors.inkFaint,
    fontSize: 15,
    fontWeight: "600",
  },
  emptyShares: {
    color: colors.inkFaint,
    fontSize: 15,
    lineHeight: 22,
    fontStyle: "italic",
  },
  grantCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 24,
    padding: 19,
    marginBottom: 12,
    backgroundColor: "rgba(255,255,255,0.64)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  grantCopy: {
    flex: 1,
    gap: 4,
  },
  grantRecipient: {
    fontFamily: typography.displayMedium,
    color: colors.ink,
    fontSize: 19,
    letterSpacing: 0.5,
  },
  grantScope: {
    color: colors.inkFaint,
    fontSize: 13,
  },
  grantCountdown: {
    color: colors.oliveDeep,
    fontSize: 13,
    fontWeight: "600",
    marginTop: 3,
  },
  revokeButton: {
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
  },
  revokeText: {
    color: colors.coral,
    fontSize: 14,
    fontWeight: "600",
  },
  scannerBox: {
    height: 290,
    borderRadius: 24,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  scannerCorner: {
    position: "absolute",
    top: 21,
    left: 21,
    width: 31,
    height: 31,
    borderLeftWidth: 2.5,
    borderTopWidth: 2.5,
    borderColor: colors.coralSoft,
  },
  cornerTR: {
    left: undefined,
    right: 21,
    borderLeftWidth: 0,
    borderRightWidth: 2.5,
  },
  cornerBL: {
    top: undefined,
    bottom: 21,
    borderTopWidth: 0,
    borderBottomWidth: 2.5,
  },
  cornerBR: {
    top: undefined,
    left: undefined,
    right: 21,
    bottom: 21,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderRightWidth: 2.5,
    borderBottomWidth: 2.5,
  },
  scannerText: {
    color: colors.white,
    fontSize: 18,
    fontFamily: typography.displayMedium,
  },
  scannerSub: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
    marginTop: 7,
  },
});
