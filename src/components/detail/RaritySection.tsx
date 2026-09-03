import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Colors, Spacing, Type, FontFamily, FontSize } from "@/constants/theme";
import { SectionHeader } from "./SectionHeader";
import type { RarityStat } from "@/types";

interface Props {
  n: number;
  rarity: RarityStat;
  unitLabel: string; // "birthdays" | "anniversaries"
}

/**
 * Measured, never asserted (spec §6.4).
 *
 * The section renders only when the moon genuinely clears a threshold —
 * manufacturing significance for an ordinary 43% moon is exactly the overclaim
 * this app is not allowed to make. The big number is the global frequency; the
 * personal count underneath is what actually lands.
 */
export function RaritySection({ n, rarity, unitLabel }: Props) {
  return (
    <View style={styles.section}>
      <SectionHeader n={n} label="How uncommon" />

      <Text style={styles.bigNumber}>1 IN {rarity.oneInN.toFixed(0)}</Text>
      <Text style={styles.bigCaption}>
        days carry a moon at least {rarity.thresholdPct}% illuminated
      </Text>

      <View style={styles.personal}>
        <Text style={styles.personalLead}>
          <Text style={styles.personalCount}>{rarity.matchingYears.length}</Text>
          <Text style={styles.personalOf}> of your </Text>
          <Text style={styles.personalCount}>{rarity.totalYears}</Text>
          <Text style={styles.personalOf}> {unitLabel} have had one</Text>
        </Text>
        {rarity.matchingDetails && rarity.matchingDetails.length > 0 ? (
          <View style={styles.matchGrid}>
            {rarity.matchingDetails.map((item) => (
              <View key={item.year} style={styles.matchRow}>
                <Text style={styles.matchYear}>{item.year}</Text>
                <Text style={styles.matchIllum}>{item.illuminationPct.toFixed(1)}%</Text>
              </View>
            ))}
          </View>
        ) : rarity.matchingYears.length > 0 ? (
          <Text style={styles.years}>{rarity.matchingYears.join("   ")}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: Spacing.xl },
  bigNumber: {
    fontFamily: FontFamily.black,
    fontSize: FontSize.display,
    letterSpacing: -2,
    lineHeight: 52,
    color: Colors.ink,
  },
  bigCaption: { ...Type.bodyMuted, marginTop: Spacing.xs },
  personal: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.rule,
  },
  personalLead: { ...Type.body },
  personalCount: {
    fontFamily: FontFamily.monoMedium,
    fontSize: FontSize.body,
    color: Colors.signal,
  },
  personalOf: { fontFamily: FontFamily.regular, color: Colors.ink },
  matchGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  matchRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.rule,
  },
  matchYear: {
    fontFamily: FontFamily.monoMedium,
    fontSize: FontSize.body,
    color: Colors.ink,
  },
  matchIllum: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.small,
    color: Colors.signal,
  },
  years: {
    fontFamily: FontFamily.monoMedium,
    fontSize: FontSize.lead,
    color: Colors.ink,
    marginTop: Spacing.sm,
  },
});

