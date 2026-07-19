import Ionicons from "@expo/vector-icons/Ionicons";
import { Newsreader_400Regular } from "@expo-google-fonts/newsreader/400Regular";
import { Newsreader_500Medium } from "@expo-google-fonts/newsreader/500Medium";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { Animated, Modal, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";

import { SoftPressable } from "./src/components/SoftPressable";
import { CheckInScreen } from "./src/screens/CheckInScreen";
import { HealthScreen } from "./src/screens/HealthScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { HealthStoreProvider } from "./src/store/HealthStore";
import { colors, shadows, typography } from "./src/theme";
import type { AppRoute } from "./src/types";

function AppShell() {
  const insets = useSafeAreaInsets();
  const [route, setRoute] = useState<AppRoute>("home");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [entrance] = useState(() => new Animated.Value(1));

  function navigate(next: AppRoute) {
    setRoute(next);
    entrance.setValue(0);
    Animated.spring(entrance, {
      toValue: 1,
      damping: 24,
      stiffness: 260,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <Animated.View
        style={[
          styles.appSurface,
          {
            opacity: entrance,
            transform: [
              {
                scale: entrance.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] }),
              },
            ],
          },
        ]}
      >
        {route === "home" ? (
          <HomeScreen
            onStartCheckIn={() => navigate("checkin")}
            onOpenHealth={() => navigate("health")}
            onOpenNotifications={() => setNotificationsOpen(true)}
          />
        ) : null}
        {route === "checkin" ? <CheckInScreen onClose={() => navigate("home")} onComplete={() => navigate("home")} /> : null}
        {route === "health" ? (
          <HealthScreen onClose={() => navigate("home")} onStartCheckIn={() => navigate("checkin")} />
        ) : null}
      </Animated.View>

      <Modal visible={notificationsOpen} transparent animationType="fade" onRequestClose={() => setNotificationsOpen(false)}>
        <View style={styles.modalRoot}>
          <SoftPressable onPress={() => setNotificationsOpen(false)} style={StyleSheet.absoluteFill} accessibilityLabel="Close notifications" />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeading}>
              <View>
                <Text style={styles.sheetEyebrow}>A GENTLE NUDGE</Text>
                <Text style={styles.sheetTitle}>Your reminders</Text>
              </View>
              <SoftPressable onPress={() => setNotificationsOpen(false)} style={styles.sheetClose} accessibilityLabel="Close">
                <Ionicons name="close" size={22} color={colors.ink} />
              </SoftPressable>
            </View>
            <View style={styles.reminderCard}>
              <View style={styles.reminderIcon}>
                <Ionicons name="sparkles" size={18} color={colors.coral} />
              </View>
              <View style={styles.reminderCopy}>
                <Text style={styles.reminderTitle}>Evening check-in</Text>
                <Text style={styles.reminderDetail}>A minute now can make your next appointment clearer.</Text>
              </View>
              <Text style={styles.reminderTime}>20:00</Text>
            </View>
            <SoftPressable
              onPress={() => {
                setNotificationsOpen(false);
                navigate("checkin");
              }}
              style={styles.reminderButton}
            >
              <Text style={styles.reminderButtonText}>Check in now</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.white} />
            </SoftPressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({ Newsreader_400Regular, Newsreader_500Medium });

  if (!fontsLoaded) return <View style={styles.root} />;

  return (
    <SafeAreaProvider>
      <HealthStoreProvider>
        <AppShell />
      </HealthStoreProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  appSurface: {
    flex: 1,
    width: "100%",
    maxWidth: 430,
    alignSelf: "center",
    overflow: "hidden",
    backgroundColor: colors.canvas,
  },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(48, 42, 38, 0.18)",
  },
  sheet: {
    width: "100%",
    maxWidth: 430,
    alignSelf: "center",
    paddingTop: 10,
    paddingHorizontal: 22,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    backgroundColor: colors.canvas,
    ...shadows.lifted,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.lineStrong,
    marginBottom: 22,
  },
  sheetHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sheetEyebrow: {
    color: colors.inkFaint,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.1,
  },
  sheetTitle: {
    fontFamily: typography.display,
    color: colors.ink,
    fontSize: 29,
    letterSpacing: -0.6,
    marginTop: 3,
  },
  sheetClose: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.6)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  reminderCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 86,
    borderRadius: 22,
    marginTop: 24,
    paddingHorizontal: 14,
    backgroundColor: "rgba(255,255,255,0.62)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  reminderIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(245,200,190,0.24)",
  },
  reminderCopy: {
    flex: 1,
    gap: 4,
  },
  reminderTitle: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "600",
  },
  reminderDetail: {
    color: colors.inkFaint,
    fontSize: 10,
    lineHeight: 14,
  },
  reminderTime: {
    color: colors.oliveDeep,
    fontSize: 10,
    fontWeight: "600",
  },
  reminderButton: {
    alignSelf: "center",
    minWidth: 190,
    height: 52,
    borderRadius: 26,
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.olive,
  },
  reminderButtonText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: "600",
  },
});
