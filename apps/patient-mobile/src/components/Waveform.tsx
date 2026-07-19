import { StyleSheet, View } from "react-native";

import { colors } from "../theme";

type WaveformProps = {
  level: number;
  active?: boolean;
};

const BAR_COUNT = 39;

export function Waveform({ level, active = false }: WaveformProps) {
  return (
    <View style={styles.row} accessibilityElementsHidden>
      {Array.from({ length: BAR_COUNT }, (_, index) => {
        const center = 1 - Math.abs(index - (BAR_COUNT - 1) / 2) / (BAR_COUNT / 2);
        const texture = (Math.sin(index * 2.17) + Math.cos(index * 0.83) + 2) / 4;
        const reactive = active ? level * (0.4 + texture * 0.9) : 0;
        const height = 2 + center * 5 + texture * 7 + reactive * 16;
        return <View key={index} style={[styles.bar, { height }]} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    height: 30,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2.6,
  },
  bar: {
    width: 1.35,
    minHeight: 2,
    borderRadius: 2,
    backgroundColor: colors.amber,
    opacity: 0.58,
  },
});
