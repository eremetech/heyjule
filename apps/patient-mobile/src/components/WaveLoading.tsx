import { Canvas, Group, Path, Skia } from "@shopify/react-native-skia";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import {
  Easing,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { colors, typography } from "../theme";

const MESSAGES = [
  "Gathering your check-ins…",
  "Reviewing with the model…",
  "Sealing it for your clinician…",
];

function wavePath(
  width: number,
  height: number,
  waterline: number,
  time: number,
  amplitude: number,
  speed: number,
  wavelength: number,
) {
  "worklet";
  const path = Skia.Path.Make();
  path.moveTo(0, waterline);
  for (let x = 0; x <= width; x += 6) {
    const y =
      waterline +
      Math.sin((x / width) * wavelength * Math.PI * 2 + time * speed) * amplitude +
      Math.sin((x / width) * wavelength * Math.PI - time * speed * 0.6) * amplitude * 0.5;
    path.lineTo(x, y);
  }
  path.lineTo(width, height);
  path.lineTo(0, height);
  path.close();
  return path;
}

/**
 * Full-screen "water rising" loader: two out-of-phase waves climb from the
 * bottom while the report is generated and encrypted. Indeterminate — the
 * level eases toward ~90% and holds until the parent unmounts it.
 */
export function WaveLoading({ title = "Preparing your report" }: { title?: string }) {
  const { width, height } = useWindowDimensions();
  const progress = useSharedValue(0);
  const time = useSharedValue(0);
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    progress.value = withTiming(0.9, { duration: 22_000, easing: Easing.out(Easing.cubic) });
  }, [progress]);

  useEffect(() => {
    const interval = setInterval(
      () => setMessageIndex((index) => (index + 1) % MESSAGES.length),
      3_600,
    );
    return () => clearInterval(interval);
  }, []);

  useFrameCallback((frame) => {
    time.value = frame.timeSinceFirstFrame / 1000;
  });

  const backWave = useDerivedValue(() => {
    const waterline = height * (1 - progress.value * 0.92) - 14;
    return wavePath(width, height, waterline, time.value, 16, 1.6, 2.1);
  });
  const frontWave = useDerivedValue(() => {
    const waterline = height * (1 - progress.value * 0.92);
    return wavePath(width, height, waterline, time.value + 1.7, 12, 2.1, 1.6);
  });

  const styles = useMemo(() => createStyles(), []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="auto">
      <View style={styles.backdrop} />
      <Canvas style={StyleSheet.absoluteFill}>
        <Group>
          <Path path={backWave} color={colors.coralSoft} opacity={0.55} />
          <Path path={frontWave} color={colors.coral} opacity={0.9} />
        </Group>
      </Canvas>
      <View style={styles.copy} pointerEvents="none">
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{MESSAGES[messageIndex]}</Text>
        <Text style={styles.hint}>This can take a little while — your data never leaves unencrypted.</Text>
      </View>
    </View>
  );
}

function createStyles() {
  return StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.canvas,
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
}
