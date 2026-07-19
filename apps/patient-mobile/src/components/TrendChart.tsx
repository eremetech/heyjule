import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Defs, Line, LinearGradient, Path, Stop } from "react-native-svg";

import { colors } from "../theme";

type TrendChartProps = {
  values: number[];
  labels: string[];
};

function buildLine(values: number[], width: number, height: number) {
  if (values.length === 0) return "";
  return values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
      const y = height - (Math.max(0, Math.min(5, value)) / 5) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

export function TrendChart({ values, labels }: TrendChartProps) {
  const width = 310;
  const height = 116;
  const line = useMemo(() => buildLine(values, width, height), [values]);
  const area = line ? `${line} L ${width} ${height} L 0 ${height} Z` : "";

  return (
    <View>
      <Svg width="100%" height={height + 10} viewBox={`0 0 ${width} ${height + 10}`}>
        <Defs>
          <LinearGradient id="chartFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={colors.coral} stopOpacity="0.2" />
            <Stop offset="100%" stopColor={colors.coral} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        {[0.25, 0.5, 0.75, 1].map((fraction) => (
          <Line
            key={fraction}
            x1={0}
            y1={height * fraction}
            x2={width}
            y2={height * fraction}
            stroke={colors.line}
            strokeWidth={0.7}
            strokeDasharray="2 5"
          />
        ))}
        {area ? <Path d={area} fill="url(#chartFade)" /> : null}
        {line ? <Path d={line} fill="none" stroke={colors.coral} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /> : null}
      </Svg>
      <View style={styles.labels}>
        {labels.map((label) => (
          <Text key={label} style={styles.label}>
            {label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  labels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 3,
  },
  label: {
    color: colors.inkFaint,
    fontSize: 10,
    fontWeight: "500",
  },
});
