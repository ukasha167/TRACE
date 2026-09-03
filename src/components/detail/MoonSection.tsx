import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { router, type Href } from "expo-router";
import {
  Colors,
  Spacing,
  Type,
  FontFamily,
  FontSize,
  Radius,
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
  milestoneId: string;
  phase: PhaseData;
  brightLimbAngleDeg: number | null;
  location: MilestoneLocation | null;
}

/**
 * The moon as it actually looked.
 *
 * The glyph sits on a dark plate, the way a figure is tipped into a printed
 * page, with the data below it on paper as a caption would be. The plate is
 * rounded now and inset from the page edges rather than a hard-cornered band.
 *
 * Labels go through describePhase(), never phaseName: the raw 8-way bucket
 * calls anything within 1.85 days of full a "Full Moon" (spec §6.2).
 */
export function MoonSection({
  milestoneId,
  phase,
  brightLimbAngleDeg,
  location,
}: Props) {
  const note = describeSyzygyNote(phase);

  return (
    <View style={styles.section}>
      <SectionHeader label="The moon that night" />

      <View style={styles.plate}>
        <MoonPhaseGlyph
          phaseFraction={phase.phaseFraction}
          phaseIndex={phase.phaseIndex}
          size={148}
          brightLimbAngleDeg={brightLimbAngleDeg}
          variant="bare"
        />
      </View>

      <View style={styles.caption}>
        <Text style={styles.phaseName}>{describePhase(phase)}</Text>
        <Text style={styles.illumination}>
          {formatIllumination(phase.phaseFraction)}
          <Text style={styles.illuminationUnit}> lit</Text>
        </Text>
      </View>

      {note && <Text style={styles.note}>{note}</Text>}

      <View style={styles.metaRow}>
        <Text style={styles.metaKey}>Observed from</Text>
        <Text style={styles.metaValue}>
          {location ? location.label : "Not recorded"}
        </Text>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.metaKey}>Limb tilt</Text>
        <Text style={styles.metaValue}>
          {brightLimbAngleDeg != null
            ? `${brightLimbAngleDeg.toFixed(1)}°`
            : location
            ? "No coordinates on this record"
            : "Add a location to compute this"}
        </Text>
      </View>

      <Pressable
        style={({ pressed }) => [styles.immersiveLink, pressed && { opacity: 0.6 }]}
        onPress={() => router.push(route(`/sky/${milestoneId}`))}
        accessibilityRole="button"
        accessibilityLabel="Open the full sky view"
      >
        <Text style={styles.immersiveText}>Stand under this sky</Text>
        <Text style={styles.immersiveArrow}>→</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: Spacing.xl },
  plate: {
    backgroundColor: Colors.plate,
    borderRadius: Radius.hero,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xl,
  },
  caption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  phaseName: { ...Type.heading, flexShrink: 1 },
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
  metaKey: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.small,
    color: Colors.inkMuted,
  },
  metaValue: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.small,
    color: Colors.ink,
    flexShrink: 1,
    textAlign: "right",
  },

  immersiveLink: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.paperDim,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.md,
    marginTop: Spacing.lg,
  },
  immersiveText: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSize.body,
    color: Colors.ink,
  },
  immersiveArrow: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.body,
    color: Colors.signal,
  },
});
