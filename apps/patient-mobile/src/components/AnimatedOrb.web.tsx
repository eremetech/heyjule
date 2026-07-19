import { Orb } from "orb-ui";

export type OrbMode = "idle" | "listening" | "thinking" | "saved";

type AnimatedOrbProps = {
  size: number;
  mode?: OrbMode;
  level?: number;
};

// The cloud theme collapses to a dot in "idle", so idle maps to a calm
// zero-volume "listening" to keep the hero orb visible; "saved" maps to
// "speaking" for a gentle confirmation swell.
const MODE_TO_STATE = {
  idle: "listening",
  listening: "listening",
  thinking: "thinking",
  saved: "speaking",
} as const;

// orb-ui's cloud theme is hardcoded blue-violet (#626afb, hue ~236deg); rotate
// to brand coral #E95031 (hue ~10deg) since the theme exposes no color API.
const RECOLOR_FILTER = "hue-rotate(134deg) saturate(1.05)";

const NOOP = () => {};

export function AnimatedOrb({ size, mode = "idle", level = 0 }: AnimatedOrbProps) {
  return (
    <div
      style={{
        width: size,
        height: size,
        filter: RECOLOR_FILTER,
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Orb
        theme="cloud"
        state={MODE_TO_STATE[mode]}
        volume={level}
        size={size}
        // A start handler is required for the idle orb to render in color
        // (non-interactive idle renders gray); the pointerEvents:none wrapper
        // prevents any actual click behavior.
        interactive={true}
        onStart={NOOP}
      />
    </div>
  );
}
