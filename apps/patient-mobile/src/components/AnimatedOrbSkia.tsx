import { Canvas, Fill, Shader, Skia, useClock } from "@shopify/react-native-skia";
import { useEffect, useState } from "react";
import { AccessibilityInfo, StyleSheet, View } from "react-native";
import { useDerivedValue } from "react-native-reanimated";

export type OrbMode = "idle" | "listening" | "thinking" | "saved";

type AnimatedOrbProps = {
  size: number;
  mode?: OrbMode;
  level?: number;
};

// Native Skia port of orb-ui's Cloud theme. The web implementation uses the
// package directly; keeping the shader here makes iOS and Android render the
// same smooth cloud orb instead of the old particle sphere.
const CLOUD_EFFECT = Skia.RuntimeEffect.Make(`
  uniform float uSize;
  uniform float uTime;
  uniform float uActivity;

  float hash21(float2 p) {
    p = fract(p * float2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise21(float2 p) {
    float2 i = floor(p);
    float2 f = fract(p);
    float2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash21(i), hash21(i + float2(1.0, 0.0)), u.x),
      mix(hash21(i + float2(0.0, 1.0)), hash21(i + float2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(float2 p) {
    float value = 0.0;
    float amplitude = 0.52;
    for (int octave = 0; octave < 5; octave++) {
      value += amplitude * noise21(p);
      p = float2(
        0.80 * p.x + 0.60 * p.y,
        -0.60 * p.x + 0.80 * p.y
      ) * 1.92 + float2(9.7, 4.3);
      amplitude *= 0.5;
    }
    return value;
  }

  float3 hueRotate(float3 color) {
    float angle = 2.3387412;
    float c = cos(angle);
    float s = sin(angle);
    return float3(
      dot(color, float3(0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928)),
      dot(color, float3(0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283)),
      dot(color, float3(0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072))
    );
  }

  float3 saturateColor(float3 color) {
    float amount = 1.05;
    return float3(
      dot(color, float3(0.213 + 0.787 * amount, 0.715 - 0.715 * amount, 0.072 - 0.072 * amount)),
      dot(color, float3(0.213 - 0.213 * amount, 0.715 + 0.285 * amount, 0.072 - 0.072 * amount)),
      dot(color, float3(0.213 - 0.213 * amount, 0.715 - 0.715 * amount, 0.072 + 0.928 * amount))
    );
  }

  half4 main(float2 fragCoord) {
    float2 uv = fragCoord / uSize;
    float2 centered = uv - 0.5;
    float radius = length(centered);
    float edge = 1.0 - smoothstep(0.488, 0.5, radius);
    if (edge <= 0.0) return half4(0.0);

    float2 p = centered * 2.0;
    float t = uTime;
    float2 warp = float2(
      fbm(p * 1.02 + float2(t * 0.34, -t * 0.24)),
      fbm(p * 1.08 + float2(-t * 0.27, t * 0.32) + float2(6.7, 2.9))
    );
    float2 curl = float2(
      sin(p.y * 2.4 + t * 0.68 + warp.y * 3.2),
      cos(p.x * 2.1 - t * 0.61 + warp.x * 3.0)
    );
    float2 warped =
      p +
      (warp - 0.5) * (1.18 + uActivity * 0.38) +
      curl * (0.035 + uActivity * 0.07);
    float broad = fbm(warped * 0.92 + float2(t * 0.14, -t * 0.18));
    float folded = fbm(warped * 1.66 + float2(-t * 0.23, t * 0.19) + 5.2);
    float field = mix(broad, folded, 0.3 + uActivity * 0.14);

    float horizon =
      0.46 +
      0.08 * sin((uv.x + warp.x * 0.2) * 5.4 + t * 0.42) +
      0.16 * (broad - 0.5);
    float upper = smoothstep(horizon - 0.12, horizon + 0.08, uv.y);
    float band = exp(-pow((uv.y - horizon) * (5.2 + uActivity * 0.8), 2.0));
    float cloud = smoothstep(0.24, 0.79, field);

    float3 deepPeriwinkle = float3(0.36, 0.39, 0.985);
    float3 upperPeriwinkle = float3(0.48, 0.56, 0.985);
    float3 lowerLavender = float3(0.72, 0.78, 0.975);
    float3 milk = float3(0.89, 0.92, 0.995);

    float3 color = mix(lowerLavender, upperPeriwinkle, upper);
    float upperDepth = upper * (0.14 + smoothstep(0.42, 0.78, folded) * 0.5);
    color = mix(color, deepPeriwinkle, upperDepth);
    float milkAmount = clamp(band * (0.42 + cloud * 0.62), 0.0, 0.88);
    color = mix(color, milk, milkAmount);
    float lowerMist = (1.0 - upper) * smoothstep(0.58, 0.9, broad) * 0.18;
    color = mix(color, milk, lowerMist);
    color += (noise21(fragCoord * 0.64) - 0.5) / 255.0;
    color = saturateColor(hueRotate(color));

    return half4(half3(clamp(color, 0.0, 1.0)), half(edge));
  }
`);

export function AnimatedOrb({ size, mode = "idle", level = 0 }: AnimatedOrbProps) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const clock = useClock();
  const normalizedLevel = Math.max(0, Math.min(level, 1));
  const orbSize = size * 0.55;

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => subscription.remove();
  }, []);

  const activity =
    mode === "listening"
      ? 0.28 + normalizedLevel * 0.32
      : mode === "saved"
        ? 0.66 + normalizedLevel * 0.34
        : mode === "idle"
          ? 0.28
          : 0.1;
  const speed =
    mode === "listening"
      ? 0.72 + normalizedLevel * 0.78
      : mode === "saved"
        ? 1.65 + normalizedLevel * 1.55
        : mode === "idle"
          ? 0.72
          : 0.24;
  const scale = mode === "listening" ? 1 - normalizedLevel * 0.204 : mode === "saved" ? 1 + normalizedLevel * 0.2145 : 1;

  const uniforms = useDerivedValue(
    () => ({
      uSize: orbSize,
      uTime: reduceMotion ? 0 : (clock.value / 1000) * speed,
      uActivity: activity,
    }),
    [activity, orbSize, reduceMotion, speed],
  );

  if (!CLOUD_EFFECT) return <View style={{ width: size, height: size }} />;

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
      <View style={{ width: orbSize, height: orbSize, transform: [{ scale }] }}>
        <Canvas style={StyleSheet.absoluteFill}>
          <Fill>
            <Shader source={CLOUD_EFFECT} uniforms={uniforms} />
          </Fill>
        </Canvas>
      </View>
    </View>
  );
}
