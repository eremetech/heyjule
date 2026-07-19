import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";

import { colors, typography } from "../theme";

const MESSAGES = [
  "Gathering your check-ins…",
  "Reviewing with the model…",
  "Sealing it for your clinician…",
];

/**
 * Web build of the full-screen report loader. The native version draws its
 * rising water with Skia, which needs CanvasKit on web; this keeps the same
 * copy and rising-fill feel with plain animated views instead.
 */
export function WaveLoading({ title = "Preparing your report" }: { title?: string }) {
  const progress = useRef(new Animated.Value(0)).current;
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 0.9,
      duration: 22_000,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress]);

  useEffect(() => {
    const interval = setInterval(
      () => setMessageIndex((index) => (index + 1) % MESSAGES.length),
      3_600,
    );
    return () => clearInterval(interval);
  }, []);

  const fillHeight = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "92%"],
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="auto">
      <View style={styles.backdrop} />
      <Animated.View style={[styles.fill, { height: fillHeight }]}>
        <View style={styles.crestBack} />
        <View style={styles.crestFront} />
      </Animated.View>
      <View style={styles.copy} pointerEvents="none">
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{MESSAGES[messageIndex]}</Text>
        <Text style={styles.hint}>This can take a little while — your data never leaves unencrypted.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.canvas,
  },
  fill: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.coral,
    opacity: 0.9,
  },
  crestBack: {
    position: "absolute",
    top: -22,
    left: "-15%",
    width: "130%",
    height: 44,
    borderTopLeftRadius: 999,
    borderTopRightRadius: 999,
    backgroundColor: colors.coralSoft,
    opacity: 0.7,
  },
  crestFront: {
    position: "absolute",
    top: -12,
    left: "-5%",
    width: "110%",
    height: 36,
    borderTopLeftRadius: 999,
    borderTopRightRadius: 999,
    backgroundColor: colors.coral,
  },
  copy: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 10,
  },
  title: {
    fontFamily: typography.displayMedium,
    fontSize: 30,
    letterSpacing: -0.6,
    color: colors.ink,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    color: colors.inkSoft,
    textAlign: "center",
  },
  hint: {
    marginTop: 14,
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.inkFaint,
    textAlign: "center",
  },
});
