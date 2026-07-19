import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AnimatedOrb } from "../components/AnimatedOrb";
import { SoftPressable } from "../components/SoftPressable";
import { colors, typography } from "../theme";

type HomeScreenProps = {
  onStartCheckIn: () => void;
  onOpenHealth: () => void;
  onOpenJournal: () => void;
  onOpenShare: () => void;
};

export function HomeScreen({ onStartCheckIn, onOpenHealth, onOpenJournal, onOpenShare }: HomeScreenProps) {
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const compact = height < 720;
  const orbSize = Math.min(compact ? 232 : 272, width * 0.74);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 10, paddingBottom: Math.max(insets.bottom, 18) }]}>
      <View style={styles.header}>
        <Text style={styles.brand}>heyjule</Text>
        <View style={styles.headerActions}>
          <SoftPressable
            onPress={onOpenShare}
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel="Share with your doctor"
          >
            <Ionicons name="qr-code-outline" size={27} color={colors.ink} />
          </SoftPressable>
          <SoftPressable
            onPress={onOpenJournal}
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel="Journal: logs and reminders"
          >
            <Ionicons name="book-outline" size={27} color={colors.ink} />
          </SoftPressable>
          <SoftPressable
            onPress={onOpenHealth}
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel="Your health and sharing"
          >
            <Ionicons name="person-circle-outline" size={29} color={colors.ink} />
          </SoftPressable>
        </View>
      </View>

      <View style={[styles.intro, compact && styles.introCompact]}>
        <Text style={styles.title}>What are you feeling?</Text>
        <Text style={styles.subtitle}>Tracking your symptoms helps doctors{`\n`}understand your body more accurately.</Text>
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
          <Ionicons name="arrow-forward" size={17} color={colors.inkSoft} />
        </SoftPressable>
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
    fontSize: 33,
    letterSpacing: -0.9,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  iconButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
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
    fontSize: 43,
    lineHeight: 47,
    letterSpacing: -1.1,
  },
  subtitle: {
    color: colors.inkFaint,
    fontSize: 17,
    lineHeight: 25,
    marginTop: 14,
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
    minHeight: 52,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  startText: {
    color: colors.inkSoft,
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
});
