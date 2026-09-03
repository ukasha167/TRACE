import React, { useMemo } from "react";
import { View, StyleSheet } from "react-native";
import {
  Canvas,
  Circle,
  Group,
  Image as SkiaImage,
  Path,
  useImage,
} from "@shopify/react-native-skia";
import { Colors, Radius } from "@/constants/theme";
import { getMoonTextureRotation } from "@/lib/astronomy/brightLimb";
import { litMoonPath } from "@/components/moon/moonPath";

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

// Statically required asset so it bundles reliably with Metro
const MOON_ASSET = require("../../assets/moon_disc.png");

/**
 * MOON PHASE GLYPH (§17.1)
 *
 * Renders the real lunar photograph (NASA LRO 397x397 orthographic near-side projection),
 * lit by the exact 2-arc terminator geometry (circular limb + semi-elliptical terminator).
 *
 * Orientation and tilt:
 * - Texture and path rotate together by getMoonTextureRotation().
 *   This is geometrically correct to within the sub-solar latitude (under 1.6 degrees)
 *   because the lunar equator inclination to the ecliptic is only 1.54°, meaning the
 *   terminator runs almost exactly pole to pole in the lunar frame.
 * - Lunar libration (±8 degrees) is negligible at screen scale and ignored.
 * - The texture is NEVER mirrored (which would move Mare Crisium to the wrong limb).
 *   Waxing/waning lit side is constructed directly in litMoonPath.
 * - Falling back cleanly to vector geometry while the texture loads ensures zero flicker.
 */
export function MoonPhaseGlyph({
  phaseFraction,
  phaseIndex,
  size = 40,
  brightLimbAngleDeg = null,
  variant = "plate",
  platePadding = 10,
}: MoonPhaseGlyphProps) {
  const moonImage = useImage(MOON_ASSET);

  const r = size / 2;
  const isWaxing = phaseIndex <= 4;

  const path = useMemo(
    () => litMoonPath(r, r, r, phaseFraction, isWaxing),
    [r, phaseFraction, isWaxing]
  );

  const rotDeg = getMoonTextureRotation(brightLimbAngleDeg, isWaxing);
  const rotRad = (rotDeg * Math.PI) / 180;

  const canvas = (
    <Canvas style={{ width: size, height: size }}>
      <Group
        transform={[
          { translateX: r },
          { translateY: r },
          { rotate: rotRad },
          { translateX: -r },
          { translateY: -r },
        ]}
      >
        {/* Unlit base disc (earthshine ground) */}
        <Circle cx={r} cy={r} r={r} color={Colors.earthshine} />

        {moonImage ? (
          <>
            {/* Faint earthshine texture on unlit disc */}
            <Group clip={path} invertClip>
              <SkiaImage
                image={moonImage}
                x={0}
                y={0}
                width={size}
                height={size}
                opacity={0.18}
              />
            </Group>
            {/* Lit lunar surface with real photographic texture */}
            <Group clip={path}>
              <SkiaImage
                image={moonImage}
                x={0}
                y={0}
                width={size}
                height={size}
                opacity={1.0}
              />
            </Group>
          </>
        ) : (
          /* Clean vector fallback while texture loads */
          <Path path={path} color={Colors.moonlight} />
        )}
      </Group>
    </Canvas>
  );

  if (variant === "bare") return canvas;

  return (
    <View style={[styles.plate, { padding: platePadding }]}>
      {canvas}
    </View>
  );
}

const styles = StyleSheet.create({
  plate: {
    backgroundColor: Colors.plate,
    borderRadius: Radius.plate,
    alignSelf: "flex-start",
  },
});
