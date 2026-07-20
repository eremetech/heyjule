import type { PropsWithChildren } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

/**
 * On native the device is the frame — this just hosts the safe-area context.
 * DeviceFrame.web.tsx draws an iPhone-style bezel around the app on desktop.
 */
export function DeviceFrame({ children }: PropsWithChildren) {
  return <SafeAreaProvider>{children}</SafeAreaProvider>;
}
