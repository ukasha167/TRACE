import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { router, type Href } from "expo-router";
import {
  Colors,
  Spacing,
  Type,
  FontFamily,
  FontSize,
  Tracking,
} from "@/constants/theme";
import { MoonPhaseGlyph } from "../MoonPhaseGlyph";
import { SectionHeader } from "./SectionHeader";
import {
  formatIllumination,
  describePhase,
  describeSyzygyNote,
} from "@/lib/astronomy/moonPhase";
import type { MoonSnapshot, MilestoneLocation } from "@/types";

const route = (path: string) => path as Href;

type PhaseData = Pick<
  MoonSnapshot,
  "phaseFraction" | "phaseName" | "phaseIndex" | "isTruePhase" | "waxing"
>;

interface Props {
  n: number;
  milestoneId: string;
  phase: PhaseData;
  brightLimbAngleDeg: number | null;
  location: MilestoneLocation | null;
}

/**
 * The moon as it actually looked — the hero until the sky render lands.
 *
 * The glyph sits on a full-width dark plate, the way a figure is tipped into a
 * printed page. Data sits below it on paper, as a caption would.
 *
 * Labels go through describePhase(), never phaseName: the raw 8-way bucket
 * calls anything within 1.85 days of full a "Full Moon" (spec §6.2).
 */
export function MoonSection({
  n,
  milestoneId,
  phase,
  brightLimbAngleDeg,
  location,
}: Props) {
  const note = describeSyzygyNote(phase);

  return (
    <View style={styles.section}>
      <SectionHeader n={n} label="The moon that night" />

      <View style={styles.plate}>
        <MoonPhaseGlyph
          phaseFraction={phase.phaseFraction}
          phaseIndex={phase.phaseIndex}
          size={132}
          brightLimbAngleDeg={brightLimbAngleDeg}
          variant="bare"
        />
      </View>

      <View style={styles.caption}>
        <Text style={styles.phaseName}>{describePhase(phase)}</Text>
        <Text style={styles.illumination}>
          {formatIllumination(phase.phaseFraction)}
          <Text style={styles.illuminationUnit}> illuminated</Text>
        </Text>
      </View>

      {note && <Text style={styles.note}>{note}</Text>}

      <View style={styles.metaRow}>
        <Text style={styles.metaKey}>OBSERVED FROM</Text>
        <Text style={styles.metaValue}>
          {location ? location.label : "Not recorded"}
        </Text>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.metaKey}>LIMB TILT</Text>
        <Text style={styles.metaValue}>
          {brightLimbAngleDeg != null
            ? `${brightLimbAngleDeg.toFixed(1)}°`
            : location
            ? "No coordinates on this record"
            : "Add a location to compute this"}
        </Text>
      </View>

      <TouchableOpacity
        style={styles.immersiveLink}
        onPress={() => router.push(route(`/sky/${milestoneId}`))}
        accessibilityRole="button"
        accessibilityLabel="Open the full sky view"
      >
        <Text style={styles.immersiveText}>STAND UNDER THIS SKY</Text>
        <Text style={styles.immersiveArrow}>&#8594;</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: Spacing.xl },
  plate: {
    backgroundColor: Colors.plate,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xl,
  },
  caption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginTop: Spacing.md,
  },
  phaseName: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.heading,
    letterSpacing: -0.4,
    color: Colors.ink,
    flexShrink: 1,
  },
  illumination: {
    fontFamily: FontFamily.monoMedium,
    fontSize: FontSize.lead,
    color: Colors.signal,
  },
  illuminationUnit: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.small,
    color: Colors.inkMuted,
  },
  note: { ...Type.small, marginTop: Spacing.sm },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: Spacing.md,
    paddingTop: Spacing.sm,
    marginTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.rule,
  },
  metaKey: { ...Type.label },
  metaValue: {
    fontFamily: FontFamily.monoMedium,
    fontSize: FontSize.small,
    color: Colors.ink,
    flexShrink: 1,
    textAlign: "right",
  },
  immersiveLink: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: Colors.ink,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.md,
  },
  immersiveText: {
    fontFamily: FontFamily.monoMedium,
    fontSize: FontSize.small,
    letterSpacing: Tracking.label,
    color: Colors.paper,
  },
  immersiveArrow: {
    fontFamily: FontFamily.regular,
    fontSize: 20,
    color: Colors.signal,
  },
});

