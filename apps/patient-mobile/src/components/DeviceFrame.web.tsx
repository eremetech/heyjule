import type { CSSProperties, PropsWithChildren } from "react";
import { useWindowDimensions } from "react-native";
import { SafeAreaProvider, type Metrics } from "react-native-safe-area-context";

const SCREEN_WIDTH = 390;
const SCREEN_HEIGHT = 844;
/** Space the bezel, page padding, and bottom caption need around the phone. */
const CHROME = { horizontal: 120, vertical: 170 };

/* iPhone status-bar / home-indicator heights, so screens lay out exactly as
 * they do on the phone (every screen positions itself with safe-area insets). */
const FRAMED_METRICS: Metrics = {
  insets: { top: 59, bottom: 34, left: 0, right: 0 },
  frame: { x: 0, y: 0, width: SCREEN_WIDTH, height: SCREEN_HEIGHT },
};

/**
 * Desktop web wraps the app in an iPhone-style bezel like a simulator; on
 * small (real phone) viewports the app stays full-bleed with zero insets —
 * the browser chrome already owns those regions.
 */
export function DeviceFrame({ children }: PropsWithChildren) {
  const { width, height } = useWindowDimensions();
  const framed =
    width >= SCREEN_WIDTH + CHROME.horizontal && height >= 560;

  if (!framed) {
    return <SafeAreaProvider>{children}</SafeAreaProvider>;
  }

  const scale = Math.min(1, (height - CHROME.vertical) / SCREEN_HEIGHT);

  return (
    <div style={pageStyle}>
      <div style={{ ...bodyStyle, transform: `scale(${scale})` }}>
        <div style={buttonStyle(-9, 178, 32)} />
        <div style={buttonStyle(-9, 234, 62)} />
        <div style={buttonStyle(-9, 310, 62)} />
        <div style={{ ...buttonStyle(0, 218, 100), left: undefined, right: -9 }} />
        <div style={screenStyle}>
          <SafeAreaProvider initialMetrics={FRAMED_METRICS}>{children}</SafeAreaProvider>
          <div style={islandStyle} />
          <div style={homeIndicatorStyle} />
        </div>
      </div>
      <p style={captionStyle}>
        This is a web preview of the HeyJule React&nbsp;Native app. Voice check-ins and other
        native features need the real app —{" "}
        <a
          href="https://github.com/eremetech/heyjule"
          target="_blank"
          rel="noreferrer"
          style={captionLinkStyle}
        >
          download it from GitHub
        </a>{" "}
        to try everything.
      </p>
    </div>
  );
}

const pageStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "radial-gradient(120% 120% at 50% 0%, #F5F0EB 0%, #EAE2DA 55%, #DFD4C9 100%)",
  overflow: "hidden",
};

const captionStyle: CSSProperties = {
  position: "absolute",
  bottom: 16,
  left: "50%",
  transform: "translateX(-50%)",
  maxWidth: 640,
  width: "90%",
  textAlign: "center",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  fontSize: 13,
  lineHeight: 1.5,
  color: "#76716C",
  margin: 0,
};

const captionLinkStyle: CSSProperties = {
  color: "#E95031",
  fontWeight: 600,
  textDecoration: "underline",
};

const bodyStyle: CSSProperties = {
  position: "relative",
  width: SCREEN_WIDTH,
  height: SCREEN_HEIGHT,
  borderRadius: 62,
  background: "#1c1c1e",
  border: "5px solid #3a3a3c",
  boxShadow:
    "0 40px 90px rgba(30, 20, 12, 0.35), 0 12px 28px rgba(30, 20, 12, 0.22), inset 0 0 4px rgba(255,255,255,0.18)",
  padding: 12,
  boxSizing: "content-box",
};

const screenStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100%",
  borderRadius: 46,
  overflow: "hidden",
  background: "#FBF8F5",
  display: "flex",
};

const islandStyle: CSSProperties = {
  position: "absolute",
  top: 12,
  left: "50%",
  transform: "translateX(-50%)",
  width: 122,
  height: 36,
  borderRadius: 20,
  background: "#000",
  pointerEvents: "none",
};

const homeIndicatorStyle: CSSProperties = {
  position: "absolute",
  bottom: 9,
  left: "50%",
  transform: "translateX(-50%)",
  width: 140,
  height: 5,
  borderRadius: 3,
  background: "rgba(28, 25, 23, 0.28)",
  pointerEvents: "none",
};

function buttonStyle(left: number, top: number, height: number): CSSProperties {
  return {
    position: "absolute",
    left,
    top,
    width: 4,
    height,
    borderRadius: 3,
    background: "#3a3a3c",
  };
}
