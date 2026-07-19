import Ionicons from "@expo/vector-icons/Ionicons";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SoftPressable } from "../components/SoftPressable";
import { useHealthStore } from "../store/HealthStore";
import { colors, shadows, typography } from "../theme";
import type { SymptomLog } from "../types";

type JournalScreenProps = {
  onClose: () => void;
  onStartCheckIn: () => void;
};

const sourceIcons: Record<SymptomLog["source"], React.ComponentProps<typeof Ionicons>["name"]> = {
  text: "create-outline",
  voice: "mic-outline",
  chat_summary: "chatbubble-ellipses-outline",
};

function formatLogDate(date: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(date));
}

export function JournalScreen({ onClose, onStartCheckIn }: JournalScreenProps) {
  const insets = useSafeAreaInsets();
  const { logs } = useHealthStore();

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 4 }]}>
      <View style={styles.header}>
        <SoftPressable onPress={onClose} style={styles.roundButton} accessibilityLabel="Back to today">
          <Ionicons name="chevron-back" size={27} color={colors.ink} />
        </SoftPressable>
        <Text style={styles.headerTitle}>Journal</Text>
        <View style={styles.roundButton} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 36 }]}
      >
        <View style={styles.intro}>
          <Text style={styles.displayTitle}>Noted, kept,{`\n`}remembered.</Text>
          <Text style={styles.displayCopy}>Your logs and reminders, all in one quiet place.</Text>
        </View>

        <Text style={styles.sectionLabel}>REMINDERS</Text>
        <View style={styles.reminderCard}>
          <View style={styles.reminderIcon}>
            <Ionicons name="sparkles" size={22} color={colors.coral} />
          </View>
          <View style={styles.reminderCopy}>
            <Text style={styles.reminderTitle}>Evening check-in</Text>
            <Text style={styles.reminderDetail}>A minute now can make your next appointment clearer.</Text>
          </View>
          <Text style={styles.reminderTime}>20:00</Text>
        </View>
        <SoftPressable onPress={onStartCheckIn} style={styles.reminderButton} accessibilityRole="button">
          <Text style={styles.reminderButtonText}>Check in now</Text>
          <Ionicons name="arrow-forward" size={19} color={colors.white} />
        </SoftPressable>

        <Text style={[styles.sectionLabel, styles.logsLabel]}>YOUR LOGS</Text>
        {logs.length === 0 ? (
          <Text style={styles.emptyLogs}>
            No entries yet. Your first check-in only takes a minute.
          </Text>
        ) : (
          logs.map((log) => (
            <View key={log.id} style={styles.logCard}>
              <View style={styles.logIcon}>
                <Ionicons name={sourceIcons[log.source]} size={20} color={colors.oliveDeep} />
              </View>
              <View style={styles.logCopy}>
                <Text style={styles.logDate}>{formatLogDate(log.createdAt)}</Text>
                <Text style={styles.logSymptoms}>{log.symptoms.join(" · ") || "Check-in"}</Text>
                {log.note ? (
                  <Text style={styles.logNote} numberOfLines={2}>
                    {log.note}
                  </Text>
                ) : null}
              </View>
              <View style={styles.severityBadge}>
                <Text style={styles.severityValue}>{log.severity}</Text>
                <Text style={styles.severityLabel}>/10</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
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
  sectionLabel: {
    color: colors.inkFaint,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.3,
    marginBottom: 12,
  },
  logsLabel: {
    marginTop: 38,
  },
  reminderCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 100,
    borderRadius: 24,
    paddingHorizontal: 17,
    backgroundColor: "rgba(255,255,255,0.62)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    ...shadows.quiet,
  },
  reminderIcon: {
    width: 50,
    height: 50,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(245,200,190,0.24)",
  },
  reminderCopy: {
    flex: 1,
    gap: 5,
  },
  reminderTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "600",
  },
  reminderDetail: {
    color: colors.inkFaint,
    fontSize: 12.5,
    lineHeight: 17,
  },
  reminderTime: {
    color: colors.oliveDeep,
    fontSize: 12.5,
    fontWeight: "600",
  },
  reminderButton: {
    alignSelf: "center",
    minWidth: 220,
    height: 58,
    borderRadius: 29,
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    backgroundColor: colors.olive,
  },
  reminderButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "600",
  },
  emptyLogs: {
    color: colors.inkFaint,
    fontSize: 15,
    lineHeight: 22,
    fontStyle: "italic",
  },
  logCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 24,
    padding: 17,
    marginBottom: 12,
    backgroundColor: "rgba(255,255,255,0.62)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  logIcon: {
    width: 46,
    height: 46,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(136,148,96,0.1)",
  },
  logCopy: {
    flex: 1,
    gap: 3,
  },
  logDate: {
    color: colors.inkFaint,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },
  logSymptoms: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "600",
  },
  logNote: {
    color: colors.inkSoft,
    fontSize: 14,
    lineHeight: 19,
    marginTop: 2,
  },
  severityBadge: {
    flexDirection: "row",
    alignItems: "baseline",
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 14,
    backgroundColor: "rgba(245,200,190,0.24)",
    alignSelf: "center",
  },
  severityValue: {
    color: colors.coral,
    fontSize: 17,
    fontWeight: "700",
    alignSelf: "center",
  },
  severityLabel: {
    color: colors.inkFaint,
    fontSize: 11,
    alignSelf: "center",
  },
});
