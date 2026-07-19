import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SoftPressable } from "../components/SoftPressable";
import { TrendChart } from "../components/TrendChart";
import { useHealthStore } from "../store/HealthStore";
import { colors, shadows, typography } from "../theme";
import type { SymptomKind } from "../types";

type HealthScreenProps = {
  onClose: () => void;
  onStartCheckIn: () => void;
  onOpenShare: () => void;
};

type Section = "overview" | "sharing";

function formatShortDate(date: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(date));
}

export function HealthScreen({ onClose, onStartCheckIn, onOpenShare }: HealthScreenProps) {
  const insets = useSafeAreaInsets();
  const { logs } = useHealthStore();
  const [section, setSection] = useState<Section>("overview");

  const chartValues = useMemo(() => logs.slice(0, 7).reverse().map((log) => log.severity), [logs]);
  const chartLabels = useMemo(() => {
    if (logs.length === 0) return ["Start", "Today"];
    const inChart = logs.slice(0, 7).reverse();
    const first = inChart[0];
    const last = inChart[inChart.length - 1];
    return first && last ? [formatShortDate(first.createdAt), formatShortDate(last.createdAt)] : ["", ""];
  }, [logs]);
  const topSymptoms = useMemo(() => {
    const counts = new Map<SymptomKind, number>();
    logs.forEach((log) => log.symptoms.forEach((symptom) => counts.set(symptom, (counts.get(symptom) ?? 0) + 1)));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  }, [logs]);
  return (
    <View style={[styles.screen, { paddingTop: insets.top + 4 }]}>
      <View style={styles.header}>
        <SoftPressable onPress={onClose} style={styles.roundButton} accessibilityLabel="Back to today">
          <Ionicons name="chevron-back" size={23} color={colors.ink} />
        </SoftPressable>
        <Text style={styles.headerTitle}>Your health</Text>
        <SoftPressable
          onPress={() => Alert.alert("Your privacy", "Reports are encrypted to your linked doctor’s browser key. Every export expires and can be revoked.")}
          style={styles.roundButton}
          accessibilityLabel="Privacy information"
        >
          <Ionicons name="shield-checkmark-outline" size={21} color={colors.oliveDeep} />
        </SoftPressable>
      </View>

      <View style={styles.segmentedControl}>
        {(["overview", "sharing"] as const).map((item) => (
          <SoftPressable
            key={item}
            onPress={() => setSection(item)}
            style={[styles.segment, section === item && styles.segmentSelected]}
            accessibilityRole="tab"
            accessibilityState={{ selected: section === item }}
          >
            <Text style={[styles.segmentLabel, section === item && styles.segmentLabelSelected]}>
              {item === "overview" ? "Overview" : "Sharing"}
            </Text>
          </SoftPressable>
        ))}
      </View>

      {section === "overview" ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 36 }]}
        >
          <View style={styles.overviewIntro}>
            <Text style={styles.displayTitle}>Your days,{`\n`}seen together.</Text>
            <Text style={styles.displayCopy}>Small check-ins become useful context over time.</Text>
          </View>

          <View style={styles.chartCard}>
            <View style={styles.cardHeadingRow}>
              <View>
                <Text style={styles.cardEyebrow}>SYMPTOM INTENSITY</Text>
                <Text style={styles.cardTitle}>{logs.length ? "Recent check-ins" : "Your baseline starts here"}</Text>
              </View>
              <View style={styles.countBadge}>
                <Text style={styles.countValue}>{logs.length}</Text>
                <Text style={styles.countLabel}>logs</Text>
              </View>
            </View>
            <View style={styles.chartWrap}>
              <TrendChart values={chartValues} labels={chartLabels} />
              {!logs.length ? (
                <View style={[styles.emptyChart, { pointerEvents: "none" }]}>
                  <Text style={styles.emptyChartText}>Log a symptom to reveal its pattern.</Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.insightGrid}>
            <View style={[styles.insightCard, styles.sleepCard]}>
              <Ionicons name="moon-outline" size={20} color={colors.oliveDeep} />
              <Text style={styles.insightValue}>7h 24</Text>
              <Text style={styles.insightLabel}>Sleep last night</Text>
              <Text style={styles.insightDetail}>12 min above your average</Text>
            </View>
            <View style={[styles.insightCard, styles.heartCard]}>
              <Ionicons name="heart-outline" size={20} color={colors.coral} />
              <Text style={styles.insightValue}>62</Text>
              <Text style={styles.insightLabel}>Resting heart rate</Text>
              <Text style={styles.insightDetail}>Within your usual range</Text>
            </View>
          </View>

          <View style={styles.patternCard}>
            <View style={styles.cardHeadingRow}>
              <View>
                <Text style={styles.cardEyebrow}>WHAT’S SHOWING UP</Text>
                <Text style={styles.cardTitle}>Most frequent</Text>
              </View>
              <Ionicons name="analytics-outline" size={22} color={colors.inkFaint} />
            </View>
            {topSymptoms.length ? (
              <View style={styles.patternList}>
                {topSymptoms.map(([symptom, count], index) => (
                  <View key={symptom} style={styles.patternRow}>
                    <View style={[styles.patternDot, { opacity: 1 - index * 0.22 }]} />
                    <Text style={styles.patternName}>{symptom}</Text>
                    <View style={styles.patternTrack}>
                      <View style={[styles.patternFill, { width: `${Math.max(22, (count / (topSymptoms[0]?.[1] ?? 1)) * 100)}%` }]} />
                    </View>
                    <Text style={styles.patternCount}>{count}×</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.emptyPattern}>No patterns yet. Your first check-in only takes a minute.</Text>
            )}
          </View>

          <SoftPressable onPress={onStartCheckIn} style={styles.checkInButton} accessibilityRole="button">
            <View style={styles.checkInIcon}>
              <Ionicons name="sparkles" size={17} color={colors.coral} />
            </View>
            <View style={styles.checkInButtonCopy}>
              <Text style={styles.checkInButtonTitle}>Add today’s check-in</Text>
              <Text style={styles.checkInButtonDetail}>Voice or text · about one minute</Text>
            </View>
            <Ionicons name="arrow-forward" size={18} color={colors.inkSoft} />
          </SoftPressable>
        </ScrollView>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 36 }]}
        >
          <View style={styles.overviewIntro}>
            <Text style={styles.displayTitle}>Share context,{`\n`}not your whole life.</Text>
            <Text style={styles.displayCopy}>Create an encrypted, time-limited clinical draft for a linked doctor.</Text>
          </View>

          <View style={styles.patternCard}>
            <View style={styles.cardHeadingRow}>
              <View>
                <Text style={styles.cardEyebrow}>DOCTOR-ONLY EXPORT</Text>
                <Text style={styles.cardTitle}>One authoritative sharing flow</Text>
              </View>
              <Ionicons name="lock-closed-outline" size={22} color={colors.oliveDeep} />
            </View>
            <Text style={styles.emptyPattern}>
              Choose the timeframe and sources, generate an AI clinical draft, then encrypt it to your linked doctor’s local browser key.
            </Text>
          </View>

          <SoftPressable onPress={onOpenShare} style={styles.checkInButton} accessibilityRole="button">
            <View style={styles.checkInIcon}>
              <Ionicons name="shield-checkmark" size={17} color={colors.coral} />
            </View>
            <View style={styles.checkInButtonCopy}>
              <Text style={styles.checkInButtonTitle}>Open encrypted exports</Text>
              <Text style={styles.checkInButtonDetail}>Link doctor · generate · encrypt · revoke</Text>
            </View>
            <Ionicons name="arrow-forward" size={18} color={colors.inkSoft} />
          </SoftPressable>
        </ScrollView>
      )}
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
    fontSize: 13,
    fontWeight: "600",
  },
  segmentedControl: {
    marginHorizontal: 22,
    marginTop: 6,
    padding: 4,
    borderRadius: 20,
    flexDirection: "row",
    backgroundColor: "rgba(227,220,214,0.5)",
  },
  segment: {
    flex: 1,
    height: 38,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentSelected: {
    backgroundColor: "rgba(255,255,255,0.86)",
    ...shadows.quiet,
  },
  segmentLabel: {
    color: colors.inkFaint,
    fontSize: 12,
    fontWeight: "600",
  },
  segmentLabelSelected: {
    color: colors.ink,
  },
  scrollContent: {
    paddingHorizontal: 22,
  },
  overviewIntro: {
    paddingTop: 38,
    paddingBottom: 28,
  },
  displayTitle: {
    fontFamily: typography.display,
    color: colors.ink,
    fontSize: 35,
    lineHeight: 38,
    letterSpacing: -0.8,
  },
  displayCopy: {
    color: colors.inkFaint,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
    maxWidth: 300,
  },
  chartCard: {
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.64)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: 18,
    ...shadows.quiet,
  },
  cardHeadingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  cardEyebrow: {
    color: colors.inkFaint,
    fontSize: 9.5,
    fontWeight: "700",
    letterSpacing: 1.05,
    marginBottom: 7,
  },
  cardTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "600",
  },
  countBadge: {
    minWidth: 50,
    paddingHorizontal: 10,
    height: 44,
    borderRadius: 15,
    backgroundColor: "rgba(245,200,190,0.24)",
    alignItems: "center",
    justifyContent: "center",
  },
  countValue: {
    color: colors.coral,
    fontSize: 15,
    lineHeight: 17,
    fontWeight: "700",
  },
  countLabel: {
    color: colors.inkFaint,
    fontSize: 8.5,
  },
  chartWrap: {
    marginTop: 24,
    minHeight: 152,
  },
  emptyChart: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyChartText: {
    color: colors.inkFaint,
    fontSize: 11,
  },
  insightGrid: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  insightCard: {
    flex: 1,
    minHeight: 158,
    borderRadius: 22,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  sleepCard: {
    backgroundColor: "rgba(215,221,198,0.38)",
  },
  heartCard: {
    backgroundColor: "rgba(248,220,211,0.38)",
  },
  insightValue: {
    fontFamily: typography.displayMedium,
    color: colors.ink,
    fontSize: 27,
    letterSpacing: -0.5,
    marginTop: 18,
  },
  insightLabel: {
    color: colors.ink,
    fontSize: 11.5,
    fontWeight: "600",
    marginTop: 1,
  },
  insightDetail: {
    color: colors.inkFaint,
    fontSize: 9.5,
    lineHeight: 14,
    marginTop: 7,
  },
  patternCard: {
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.58)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: 18,
    marginTop: 12,
  },
  patternList: {
    marginTop: 22,
    gap: 18,
  },
  patternRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  patternDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.coral,
  },
  patternName: {
    width: 70,
    color: colors.inkSoft,
    fontSize: 11,
    fontWeight: "500",
  },
  patternTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    backgroundColor: "rgba(233,128,121,0.1)",
  },
  patternFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.coralSoft,
  },
  patternCount: {
    width: 22,
    color: colors.inkFaint,
    fontSize: 10,
    textAlign: "right",
  },
  emptyPattern: {
    color: colors.inkFaint,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 20,
    marginBottom: 4,
  },
  checkInButton: {
    minHeight: 74,
    borderRadius: 22,
    marginTop: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  checkInIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(245,200,190,0.25)",
  },
  checkInButtonCopy: {
    flex: 1,
    gap: 3,
  },
  checkInButtonTitle: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "600",
  },
  checkInButtonDetail: {
    color: colors.inkFaint,
    fontSize: 10.5,
  },
});
