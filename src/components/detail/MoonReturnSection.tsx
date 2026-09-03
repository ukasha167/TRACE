import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Colors, Spacing, Type, FontFamily, FontSize } from "@/constants/theme";
import { SectionHeader } from "./SectionHeader";
import { getNearestReturns } from "@/lib/astronomy/moonReturn";
import { formatIllumination } from "@/lib/astronomy/moonPhase";
import type { MoonReturn } from "@/types";

interface Props {
  returns: MoonReturn[];
}

/**
 * WHEN THIS SKY COMES BACK. The app's core feature (spec §6.3).
 *
 * The copy explains the mechanism on purpose. "The moon is full on your
 * birthday again" is a coincidence; "19 tropical years and 235 lunar months
 * differ by two hours, so it returns" is a schedule the reader is on. The
 * second is both truer and worth more.
 *
 * Rows are a timetable: the year set large in mono on the left, the reason in
 * words beside it, the figures right-aligned.
 */
/**
 * Phrases a return year against TODAY.
 *
 * MoonReturn.direction is past/future relative to the MILESTONE, not to now.
 * A 2023 return on a 2004 birthday is "future" by that definition while being
 * three years in the past for the reader. Using direction here produced
 * "in -3 years". Always derive this from the current year.
 */
function relativeToNow(year: number, thisYear: number): string {
  const delta = year - thisYear;
  if (delta === 0) return "this year";
  const n = Math.abs(delta);
  const unit = n === 1 ? "year" : "years";
  return delta < 0 ? `${n} ${unit} ago` : `in ${n} ${unit}`;
}

export function MoonReturnSection({ returns }: Props) {
  const thisYear = new Date().getFullYear();
  const { previous, next } = getNearestReturns(returns, thisYear);
  const featured = [previous, next].filter(Boolean) as MoonReturn[];
  const rest = returns.filter((r) => !featured.includes(r));

  return (
    <View style={styles.section}>
      <SectionHeader label="When this sky comes back" />

      <Text style={styles.explainer}>
        19 tropical years and 235 lunar months differ by about two hours, so the
        moon returns to nearly the same phase on the same date. This is a cycle,
        not a coincidence.
      </Text>

      <View style={styles.table}>
        {featured.map((r, i) => (
          <View key={r.year} style={[styles.row, i > 0 && styles.rowRule]}>
            <Text style={styles.year}>{r.year}</Text>
            <View style={styles.info}>
              <Text style={styles.cycle}>{r.cycleLabel}</Text>
              <Text style={styles.when}>{relativeToNow(r.year, thisYear)}</Text>
            </View>
            <View style={styles.figures}>
              <Text style={styles.illum}>
                {formatIllumination(r.phaseFraction)}
              </Text>
              <Text style={styles.offset}>
                ±{r.phaseOffsetDays.toFixed(2)}d
              </Text>
            </View>
          </View>
        ))}
      </View>

      {rest.length > 0 && (
        <View style={styles.restBlock}>
          <Text style={styles.restLabel}>Also returns</Text>
          <Text style={styles.restYears}>
            {rest.map((r) => r.year).join("   ")}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: Spacing.xl },
  explainer: { ...Type.bodyMuted, marginBottom: Spacing.lg },

  table: { borderTopWidth: 1, borderTopColor: Colors.rule },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
    paddingVertical: Spacing.md,
  },
  rowRule: { borderTopWidth: 1, borderTopColor: Colors.rule },
  year: {
    fontFamily: FontFamily.monoMedium,
    fontSize: FontSize.heading,
    color: Colors.signal,
    width: 70,
  },
  info: { flex: 1 },
  cycle: {
    fontFamily: FontFamily.serifMedium,
    fontSize: FontSize.lead,
    color: Colors.ink,
  },
  when: { ...Type.small, marginTop: 2 },
  figures: { alignItems: "flex-end" },
  illum: {
    fontFamily: FontFamily.monoMedium,
    fontSize: FontSize.small,
    color: Colors.ink,
  },
  offset: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.label,
    color: Colors.inkMuted,
    marginTop: 2,
  },

  restBlock: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.rule,
  },
  restLabel: { ...Type.label },
  restYears: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.body,
    color: Colors.ink,
    marginTop: Spacing.xs,
    lineHeight: 24,
  },
});
