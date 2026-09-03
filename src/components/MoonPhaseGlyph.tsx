import React from "react";
import { View, StyleSheet } from "react-native";
import { Colors, Radius } from "@/constants/theme";
import { getMoonLimbRotation } from "@/lib/astronomy/brightLimb";

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
 * Base moon is constructed with its bright limb on the RIGHT (3 o'clock).
 * Rotation comes entirely from getMoonLimbRotation(), which reconciles the
 * astronomical zenith-angle datum with the screen coordinate frame and eliminates
 * the double-counting waxing/waning side flip (see brightLimb.ts).
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
          { width: r, height: size, right: 0 },
        ]}
      >
        <View
          style={[
            styles.litCircle,
            {
              width: size,
              height: size,
              borderRadius: r,
              right: 0,
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

  const rotation = getMoonLimbRotation(brightLimbAngleDeg, isWaxing);

  const tilted = (
    <View
      style={{
        width: size,
        height: size,
        transform: [{ rotate: `${rotation}deg` }],
      }}
    >
      {moon}
    </View>
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
