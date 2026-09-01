import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Pressable } from "react-native";
import { Colors, FontFamily, FontSize, Spacing } from "@/constants/theme";
import { Planet, PLANET_DISPLAY, ORBITAL_PERIODS_DAYS } from "@/lib/astronomy/planetaryAge";

interface PlanetAgeRowProps {
  planet: Planet;
  ageYears: number;
}

/**
 * Renders a single planet's age row on the Age Converter screen.
 *
 * Layout:
 *   [Symbol] [Planet name]          [age.decimal yrs]
 *            [orbital period]       [progress bar    ]
 */
export function PlanetAgeRow({ planet, ageYears }: PlanetAgeRowProps) {
  const display = PLANET_DISPLAY[planet];
  const period = ORBITAL_PERIODS_DAYS[planet];

  // Fraction through the current year on this planet (0.0–1.0)
  const yearProgress = ageYears % 1;
  const wholeYears = Math.floor(ageYears);
  const decimalYears = ageYears.toFixed(2);

  return (
    <View style={styles.container}>
      {/* Left: symbol + labels */}
      <View style={styles.left}>
        <View style={[styles.symbolBadge, { borderColor: display.color }]}>
          <Text style={[styles.symbol, { color: display.color }]}>
            {display.emoji}
          </Text>
        </View>
        <View style={styles.labelGroup}>
          <Text style={styles.planetName}>{display.label}</Text>
          <Text style={styles.periodLabel}>
            {period.toLocaleString()} Earth days / year
          </Text>
        </View>
      </View>

      {/* Right: age value + progress */}
      <View style={styles.right}>
        <Text style={styles.ageValue}>{decimalYears}</Text>
        <Text style={styles.ageUnit}>yrs</Text>
      </View>

      {/* Progress bar across the bottom — fraction through current year */}
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${Math.min(yearProgress * 100, 100)}%` as any,
              backgroundColor: display.color,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.rule,
    borderRadius: 12,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm + 6, // extra room for progress bar
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.inkMuted + "44",
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: Spacing.sm,
  },
  symbolBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  symbol: {
    fontSize: 18,
    lineHeight: 22,
  },
  labelGroup: {
    flex: 1,
  },
  planetName: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSize.body,
    color: Colors.ink,
    letterSpacing: 0.2,
  },
  periodLabel: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.label,
    color: Colors.inkMuted,
    marginTop: 2,
  },
  right: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  ageValue: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.heading,
    color: Colors.ink,
    letterSpacing: -0.5,
  },
  ageUnit: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.small,
    color: Colors.inkMuted,
  },
  progressTrack: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: Colors.inkMuted + "22",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
    opacity: 0.7,
  },
});
