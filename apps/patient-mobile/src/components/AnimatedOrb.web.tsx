import { WithSkiaWeb } from "@shopify/react-native-skia/lib/module/web";
import { View } from "react-native";

export type OrbMode = "idle" | "listening" | "thinking" | "saved";

type AnimatedOrbProps = {
  size: number;
  mode?: OrbMode;
  level?: number;
};

export function AnimatedOrb(props: AnimatedOrbProps) {
  return (
    <WithSkiaWeb
      opts={{ locateFile: () => "/canvaskit.wasm" }}
      getComponent={async () => {
        const { AnimatedOrb: SkiaOrb } = await import("./AnimatedOrbSkia");
        return { default: SkiaOrb };
      }}
      fallback={<View style={{ width: props.size, height: props.size }} />}
      componentProps={props}
    />
  );
}
