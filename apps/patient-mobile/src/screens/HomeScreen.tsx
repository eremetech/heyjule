import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AnimatedOrb } from "../components/AnimatedOrb";
import { MetricPill } from "../components/MetricPill";
import { SoftPressable } from "../components/SoftPressable";
import { colors, typography } from "../theme";

type HomeScreenProps = {
  onStartCheckIn: () => void;
  onOpenHealth: () => void;
  onOpenNotifications: () => void;
};

export function HomeScreen({ onStartCheckIn, onOpenHealth, onOpenNotifications }: HomeScreenProps) {
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const compact = height < 720;
  const orbSize = Math.min(compact ? 174 : 202, width * 0.56);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 10, paddingBottom: Math.max(insets.bottom, 18) }]}>
      <View style={styles.header}>
        <Text style={styles.brand}>heyjule</Text>
        <View style={styles.headerActions}>
          <SoftPressable
            onPress={onOpenNotifications}
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
          >
            <Ionicons name="notifications-outline" size={22} color={colors.ink} />
            <View style={styles.notificationDot} />
          </SoftPressable>
          <SoftPressable
            onPress={onOpenHealth}
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel="Your health and sharing"
          >
            <Ionicons name="person-circle-outline" size={24} color={colors.ink} />
          </SoftPressable>
        </View>
      </View>

      <View style={[styles.intro, compact && styles.introCompact]}>
        <Text style={styles.title}>How are you{`\n`}feeling today?</Text>
        <Text style={styles.subtitle}>Your daily check-in helps you see{`\n`}your patterns and feel in control.</Text>
      </View>

      <View style={styles.centerStage}>
        <SoftPressable
          onPress={onStartCheckIn}
          pressedScale={0.985}
          accessibilityRole="button"
          accessibilityLabel="Start today's health check-in"
          style={styles.orbButton}
        >
          <AnimatedOrb size={orbSize} />
        </SoftPressable>
        <SoftPressable onPress={onStartCheckIn} style={styles.startButton} accessibilityRole="button">
          <Text style={styles.startText}>Start check-in</Text>
          <Ionicons name="arrow-forward" size={14} color={colors.inkSoft} />
        </SoftPressable>
      </View>

      <View style={styles.metrics}>
        <MetricPill icon="moon-outline" label="Sleep" value="7h 24" color={colors.olive} onPress={onOpenHealth} />
        <MetricPill icon="happy-outline" label="Mood" value="Good" color={colors.coral} onPress={onOpenHealth} />
        <MetricPill icon="flash-outline" label="Energy" value="Steady" color={colors.olive} onPress={onOpenHealth} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.canvas,
    paddingHorizontal: 24,
  },
  header: {
    height: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brand: {
    fontFamily: typography.displayMedium,
    color: colors.ink,
    fontSize: 27,
    letterSpacing: -0.8,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  iconButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  notificationDot: {
    position: "absolute",
    right: 9,
    top: 8,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.coral,
    borderWidth: 1,
    borderColor: colors.canvas,
  },
  intro: {
    marginTop: 58,
  },
  introCompact: {
    marginTop: 24,
  },
  title: {
    fontFamily: typography.display,
    color: colors.ink,
    fontSize: 35,
    lineHeight: 38,
    letterSpacing: -0.9,
  },
  subtitle: {
    color: colors.inkFaint,
    fontSize: 13.5,
    lineHeight: 20,
    marginTop: 12,
  },
  centerStage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 240,
  },
  orbButton: {
    alignItems: "center",
    justifyContent: "center",
  },
  startButton: {
    marginTop: 8,
    minHeight: 44,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  startText: {
    color: colors.inkSoft,
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
  metrics: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    paddingTop: 6,
    paddingBottom: 12,
  },
});
