import Ionicons from "@expo/vector-icons/Ionicons";
import { Newsreader_400Regular } from "@expo-google-fonts/newsreader/400Regular";
import { Newsreader_500Medium } from "@expo-google-fonts/newsreader/500Medium";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { ActivityIndicator, Animated, Platform, StyleSheet, Text, TextInput, View } from "react-native";

import { DeviceFrame } from "./src/components/DeviceFrame";
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

// On web the heyjule:// deep link can't come back to us, so the emailed
// 6-digit code is the primary sign-in there; on the phone the one-tap link
// stays primary with the code as a fallback.
const codeFirst = Platform.OS === "web";

function PatientAppGate() {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
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
  if (auth.awaitingCode) {
    return (
      <View style={styles.authRoot}>
        <Text style={styles.authEyebrow}>CHECK YOUR EMAIL</Text>
        <Text style={styles.authTitle}>Enter your{"\n"}sign-in code.</Text>
        <Text style={styles.authDetail}>
          We emailed a 6-digit code to {email.trim().toLowerCase()}. It expires in 5 minutes.
        </Text>
        <TextInput
          style={[styles.authInput, styles.authCodeInput]}
          value={code}
          onChangeText={(value) => setCode(value.replace(/\D/gu, "").slice(0, 6))}
          placeholder="000000"
          placeholderTextColor={colors.inkFaint}
          keyboardType="number-pad"
          inputMode="numeric"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={6}
          onSubmitEditing={() => void auth.signInWithCode(email, code)}
        />
        {auth.error ? <Text style={styles.authError}>{auth.error}</Text> : null}
        <SoftPressable onPress={() => void auth.signInWithCode(email, code)} style={styles.authButton}>
          <Text style={styles.authButtonText}>Sign in</Text>
          <Ionicons name="arrow-forward" size={17} color={colors.white} />
        </SoftPressable>
        <SoftPressable
          onPress={() => {
            setCode("");
            void auth.requestCode(email);
          }}
          style={styles.authQuiet}
        >
          <Text style={styles.authQuietText}>Send a new code</Text>
        </SoftPressable>
      </View>
    );
  }
  if (auth.awaitingLink) {
    return (
      <View style={styles.authRoot}>
        <Text style={styles.authEyebrow}>CHECK YOUR EMAIL</Text>
        <Text style={styles.authTitle}>Your sign-in link{"\n"}is on its way.</Text>
        <Text style={styles.authDetail}>
          We sent a link to {email.trim().toLowerCase()}. Open it on this phone and you&apos;ll land right
          back here, signed in.
        </Text>
        {auth.error ? <Text style={styles.authError}>{auth.error}</Text> : null}
        <SoftPressable onPress={() => void auth.signIn(email)} style={styles.authButton}>
          <Text style={styles.authButtonText}>Send it again</Text>
          <Ionicons name="refresh" size={17} color={colors.white} />
        </SoftPressable>
        <SoftPressable onPress={() => void auth.requestCode(email)} style={styles.authQuiet}>
          <Text style={styles.authQuietText}>Can&apos;t open the link? Email me a code</Text>
        </SoftPressable>
      </View>
    );
  }
  const requestPrimary = () => void (codeFirst ? auth.requestCode(email) : auth.signIn(email));
  return (
    <View style={styles.authRoot}>
      <Text style={styles.authEyebrow}>PRIVATE BY DESIGN</Text>
      <Text style={styles.authTitle}>Your health story,{"\n"}kept close.</Text>
      <Text style={styles.authDetail}>
        {codeFirst
          ? "Enter your email and we'll send you a 6-digit sign-in code. No password needed."
          : "Enter your email and we'll send you a secure one-tap sign-in link. No password needed."}
      </Text>
      <TextInput
        style={styles.authInput}
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        placeholderTextColor={colors.inkFaint}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        onSubmitEditing={requestPrimary}
      />
      {auth.error ? <Text style={styles.authError}>{auth.error}</Text> : null}
      <SoftPressable onPress={requestPrimary} style={styles.authButton}>
        <Text style={styles.authButtonText}>
          {codeFirst ? "Email me a sign-in code" : "Email me a sign-in link"}
        </Text>
        <Ionicons name="arrow-forward" size={17} color={colors.white} />
      </SoftPressable>
      {codeFirst ? null : (
        <SoftPressable onPress={() => void auth.requestCode(email)} style={styles.authQuiet}>
          <Text style={styles.authQuietText}>Prefer a code? Email me one</Text>
        </SoftPressable>
      )}
    </View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({ Newsreader_400Regular, Newsreader_500Medium });

  if (!fontsLoaded) return <View style={styles.root} />;

  return (
    <DeviceFrame>
      <AuthProvider>
        <HealthStoreProvider>
          <PatientAppGate />
        </HealthStoreProvider>
      </AuthProvider>
    </DeviceFrame>
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
  authCodeInput: {
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: 10,
    textAlign: "center",
  },
  authQuiet: {
    marginTop: 16,
    alignSelf: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  authQuietText: {
    color: colors.inkSoft,
    fontSize: 13.5,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  authInput: {
    minHeight: 54,
    marginTop: 26,
    paddingHorizontal: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(28, 25, 23, 0.14)",
    backgroundColor: colors.white,
    color: colors.ink,
    fontSize: 16,
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
