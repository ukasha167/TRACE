import React from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import { Colors } from "@/constants/theme";

interface MoonPhaseGlyphProps {
  phaseFraction: number; // 0.0–1.0 illuminated fraction
  phaseIndex: number;    // 0–7 for icon lookup
  size?: number;
  accentColor?: string;
}

/**
 * Moon Phase Glyph — React Native Views renderer.
 *
 * Renders the accurate crescent/gibbous shape using three stacked views
 * clipped by the outer circle's overflow:hidden:
 *   1. Dark base circle (blueprint color)
 *   2. Lit half-circle on the appropriate side (starlight)
 *   3. Terminator oval — dark if crescent, lit if gibbous
 *
 * Phase 7 will add a Skia `Path` version for the export card where
 * sub-pixel accuracy and HD rendering matter. This version serves
 * all in-app UI chrome including list rows and the detail screen.
 *
 * Geometry reference:
 *   - phaseIndex 0–4 = waxing → lit side is on the RIGHT
 *   - phaseIndex 5–7 = waning → lit side is on the LEFT
 *   - terminator semi-minor axis b = r × |2f − 1|
 *     (b=r at new/full, b=0 at quarter, continuous in between)
 */
export function MoonPhaseGlyph({
  phaseFraction,
  phaseIndex,
  size = 40,
  accentColor = Colors.ember,
}: MoonPhaseGlyphProps) {
  const r = size / 2;

  // Waxing (new→full, phaseIndex 0–4): lit side on RIGHT
  // Waning (full→new, phaseIndex 5–7): lit side on LEFT
  const isWaxing = phaseIndex <= 4;

  // Terminator oval semi-minor axis
  const b = r * Math.abs(2 * phaseFraction - 1);

  // Above 0.5 = gibbous → oval fills the dark half with lit color
  // Below 0.5 = crescent → oval covers part of lit half with dark color
  const isGibbous = phaseFraction > 0.5;

  // Edge cases: new moon (all dark) and full moon (all lit) skip the oval
  const showOval = b > 0.5;

  return (
    <View
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: r,
          borderColor: accentColor,
        },
      ]}
    >
      {/* Lit half — clipped to a rectangle via overflow:hidden, the outer
          circle clips the corners so only a proper semicircle shows */}
      <View
        style={[
          styles.litHalfContainer,
          {
            width: r,
            height: size,
            ...(isWaxing ? { right: 0 } : { left: 0 }),
          },
        ]}
      >
        {/* The full starlight circle, positioned so only the lit half is visible */}
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

      {/* Terminator oval — painted on top of the lit half */}
      {showOval && (
        <View
          style={[
            styles.terminator,
            {
              width: b * 2,
              height: size,
              // borderRadius: b makes it an oval (pill with radius = half width)
              // Since height > width (when b < r), this produces the ellipse shape
              borderRadius: b,
              backgroundColor: isGibbous ? Colors.starlight : Colors.blueprint,
              left: r - b,
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: "hidden",
    backgroundColor: Colors.blueprint,
    borderWidth: 1.5,
  },
  litHalfContainer: {
    position: "absolute",
    top: 0,
    overflow: "hidden",
  },
  litCircle: {
    position: "absolute",
    top: 0,
    backgroundColor: Colors.starlight,
  },
  terminator: {
    position: "absolute",
    top: 0,
  },
});
