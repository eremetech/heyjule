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

// SkSL translation of the supplied Three.js gyroid ray-marcher. Keeping
// the effect in Skia means the same GPU shader runs on iOS, Android, and web.
const FRACTAL_EFFECT = Skia.RuntimeEffect.Make(`
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

  float hash31(float3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float smoothMin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.12 - h);
  }

  float gyroidMap(float3 p, float time) {
    float d = 100.2;
    float scale = 0.4;
    p += float3(12.6, 4.4, 5.569);

    for (int layer = 0; layer < 3; layer++) {
      p.xy = rotate2(p.xy, time * 0.0262 + 0.2);
      p.yz = rotate2(p.yz, time * 0.0393 - 0.1);
      float field = dot(sin(p), cos(p.zxy));
      float gyroid = sqrt(field * field + 0.055) - 0.137;
      d = smoothMin(d, gyroid / abs(scale), 0.15);
      p = p * 0.7602 + float3(-1.7, 1.2, 3.5);
      scale *= 2.196;
    }
    return d;
  }

  float3 palette(float phase) {
    float blend = sin(phase * 1.4) * 0.5 + 0.5;
    // Theme colors converted from sRGB to linear light before tone mapping.
    float3 coral = float3(0.814, 0.216, 0.191);
    float3 peach = float3(0.896, 0.485, 0.205);
    float3 sage = float3(0.402, 0.468, 0.253);
    return mix(mix(coral, peach, blend), sage, uSaved * 0.72);
  }

  half4 main(float2 fragCoord) {
    float2 uv = (fragCoord - float2(uSize * 0.5)) / (uSize * 0.5);
    uv.y = -uv.y;
    float radius2 = dot(uv, uv);
    if (radius2 > 1.0) {
      return half4(0.0);
    }

    float zExtent = sqrt(max(0.0, 1.0 - radius2));
    float time = uTime;
    float spin = time * -0.65;
    float3 glow = mix(float3(0.065, 0.005, 0.007), float3(0.018, 0.032, 0.009), uSaved);
    float jitter = hash21(fragCoord) * 0.08;

    // March through the glass sphere and accumulate its nested gyroid field.
    for (int marchIndex = 0; marchIndex < 18; marchIndex++) {
      float progress = (float(marchIndex) + jitter) / 17.0;
      float z = mix(zExtent, -zExtent, progress);
      float3 p = float3(uv.x, uv.y, z) * 2.655;
      p.xz = rotate2(p.xz, spin);

      float distanceToField = gyroidMap(p, time);
      float edge = smoothstep(1.0, 0.76, length(float3(uv, z)));
      float filament = exp(-abs(distanceToField - 0.10) * 21.0);
      float depthWeight = 0.35 + sin(progress * 3.14159) * 0.65;
      float intensity = filament * edge * depthWeight * (0.14 + uEnergy * 0.13);

      float phase = length(p) * -0.4 + time * 0.1;
      float aberration = 0.0698;
      float3 color = float3(
        palette(phase + aberration).r,
        palette(phase).g,
        palette(phase - aberration).b
      );
      glow += color * intensity;

      float3 particleCell = floor(p * 20.0 + float3(time * 0.7, -time, time * 0.24));
      float particle = step(0.986 - uEnergy * 0.006, hash31(particleCell));
      glow += float3(1.0, 0.86, 0.72) * particle * edge * (0.008 + uEnergy * 0.018);
    }

    // A crisp front layer keeps the organic structure legible on a small phone display.
    float3 surfacePoint = float3(uv.x, uv.y, zExtent) * 2.655;
    surfacePoint.xz = rotate2(surfacePoint.xz, spin);
    float surfaceField = gyroidMap(surfacePoint, time);
    float surfaceFilament = exp(-abs(surfaceField - 0.10) * 32.0);
    glow += palette(length(surfacePoint) * -0.4 + time * 0.1) * surfaceFilament * (0.58 + uEnergy * 0.24);

    float rim = pow(clamp(1.0 - zExtent, 0.0, 1.0), 4.0);
    float softLight = pow(max(zExtent - uv.y * 0.24, 0.0), 3.0);
    glow += palette(time * 0.04) * softLight * 0.035;
    glow += mix(float3(0.89, 0.18, 0.15), float3(0.32, 0.42, 0.18), uSaved) * rim * 0.48;
    glow = glow / (1.05 + glow);
    glow = pow(max(glow, float3(0.0)), float3(0.4545));

    float alpha = smoothstep(1.0, 0.955, sqrt(radius2));
    return half4(half3(glow), half(alpha));
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

  if (!FRACTAL_EFFECT) {
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
            <Shader source={FRACTAL_EFFECT} uniforms={uniforms} />
          </Fill>
        </Canvas>
      </Animated.View>
    </View>
  );
}
