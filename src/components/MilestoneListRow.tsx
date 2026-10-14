import React, { useMemo } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { router, type Href } from "expo-router";
import {
  Colors,
  Spacing,
  Type,
  FontFamily,
  FontSize,
  Radius,
  formatShortDate,
} from "@/constants/theme";
import { MoonPhaseGlyph } from "./MoonPhaseGlyph";
import { getMoonPhase, formatIllumination, describePhase } from "@/lib/astronomy/moonPhase";
import {
  getBrightLimbAngle,
  getLunarNorthRotation,
} from "@/lib/astronomy/brightLimb";
import { toLocalNight, toLocalDayStart } from "@/lib/astronomy/dateUtils";
import type { Milestone } from "@/types";

const route = (path: string) => path as Href;

const TYPE_LABELS: Record<Milestone["type"], string> = {
  birthday: "Birthday",
  anniversary: "Anniversary",
  graduation: "Graduation",
  custom: "A day to remember",
};

interface Props {
  milestone: Milestone;
  isLast: boolean;
  /** "In 41 days", from nextAnniversary. The list is sorted by it. */
  countdown?: string;
}

/**
 * A single record in the ledger.
 *
 * The name is set in the serif and is the only thing given any size. It is a
 * person, and everything else on the row is a fact about their sky. The moon
 * sits in a disc rather than a square, so the thumbnail echoes the object
 * inside it instead of boxing it.
 *
 * The row used to open with a zero-padded index (001, 002). That number encoded
 * nothing: the list is not a sequence and the position is not a fact about the
 * record. It is gone.
 *
 * No text is truncated. The row grows to fit its title and notes.
 */
export function MilestoneListRow({ milestone, isLast, countdown }: Props) {
  const tz = milestone.location?.timezoneOffsetMin;

  const { phase, tilt, north } = useMemo(() => {
    const night = toLocalNight(milestone.date, tz);
    const place =
      milestone.location && milestone.location.latitude !== 0
        ? milestone.location
        : null;
    return {
      phase: getMoonPhase(night, toLocalDayStart(milestone.date, tz)),
      tilt: place ? getBrightLimbAngle(night, place) : null,
      north: place ? getLunarNorthRotation(night, place) : null,
    };
  }, [milestone, tz]);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        !isLast && styles.rowRule,
        pressed && styles.rowPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${milestone.title}, ${describePhase(phase)}${countdown ? `, ${countdown.toLowerCase()}` : ""}`}
      onPress={() => router.push(route(`/milestone/${milestone.id}`))}
    >
      <View style={styles.content}>
        <Text style={styles.type}>{TYPE_LABELS[milestone.type]}</Text>
        <Text style={styles.title}>{milestone.title}</Text>
        <View style={styles.factRow}>
          <Text style={styles.date}>{formatShortDate(milestone.date)}</Text>
          <Text style={styles.phase}>
            {describePhase(phase)}, {formatIllumination(phase.phaseFraction)}
          </Text>
        </View>
        {milestone.notes ? (
          <Text style={styles.notes}>{milestone.notes}</Text>
        ) : null}
        {countdown ? (
          <View style={styles.pillRow}>
            <Text style={styles.pill}>{countdown}</Text>
          </View>
        ) : null}
      </View>

      <MoonPhaseGlyph
        phaseFraction={phase.phaseFraction}
        waxing={phase.waxing}
        size={36}
        brightLimbAngleDeg={tilt}
        northAngleDeg={north}
        platePadding={7}
        round
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.lg,
  },
  rowRule: { borderBottomWidth: 1, borderBottomColor: Colors.rule },
  rowPressed: { opacity: 0.55 },

  content: { flex: 1 },
  type: { ...Type.label, marginBottom: Spacing.xs },
  title: { ...Type.heading },
  factRow: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  date: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.small,
    color: Colors.signal,
  },
  phase: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.small,
    color: Colors.inkMuted,
  },
  notes: { ...Type.small, marginTop: Spacing.sm },
  pillRow: { flexDirection: "row", marginTop: Spacing.sm },
  pill: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.label,
    color: Colors.signal,
    backgroundColor: Colors.paperDim,
    borderRadius: Radius.pill,
    overflow: "hidden",
    paddingHorizontal: Spacing.sm + 1,
    paddingVertical: 3,
  },
});
