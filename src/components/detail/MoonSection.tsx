import React from "react";
import { View, Text, StyleSheet, useWindowDimensions, Pressable } from "react-native";
import {
  Colors,
  Spacing,
  Type,
  FontFamily,
  FontSize,
} from "@/constants/theme";
import { MoonPhaseGlyph } from "../MoonPhaseGlyph";
import { StarField } from "../moon/StarField";
import {
  formatIllumination,
  describePhase,
  describeSyzygyNote,
} from "@/lib/astronomy/moonPhase";
import type { MoonSnapshot } from "@/types";

type PhaseData = Pick<
  MoonSnapshot,
  "phaseFraction" | "phaseName" | "phaseIndex" | "isTruePhase" | "waxing"
>;

interface Props {
  phase: PhaseData;
  brightLimbAngleDeg: number | null;
  northAngleDeg: number | null;
  onOpenSky?: () => void;
  moonRef?: React.RefObject<View | null>;
}

export function MoonSection({ phase, brightLimbAngleDeg, northAngleDeg, onOpenSky, moonRef }: Props) {
  const { width } = useWindowDimensions();
  const note = describeSyzygyNote(phase);

  // Scaled, not fixed. A 148pt moon is a hero on a small phone and a thumbnail
  // on a tablet, and the whole point is its size relative to the frame.
  const moonSize = Math.min(width * 0.62, 320);
  const plateHeight = Math.round(moonSize * 1.5);

  return (
    <View style={styles.section}>
      <Pressable style={[styles.plate, { height: plateHeight }]} onPress={onOpenSky} disabled={!onOpenSky}
        accessibilityRole={onOpenSky ? "button" : "image"} accessibilityLabel={`${describePhase(phase)}, ${formatIllumination(phase.phaseFraction)} lit${onOpenSky ? ". Stand under this sky" : ""}`}>
        {/* First child, so it paints under the moon — see moon/starGrain.ts for
            why the field is the same one the home hero and the card draw. */}
        <StarField />

        <View ref={moonRef} collapsable={false} style={{ width: moonSize, height: moonSize, alignItems: "center", justifyContent: "center" }}>
        <MoonPhaseGlyph
          phaseFraction={phase.phaseFraction}
          waxing={phase.waxing}
          size={moonSize}
          brightLimbAngleDeg={brightLimbAngleDeg}
          northAngleDeg={northAngleDeg}
          variant="bare"
          glow="hero"
        />
        </View>
        {onOpenSky && <Text style={styles.skyHint}>Tap the moon to stand under this sky</Text>}
      </Pressable>

      <View style={styles.caption}>
        <Text style={styles.phaseName}>{describePhase(phase)}</Text>
        <Text style={styles.illumination}>
          {formatIllumination(phase.phaseFraction)}
          <Text style={styles.illuminationUnit}> lit</Text>
        </Text>
      </View>

      {note && <Text style={styles.note}>{note}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: Spacing.xl },
  plate: {
    // Black. The moon's own night side has to be measurable against the ground
    // it sits on, and on the Prussian plate it was not. See Colors.space.
    backgroundColor: Colors.space,
    // Escapes the screen's page padding so the plate runs edge to edge. Square
    // corners are right here and only here: a full-bleed block has no visible
    // side corners, so rounding would only cut two odd notches out of the top
    // and bottom rules.
    marginHorizontal: -Spacing.page,
    alignItems: "center",
    justifyContent: "center",
  },
  skyHint: { ...Type.smallOnPlate, position: "absolute", bottom: Spacing.md, left: Spacing.page, right: Spacing.page, textAlign: "center" },
  caption: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  phaseName: { ...Type.title, flexShrink: 1 },
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
});
