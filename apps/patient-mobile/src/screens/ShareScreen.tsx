import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SoftPressable } from "../components/SoftPressable";
import { ApiError } from "../lib/heyjule-api";
import { useHealthStore } from "../store/HealthStore";
import { colors, shadows, typography } from "../theme";
import type { DoctorExportMetadata } from "@heyjule/shared-types";
import type { ShareScope } from "../types";

type ShareScreenProps = {
  onClose: () => void;
};

type Mode = "menu" | "scan" | "export";

const RANGES = [
  { label: "7 days", days: 7 as const },
  { label: "30 days", days: 30 as const },
  { label: "90 days", days: 90 as const },
];

const VALIDITY = [
  { label: "24 hours", days: 1 },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
] as const;

const SOURCES: { key: keyof ShareScope; label: string }[] = [
  { key: "symptoms", label: "Symptoms" },
  { key: "wearables", label: "Wearables" },
  { key: "proms", label: "PROMs" },
  { key: "treatments", label: "Treatments" },
  { key: "conversations", label: "Conversations" },
];

function countdown(expiresAt: string) {
  const left = Math.max(0, new Date(expiresAt).getTime() - Date.now());
  const hours = Math.floor(left / 3_600_000);
  const minutes = Math.floor((left % 3_600_000) / 60_000);
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function exportError(error: unknown) {
  if (!(error instanceof ApiError)) return "The encrypted report could not be created.";
  if (error.code === "doctor_key_not_found") {
    return "The clinician must open their HeyJule portal once so a browser encryption key can be registered.";
  }
  if (error.code === "report_provider_not_configured") {
    return "The report model is not configured on the HeyJule server.";
  }
  if (error.code === "mock_llm_not_enabled") {
    return "Mock-data model review is disabled on the HeyJule server.";
  }
  if (error.code === "openai_phi_not_enabled") {
    return "Live health-data review is locked until the approved provider privacy gate is enabled.";
  }
  if (error.code === "report_provider_failed") {
    return "The model did not return a usable structured report. Try again.";
  }
  return "The encrypted report could not be created.";
}

export function ShareScreen({ onClose }: ShareScreenProps) {
  const insets = useSafeAreaInsets();
  const {
    careLinks,
    doctorExports,
    claimCareInvite,
    revokeCareRelationship,
    createDoctorExport,
    revokeDoctorExport,
  } = useHealthStore();
  const [mode, setMode] = useState<Mode>("menu");
  const [rangeDays, setRangeDays] = useState<7 | 30 | 90>(30);
  const [validity, setValidity] = useState<(typeof VALIDITY)[number]>(VALIDITY[1]);
  const [scope, setScope] = useState<ShareScope>({
    symptoms: true,
    wearables: true,
    treatments: true,
    conversations: true,
    proms: true,
  });
  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [creating, setCreating] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  const included = SOURCES.filter((source) => scope[source.key]);
  const activeExports = doctorExports.filter(
    (item) => new Date(item.expiresAt).getTime() > Date.now(),
  );

  function openExport(doctorId?: string) {
    const nextDoctorId = doctorId ?? careLinks[0]?.doctorId;
    if (!nextDoctorId) {
      Alert.alert("Link a clinician first", "Enter the six-character code from their portal.");
      return;
    }
    setSelectedDoctorId(nextDoctorId);
    setMode("export");
  }

  function toggleSource(key: keyof ShareScope) {
    void Haptics.selectionAsync();
    setScope((current) => ({ ...current, [key]: !current[key] }));
  }

  async function claimInvite() {
    if (!/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/u.test(inviteCode)) {
      Alert.alert("Check the code", "Enter the six-character code shown by your clinician.");
      return;
    }
    setClaiming(true);
    try {
      const relationship = await claimCareInvite(inviteCode);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setInviteCode("");
      openExport(relationship.doctorId);
    } catch {
      Alert.alert("Code not accepted", "The code may be invalid, expired, or already used.");
    } finally {
      setClaiming(false);
    }
  }

  async function generateExport() {
    if (!selectedDoctorId || included.length === 0) {
      Alert.alert("Choose data to share", "Select a clinician and at least one source.");
      return;
    }
    setCreating(true);
    try {
      await createDoctorExport(selectedDoctorId, rangeDays, scope, validity.days);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "Encrypted report sent",
        "The model-generated draft was encrypted to this clinician’s browser key before it was stored.",
      );
      setMode("menu");
    } catch (error) {
      Alert.alert("Report not sent", exportError(error));
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
          onPress={() => Alert.alert(
            "How this export works",
            "HeyJule sends only the selected data to the configured model for a structured draft. The patient app then encrypts that draft to the clinician’s browser key. The stored export is ciphertext and expires automatically.",
          )}
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
          <Text style={styles.eyebrow}>DEMO PATIENT DATA</Text>
          <Text style={styles.displayCopy}>
            Link a clinician, choose the record window, then create an AI-reviewed report encrypted only for them.
          </Text>
        </View>

        {mode === "menu" ? (
          <>
            <View style={styles.doorRow}>
              <SoftPressable onPress={() => setMode("scan")} style={styles.door} accessibilityRole="button">
                <View style={styles.doorIcon}>
                  <Ionicons name="keypad-outline" size={25} color={colors.ink} />
                </View>
                <Text style={styles.doorTitle}>Link clinician</Text>
                <Text style={styles.doorSub}>Enter their one-time consent code</Text>
              </SoftPressable>
              <SoftPressable
                onPress={() => openExport()}
                style={[styles.door, styles.doorPrimary]}
                accessibilityRole="button"
              >
                <View style={styles.doorIcon}>
                  <Ionicons name="lock-closed-outline" size={25} color={colors.ink} />
                </View>
                <Text style={styles.doorTitle}>Create report</Text>
                <Text style={styles.doorSub}>Review with the LLM, then encrypt for the doctor</Text>
              </SoftPressable>
            </View>

            <Text style={styles.sectionLabel}>ENCRYPTED EXPORTS</Text>
            {activeExports.map((value) => (
              <ExportCard
                key={value.id}
                value={value}
                onRevoke={() => void revokeDoctorExport(value.id)}
              />
            ))}
            {activeExports.length === 0 ? (
              <Text style={styles.emptyShares}>No active encrypted reports.</Text>
            ) : null}

            <Text style={[styles.sectionLabel, styles.linkedLabel]}>LINKED CLINICIANS</Text>
            {careLinks.map((relationship) => (
              <View key={relationship.doctorId} style={styles.card}>
                <View style={styles.cardCopy}>
                  <Text style={styles.cardTitle}>Clinician</Text>
                  <Text style={styles.cardDetail}>{relationship.doctorId}</Text>
                </View>
                <View style={styles.cardActions}>
                  <SoftPressable onPress={() => openExport(relationship.doctorId)} style={styles.sendButton}>
                    <Text style={styles.sendText}>Report</Text>
                  </SoftPressable>
                  <SoftPressable
                    onPress={() => Alert.alert(
                      "Revoke clinician access?",
                      "New dashboard reads and encrypted-export downloads will be denied immediately.",
                      [
                        { text: "Keep access", style: "cancel" },
                        { text: "Revoke", style: "destructive", onPress: () => void revokeCareRelationship(relationship.doctorId) },
                      ],
                    )}
                    style={styles.revokeButton}
                  >
                    <Text style={styles.revokeText}>Revoke</Text>
                  </SoftPressable>
                </View>
              </View>
            ))}
            {careLinks.length === 0 ? <Text style={styles.emptyShares}>No clinicians linked.</Text> : null}
          </>
        ) : null}

        {mode === "scan" ? (
          <>
            <View style={styles.scannerBox}>
              <Ionicons name="link-outline" size={32} color="rgba(255,255,255,0.82)" />
              <Text style={styles.scannerText}>Enter the clinician’s code</Text>
              <Text style={styles.scannerSub}>This creates a revocable care relationship. It does not send a report yet.</Text>
              <TextInput
                value={inviteCode}
                onChangeText={(value) => setInviteCode(
                  value.toUpperCase().replace(/[^23456789ABCDEFGHJKLMNPQRSTUVWXYZ]/gu, "").slice(0, 6),
                )}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={6}
                placeholder="ABC234"
                placeholderTextColor="rgba(255,255,255,0.3)"
                style={styles.inviteInput}
                accessibilityLabel="Clinician invite code"
              />
            </View>
            <SoftPressable
              onPress={() => void claimInvite()}
              disabled={claiming}
              style={[styles.primaryButton, claiming && styles.disabled]}
            >
              <Text style={styles.primaryButtonText}>{claiming ? "Linking…" : "Confirm clinician link"}</Text>
            </SoftPressable>
            <BackButton onPress={() => setMode("menu")} />
          </>
        ) : null}

        {mode === "export" ? (
          <>
            <Text style={styles.sectionLabel}>ENCRYPTED REPORT SETTINGS</Text>
            <Text style={styles.controlLabel}>Clinician</Text>
            <View style={styles.chipRow}>
              {careLinks.map((relationship) => (
                <Chip
                  key={relationship.doctorId}
                  label={relationship.doctorId}
                  on={selectedDoctorId === relationship.doctorId}
                  onPress={() => setSelectedDoctorId(relationship.doctorId)}
                />
              ))}
            </View>

            <Text style={styles.controlLabel}>Record window</Text>
            <View style={styles.chipRow}>
              {RANGES.map((range) => (
                <Chip
                  key={range.days}
                  label={range.label}
                  on={rangeDays === range.days}
                  onPress={() => setRangeDays(range.days)}
                />
              ))}
            </View>

            <Text style={styles.controlLabel}>Sources sent for review</Text>
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

            <Text style={styles.controlLabel}>Encrypted export expires after</Text>
            <View style={styles.chipRow}>
              {VALIDITY.map((item) => (
                <Chip
                  key={item.label}
                  label={item.label}
                  on={validity.label === item.label}
                  onPress={() => setValidity(item)}
                />
              ))}
            </View>

            <View style={styles.flowNote}>
              <Ionicons name="sparkles-outline" size={21} color={colors.oliveDeep} />
              <Text style={styles.flowNoteText}>
                {included.length} selected sources → structured model review → patient-device encryption → expiring doctor export
              </Text>
            </View>

            <SoftPressable
              onPress={() => void generateExport()}
              disabled={creating}
              style={[styles.primaryButton, creating && styles.disabled]}
            >
              <Text style={styles.primaryButtonText}>{creating ? "Reviewing & encrypting…" : "Create encrypted report"}</Text>
            </SoftPressable>
            <BackButton onPress={() => setMode("menu")} />
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

function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <SoftPressable onPress={onPress} style={styles.backLink}>
      <Text style={styles.backLinkText}>‹ Back</Text>
    </SoftPressable>
  );
}

function ExportCard({
  value,
  onRevoke,
}: {
  value: DoctorExportMetadata;
  onRevoke: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardCopy}>
        <Text style={styles.cardTitle}>Encrypted for clinician</Text>
        <Text style={styles.cardDetail}>{value.doctorId}</Text>
        <Text style={styles.countdown}>Expires in {countdown(value.expiresAt)}</Text>
      </View>
      <SoftPressable
        onPress={() => Alert.alert(
          "Revoke this export?",
          "The ciphertext will be deleted and the clinician will no longer be able to download it.",
          [
            { text: "Keep", style: "cancel" },
            { text: "Revoke", style: "destructive", onPress: onRevoke },
          ],
        )}
        style={styles.revokeButton}
      >
        <Text style={styles.revokeText}>Revoke</Text>
      </SoftPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  header: {
    height: 58,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  roundButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.ink, fontSize: 16, fontWeight: "600" },
  scrollContent: { paddingHorizontal: 24 },
  intro: { paddingTop: 28, paddingBottom: 28 },
  eyebrow: {
    color: colors.oliveDeep,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.4,
    marginBottom: 10,
  },
  displayCopy: {
    color: colors.ink,
    fontFamily: typography.display,
    fontSize: 29,
    lineHeight: 35,
    letterSpacing: -0.7,
  },
  doorRow: { flexDirection: "row", gap: 12, marginBottom: 30 },
  door: {
    flex: 1,
    minHeight: 166,
    borderRadius: 24,
    padding: 19,
    backgroundColor: "rgba(255,255,255,0.64)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    ...shadows.quiet,
  },
  doorPrimary: { backgroundColor: "rgba(245,200,190,0.4)" },
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
    fontSize: 21,
    letterSpacing: -0.5,
  },
  doorSub: { color: colors.inkSoft, fontSize: 12.5, lineHeight: 17, marginTop: 6 },
  sectionLabel: {
    color: colors.inkFaint,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.3,
    marginBottom: 12,
  },
  linkedLabel: { marginTop: 28 },
  emptyShares: { color: colors.inkFaint, fontSize: 14, paddingVertical: 9 },
  card: {
    minHeight: 86,
    borderRadius: 18,
    padding: 16,
    marginBottom: 10,
    backgroundColor: "rgba(255,255,255,0.68)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  cardCopy: { flex: 1 },
  cardTitle: { color: colors.ink, fontSize: 15, fontWeight: "600" },
  cardDetail: { color: colors.inkFaint, fontSize: 12, marginTop: 3 },
  countdown: { color: colors.oliveDeep, fontSize: 12, fontWeight: "600", marginTop: 5 },
  cardActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  sendButton: { borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: colors.ink },
  sendText: { color: colors.canvas, fontSize: 12, fontWeight: "700" },
  revokeButton: { paddingVertical: 8, paddingHorizontal: 9 },
  revokeText: { color: colors.coral, fontSize: 12.5, fontWeight: "600" },
  scannerBox: {
    minHeight: 280,
    borderRadius: 28,
    padding: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ink,
    marginBottom: 18,
  },
  scannerText: { color: colors.white, fontSize: 20, fontWeight: "600", marginTop: 14 },
  scannerSub: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 7,
    maxWidth: 270,
  },
  inviteInput: {
    width: 210,
    color: colors.white,
    borderColor: "rgba(255,255,255,0.24)",
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 18,
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: 7,
    textAlign: "center",
    marginTop: 22,
  },
  controlLabel: { color: colors.oliveDeep, fontSize: 14, fontWeight: "600", marginBottom: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 18 },
  chip: {
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  chipOn: { borderColor: colors.olive, backgroundColor: "rgba(136,148,96,0.14)" },
  chipText: { color: colors.inkFaint, fontSize: 13.5, fontWeight: "600" },
  chipTextOn: { color: colors.oliveDeep },
  flowNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 18,
    padding: 16,
    backgroundColor: "rgba(136,148,96,0.12)",
    marginVertical: 8,
  },
  flowNoteText: { flex: 1, color: colors.inkSoft, fontSize: 13, lineHeight: 19 },
  primaryButton: {
    minHeight: 54,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ink,
    marginTop: 15,
  },
  primaryButtonText: { color: colors.canvas, fontSize: 15, fontWeight: "700" },
  disabled: { opacity: 0.55 },
  backLink: { alignSelf: "center", padding: 18 },
  backLinkText: { color: colors.inkFaint, fontSize: 14 },
});
