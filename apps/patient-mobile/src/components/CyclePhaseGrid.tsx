import React from 'react';
import { StyleSheet, View } from 'react-native';
import { days } from '../data/mock';
import { colors, phaseLabel, phaseStrong } from '../theme';

const ROWS = 4;
const COLS = Math.ceil(days.length / ROWS);

// Chunk the 35 days into 4 full-width rows, left-to-right / top-to-bottom.
const rows = Array.from({ length: ROWS }, (_, row) => days.slice(row * COLS, row * COLS + COLS));

export function CyclePhaseGrid() {
  const today = days[days.length - 1];

  return (
    <View style={styles.wrap}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {Array.from({ length: COLS }, (_, colIndex) => {
            const day = row[colIndex];
            if (!day) return <View key={colIndex} style={styles.cell} />;
            const isToday = day.iso === today.iso;
            return (
              <View
                key={day.iso}
                accessibilityLabel={`${day.iso}, cycle day ${day.cycleDay}, ${phaseLabel[day.phase]}`}
                style={styles.cell}
              >
                <View
                  style={[
                    styles.box,
                    { backgroundColor: phaseStrong[day.phase] },
                    isToday && styles.todayBox,
                  ]}
                />
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'center',
    width: '56%',
    maxWidth: 240,
    paddingVertical: 8,
    gap: 3,
  },
  row: {
    flexDirection: 'row',
    gap: 3,
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
  },
  box: {
    flex: 1,
    borderRadius: 2,
    opacity: 0.72,
  },
  todayBox: {
    borderWidth: 1,
    borderColor: colors.ink,
    opacity: 1,
  },
});
