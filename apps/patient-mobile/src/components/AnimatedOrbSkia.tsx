import { Canvas, Fill, Shader, Skia, useClock } from "@shopify/react-native-skia";
import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View } from "react-native";
import { useDerivedValue } from "react-native-reanimated";

export type OrbMode = "idle" | "listening" | "thinking" | "saved";

type AnimatedOrbProps = {
  size: number;
  mode?: OrbMode;
  level?: number;
};

const ORB_EFFECT = Skia.RuntimeEffect.Make(`
  uniform float uSize;
  uniform float uTime;
  uniform float uEnergy;
  uniform float uSaved;

  float2 rotate2(float2 p, float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return float2(c * p.x - s * p.y, s * p.x + c * p.y);
  }

  float hash21(float2 p) {
    return fract(sin(dot(p, float2(12.9898, 78.233))) * 43758.5453);
  }

  half4 main(float2 fragCoord) {
    float2 uv = (fragCoord - float2(uSize * 0.5)) / (uSize * 0.5);
    uv.y = -uv.y;
    float radius2 = dot(uv, uv);
    if (radius2 > 1.0) {
      return half4(0.0);
    }

    float radius = sqrt(radius2);
    float sphereDepth = sqrt(max(0.0, 1.0 - radius2));
    float time = uTime;
    float motion = time * (0.16 + uEnergy * 0.10);

    float3 pearl = float3(0.992, 0.978, 0.972);
    float3 blush = float3(0.982, 0.625, 0.615);
    float3 coral = float3(0.935, 0.225, 0.245);
    float3 hotPink = float3(0.938, 0.145, 0.430);
    float3 peach = float3(0.988, 0.710, 0.610);
    float3 sage = float3(0.667, 0.714, 0.541);

    float3 volumeColor = float3(0.0);
    float volumeAlpha = 0.0;
    for (int sampleIndex = 0; sampleIndex < 30; sampleIndex++) {
      float progress = (float(sampleIndex) + 0.5) / 30.0;
      float z = mix(-sphereDepth, sphereDepth, progress);
      float3 p = float3(uv.x, uv.y, z);
      p.xz = rotate2(p.xz, motion * 0.72);
      p.yz = rotate2(p.yz, -0.34 + sin(motion * 0.46) * 0.34);
      p.xy = rotate2(p.xy, sin(motion * 0.31) * 0.16);

      float sheetSurface =
        sin(p.x * 2.75 + motion * 1.8) * 0.20 +
        sin(p.z * 2.15 - motion * 1.35) * 0.15 +
        sin((p.x - p.z) * 5.8 + motion * 0.8) * 0.045;
      float sheetDistance = abs(p.y - sheetSurface - 0.05);
      float sheet = 1.0 - smoothstep(0.07, 0.285 + uEnergy * 0.035, sheetDistance);
      float sheetEdge = exp(-abs(sheetDistance - 0.205) * 31.0);
      float crease =
        pow(0.5 + 0.5 * sin(p.x * 7.2 - p.z * 4.6 + motion * 1.4), 18.0) *
        sheet;

      float backSurface =
        -0.37 +
        sin(p.x * 1.7 - motion * 0.8 + 1.5) * 0.17 +
        sin(p.z * 2.0 + motion * 0.55) * 0.08;
      float backSheet = 1.0 - smoothstep(0.08, 0.34, abs(p.y - backSurface));

      float3 sheetColor = mix(blush, coral, clamp(0.46 + p.z * 0.38, 0.0, 1.0));
      sheetColor = mix(sheetColor, hotPink, sheetEdge * 0.28);
      sheetColor = mix(sheetColor, float3(1.0, 0.91, 0.90), crease * 0.55);
      sheetColor = mix(sheetColor, sage, uSaved * 0.72);

      float localAlpha = sheet * (0.068 + uEnergy * 0.018);
      localAlpha += backSheet * 0.018;
      float3 localColor = mix(sheetColor, peach, backSheet * 0.58);
      localAlpha *= 0.48 + sphereDepth * 0.52;
      localAlpha = clamp(localAlpha, 0.0, 0.16);

      volumeColor += (1.0 - volumeAlpha) * localColor * localAlpha;
      volumeAlpha += (1.0 - volumeAlpha) * localAlpha;
    }

    float3 color = pearl;
    float lowerHaze =
      exp(-dot(uv - float2(0.04, -0.34), uv - float2(0.04, -0.34)) * 2.5) *
      (1.0 - smoothstep(0.38, 1.0, radius));
    color = mix(color, peach, lowerHaze * 0.22);
    color = mix(color, volumeColor / max(volumeAlpha, 0.001), volumeAlpha * 0.94);

    float fresnel = pow(clamp(1.0 - sphereDepth, 0.0, 1.0), 2.4);
    float highlight = exp(-dot(uv - float2(-0.38, -0.48), uv - float2(-0.38, -0.48)) * 10.0);
    float lowerGlass = fresnel * smoothstep(-0.05, 0.95, uv.y);
    float sideFringe = fresnel * smoothstep(0.12, 0.95, uv.x);
    color = mix(color, float3(1.0), highlight * 0.68 + fresnel * 0.22);
    color = mix(color, float3(0.74, 0.88, 0.90), lowerGlass * 0.18);
    color = mix(color, float3(0.98, 0.55, 0.76), sideFringe * 0.16);

    float grain = (hash21(fragCoord + time) - 0.5) * 0.012;
    color += grain;

    float shell = 1.0 - smoothstep(0.972, 1.0, radius);
    float outline = exp(-abs(radius - 0.965) * 125.0);
    color = mix(color, float3(0.70, 0.75, 0.78), outline * 0.38);
    float alpha = shell * (0.91 + fresnel * 0.06);
    return half4(half3(clamp(color, 0.0, 1.0)), half(alpha));
  }
`);

export function AnimatedOrb({ size, mode = "idle", level = 0 }: AnimatedOrbProps) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [breathe] = useState(() => new Animated.Value(0));
  const clock = useClock();
  const isActive = mode === "listening" || mode === "thinking";
  const energy = Math.max(isActive ? 0.24 : 0.08, Math.min(level, 1));

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      breathe.setValue(0);
      return undefined;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: isActive ? 1150 : 2600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: isActive ? 950 : 2400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: Platform.OS !== "web",
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [breathe, isActive, reduceMotion]);

  const uniforms = useDerivedValue(
    () => ({
      uSize: size,
      uTime: reduceMotion ? 0 : clock.value / 1000,
      uEnergy: energy,
      uSaved: mode === "saved" ? 1 : 0,
    }),
    [energy, mode, reduceMotion, size],
  );
  const activeScale = 1 + level * 0.025;

  if (!ORB_EFFECT) {
    return <View style={{ width: size, height: size }} />;
  }

  return (
    <View style={{ width: size, height: size, pointerEvents: "none" }}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            transform: [
              {
                scale: breathe.interpolate({
                  inputRange: [0, 1],
                  outputRange: [activeScale * 0.985, activeScale * 1.015],
                }),
              },
              {
                rotate: breathe.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["-0.8deg", "0.8deg"],
                }),
              },
            ],
          },
        ]}
      >
        <Canvas style={StyleSheet.absoluteFill}>
          <Fill>
            <Shader source={ORB_EFFECT} uniforms={uniforms} />
          </Fill>
        </Canvas>
      </Animated.View>
    </View>
  );
}
