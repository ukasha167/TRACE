import React from "react";
import { View, StyleSheet } from "react-native";
import { Colors, Radius } from "@/constants/theme";

interface MoonPhaseGlyphProps {
  phaseFraction: number; // 0.0–1.0 illuminated fraction
  phaseIndex: number; // 0–7
  size?: number;
  /** Bright-limb tilt in degrees (getBrightLimbAngle). Null = no tilt correction. */
  brightLimbAngleDeg?: number | null;
  /**
   * "plate" sets the moon into a dark square, the way a figure is tipped into a
   * printed page — the default on paper surfaces.
   * "bare" draws the moon alone, for use on a surface that is already dark.
   */
  variant?: "plate" | "bare";
  /** Padding between the moon and the plate edge. */
  platePadding?: number;
}

/**
 * Moon phase glyph, drawn with plain Views.
 *
 * Three stacked layers clipped by the outer circle's overflow:
 *   1. dark base circle
 *   2. lit half-circle on the correct side
 *   3. terminator ellipse — dark when crescent, lit when gibbous
 *
 * Geometry:
 *   - phaseIndex 1–3 waxing, lit side RIGHT; 5–7 waning, lit side LEFT.
 *     (0 and 4 are new/full, where the lit side is moot.)
 *   - terminator semi-minor axis b = r × |2f − 1|, so b = r at new/full and
 *     b = 0 at the quarters, continuous throughout.
 *
 * Phase 7 adds a Skia Path version for the export card, where sub-pixel
 * accuracy matters. This one serves every in-app surface.
 */
export function MoonPhaseGlyph({
  phaseFraction,
  phaseIndex,
  size = 40,
  brightLimbAngleDeg = null,
  variant = "plate",
  platePadding = 10,
}: MoonPhaseGlyphProps) {
  const r = size / 2;
  const isWaxing = phaseIndex <= 4;
  const b = r * Math.abs(2 * phaseFraction - 1);
  const isGibbous = phaseFraction > 0.5;
  const showOval = b > 0.5;

  const moon = (
    <View style={[styles.base, { width: size, height: size, borderRadius: r }]}>
      <View
        style={[
          styles.litHalf,
          { width: r, height: size, ...(isWaxing ? { right: 0 } : { left: 0 }) },
        ]}
      >
        <View
          style={[
            styles.litCircle,
            {
              width: size,
              height: size,
              borderRadius: r,
              ...(isWaxing ? { right: 0 } : { left: 0 }),
            },
          ]}
        />
      </View>

      {showOval && (
        <View
          style={[
            styles.terminator,
            {
              width: b * 2,
              height: size,
              borderRadius: b,
              backgroundColor: isGibbous ? Colors.moonlight : Colors.plate,
              left: r - b,
            },
          ]}
        />
      )}
    </View>
  );

  const tilted =
    brightLimbAngleDeg != null ? (
      <View
        style={{
          width: size,
          height: size,
          transform: [{ rotate: `${brightLimbAngleDeg}deg` }],
        }}
      >
        {moon}
      </View>
    ) : (
      moon
    );

  if (variant === "bare") return tilted;

  return (
    <View style={[styles.plate, { padding: platePadding }]}>{tilted}</View>
  );
}

const styles = StyleSheet.create({
  plate: {
    backgroundColor: Colors.plate,
    borderRadius: Radius.plate,
    alignSelf: "flex-start",
  },
  base: {
    backgroundColor: Colors.plate,
    overflow: "hidden",
    position: "relative",
  },
  litHalf: { position: "absolute", top: 0, overflow: "hidden" },
  litCircle: { position: "absolute", top: 0, backgroundColor: Colors.moonlight },
  terminator: { position: "absolute", top: 0 },
});
