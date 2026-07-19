import Ionicons from "@expo/vector-icons/Ionicons";
import { Newsreader_400Regular } from "@expo-google-fonts/newsreader/400Regular";
import { Newsreader_500Medium } from "@expo-google-fonts/newsreader/500Medium";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { ActivityIndicator, Animated, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { SoftPressable } from "./src/components/SoftPressable";
import { AuthProvider, useAuth } from "./src/auth/AuthProvider";
import { CheckInScreen } from "./src/screens/CheckInScreen";
import { HealthScreen } from "./src/screens/HealthScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { JournalScreen } from "./src/screens/JournalScreen";
import { ShareScreen } from "./src/screens/ShareScreen";
import { HealthStoreProvider } from "./src/store/HealthStore";
import { colors, typography } from "./src/theme";
import type { AppRoute } from "./src/types";

function AppShell() {
  const [route, setRoute] = useState<AppRoute>("home");
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
            onOpenJournal={() => navigate("journal")}
            onOpenShare={() => navigate("share")}
          />
        ) : null}
        {route === "checkin" ? <CheckInScreen onClose={() => navigate("home")} onComplete={() => navigate("home")} /> : null}
        {route === "health" ? (
          <HealthScreen
            onClose={() => navigate("home")}
            onStartCheckIn={() => navigate("checkin")}
            onOpenShare={() => navigate("share")}
          />
        ) : null}
        {route === "journal" ? (
          <JournalScreen onClose={() => navigate("home")} onStartCheckIn={() => navigate("checkin")} />
        ) : null}
        {route === "share" ? <ShareScreen onClose={() => navigate("home")} /> : null}
      </Animated.View>
    </View>
  );
}

function PatientAppGate() {
  const auth = useAuth();
  if (!auth.configured) return <AppShell />;
  if (auth.loading) {
    return (
      <View style={styles.authRoot}>
        <ActivityIndicator color={colors.coral} />
        <Text style={styles.authDetail}>Opening your private health journal…</Text>
      </View>
    );
  }
  if (auth.signedIn) return <AppShell />;
  return (
    <View style={styles.authRoot}>
      <Text style={styles.authEyebrow}>PRIVATE BY DESIGN</Text>
      <Text style={styles.authTitle}>Your health story,{"\n"}kept close.</Text>
      <Text style={styles.authDetail}>
        Sign in securely to receive your chat summaries and keep your check-ins in sync.
      </Text>
      {auth.error ? <Text style={styles.authError}>{auth.error}</Text> : null}
      <SoftPressable onPress={() => void auth.signIn()} style={styles.authButton}>
        <Text style={styles.authButtonText}>Sign in securely</Text>
        <Ionicons name="arrow-forward" size={17} color={colors.white} />
      </SoftPressable>
    </View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({ Newsreader_400Regular, Newsreader_500Medium });

  if (!fontsLoaded) return <View style={styles.root} />;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <HealthStoreProvider>
          <PatientAppGate />
        </HealthStoreProvider>
      </AuthProvider>
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
  authRoot: {
    flex: 1,
    width: "100%",
    maxWidth: 430,
    alignSelf: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
    backgroundColor: colors.canvas,
  },
  authEyebrow: {
    color: colors.coral,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  authTitle: {
    marginTop: 12,
    color: colors.ink,
    fontFamily: typography.display,
    fontSize: 42,
    lineHeight: 46,
    letterSpacing: -1.2,
  },
  authDetail: {
    marginTop: 18,
    color: colors.inkFaint,
    fontSize: 15,
    lineHeight: 23,
  },
  authError: {
    marginTop: 14,
    color: colors.coral,
    fontSize: 13,
    lineHeight: 18,
  },
  authButton: {
    minHeight: 54,
    marginTop: 28,
    paddingHorizontal: 20,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.coral,
  },
  authButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: "700",
  },
});
