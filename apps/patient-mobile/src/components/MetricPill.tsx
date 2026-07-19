import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";

import { colors, shadows } from "../theme";
import { SoftPressable } from "./SoftPressable";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

type MetricPillProps = {
  icon: IoniconName;
  label: string;
  color: string;
  value?: string;
  onPress: () => void;
};

export function MetricPill({ icon, label, color, value, onPress }: MetricPillProps) {
  return (
    <SoftPressable
      onPress={onPress}
      style={styles.card}
      accessibilityRole="button"
      accessibilityLabel={`${label}${value ? `, ${value}` : ""}`}
    >
      <Ionicons name={icon} size={18} color={color} />
      <View style={styles.copy}>
        <Text style={styles.label}>{label}</Text>
        {value ? <Text style={styles.value}>{value}</Text> : null}
      </View>
    </SoftPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 58,
    minWidth: 94,
    paddingHorizontal: 14,
    borderRadius: 19,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: "rgba(255,255,255,0.54)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    ...shadows.quiet,
  },
  copy: {
    gap: 1,
  },
  label: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "500",
  },
  value: {
    color: colors.inkFaint,
    fontSize: 10,
    fontWeight: "500",
  },
});
