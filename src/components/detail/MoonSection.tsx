import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  useWindowDimensions,
} from "react-native";
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
import { StarField } from "../moon/StarField";
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
  northAngleDeg: number | null;
  location: MilestoneLocation | null;
}

/**
 * THE MOON THAT NIGHT. The hero of the record.
 *
 * WHAT WAS WRONG WITH IT. It was a 148pt moon centred in an inset rounded
 * plate, under a numbered section header. Three things stopped it reading as
 * the subject of the screen and every one of them was framing rather than
 * content:
 *
 *   1. A section header above it announced it as one section among five. The
 *      hero of a page is not introduced, it is the first thing there.
 *   2. The plate was inset from the page margins, which makes any dark block
 *      read as a card. Cards are things a page contains; a plate is something
 *      the page is tucked under.
 *   3. A small disc adrift in a large dark rectangle. Emptiness around a
 *      subject reads as a placeholder, not as space.
 *
 * So: full bleed to both screen edges, the moon at 62% of the screen width, and
 * the wide halo (see MoonPhaseGlyph's `glow`) so the light carries into the
 * plate instead of stopping at the limb. Nothing else is on the plate. The
 * caption stays on paper below it, because reading surfaces are never dark.
 */
export function MoonSection({
  milestoneId,
  phase,
  brightLimbAngleDeg,
  northAngleDeg,
  location,
}: Props) {
  const { width } = useWindowDimensions();
  const note = describeSyzygyNote(phase);

  // Scaled, not fixed. A 148pt moon is a hero on a small phone and a thumbnail
  // on a tablet, and the whole point is its size relative to the frame.
  const moonSize = Math.min(width * 0.62, 320);
  const plateHeight = Math.round(moonSize * 1.5);

  return (
    <View style={styles.section}>
      <View style={[styles.plate, { height: plateHeight }]}>
        {/* First child, so it paints under the moon — see moon/starGrain.ts for
            why the field is the same one the home hero and the card draw. */}
        <StarField />

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
