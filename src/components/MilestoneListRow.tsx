import React, { useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { router, type Href } from "expo-router";
import { Colors, Spacing, Type, FontFamily, FontSize, sectionNumber } from "@/constants/theme";
import { MoonPhaseGlyph } from "./MoonPhaseGlyph";
import { getMoonPhase, formatIllumination, describePhase } from "@/lib/astronomy/moonPhase";
import { getBrightLimbAngle } from "@/lib/astronomy/brightLimb";
import { toLocalNight, toLocalDayStart } from "@/lib/astronomy/dateUtils";
import type { Milestone } from "@/types";

const route = (path: string) => path as Href;

const TYPE_LABELS: Record<Milestone["type"], string> = {
  birthday: "BIRTHDAY",
  anniversary: "ANNIVERSARY",
  graduation: "GRADUATION",
  custom: "RECORD",
};

interface Props {
  milestone: Milestone;
  index: number;
  isLast: boolean;
}

/**
 * A single row of the record ledger.
 *
 * Layout is a Swiss three-column split: index number, content block, moon plate.
 * The glyph is informative as well as decorative — it is that date's real phase
 * at its real tilt.
 *
 * No text is truncated. The row grows to fit its title and notes.
 */
export function MilestoneListRow({ milestone, index, isLast }: Props) {
  const tz = milestone.location?.timezoneOffsetMin;

  const { phase, tilt } = useMemo(() => {
    const night = toLocalNight(milestone.date, tz);
    return {
      phase: getMoonPhase(night, toLocalDayStart(milestone.date, tz)),
      tilt:
        milestone.location && milestone.location.latitude !== 0
          ? getBrightLimbAngle(night, milestone.location)
          : null,
    };
  }, [milestone, tz]);

  const [year, month, day] = milestone.date.split("-");

  return (
    <TouchableOpacity
      style={[styles.row, !isLast && styles.rowRule]}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityLabel={`${milestone.title}, ${describePhase(phase)}`}
      onPress={() => router.push(route(`/milestone/${milestone.id}`))}
    >
      <Text style={styles.index}>{sectionNumber(index + 1)}</Text>

      <View style={styles.content}>
        <Text style={styles.type}>{TYPE_LABELS[milestone.type]}</Text>
        <Text style={styles.title}>{milestone.title}</Text>
        <Text style={styles.date}>
          {day}.{month}.{year}
        </Text>
        <Text style={styles.phase}>
          {describePhase(phase)}
          <Text style={styles.phaseData}>
            {"   "}
            {formatIllumination(phase.phaseFraction)}
          </Text>
        </Text>
        {milestone.notes ? (
          <Text style={styles.notes}>{milestone.notes}</Text>
        ) : null}
      </View>

      <MoonPhaseGlyph
        phaseFraction={phase.phaseFraction}
        phaseIndex={phase.phaseIndex}
        size={34}
        brightLimbAngleDeg={tilt}
        platePadding={8}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
    paddingVertical: Spacing.lg,
  },
  rowRule: { borderBottomWidth: 1, borderBottomColor: Colors.rule },
  index: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.label,
    color: Colors.inkMuted,
    width: 30,
    marginTop: 3,
  },
  content: { flex: 1 },
  type: { ...Type.label, marginBottom: Spacing.xs },
  title: { ...Type.heading },
  date: {
    fontFamily: FontFamily.monoMedium,
    fontSize: FontSize.small,
    color: Colors.signal,
    marginTop: 2,
  },
  phase: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.small,
    color: Colors.inkMuted,
    marginTop: Spacing.sm,
  },
  phaseData: { fontFamily: FontFamily.monoMedium, color: Colors.ink },
  notes: { ...Type.small, marginTop: Spacing.sm },
});
