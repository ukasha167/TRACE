import React, { useMemo } from "react";
import { View, StyleSheet } from "react-native";
import {
  Canvas,
  Circle,
  Group,
  Image as SkiaImage,
  Path,
  Mask,
  BlurMask,
  useImage,
} from "@shopify/react-native-skia";
import { Colors, Radius } from "@/constants/theme";
import { getMoonTextureRotation } from "@/lib/astronomy/brightLimb";
import { litMoonPath, moonDiscPath } from "@/components/moon/moonPath";

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
 * Visual fidelity enhancements:
 * - Anti-clipping gutter: canvas includes a safety margin so anti-aliased subpixels
 *   and rotated limb features never clip flat at the canvas boundary.
 * - Soft terminator: lit region uses an alpha mask with a subtle 1.5px blur,
 *   softening the lunar day/night boundary while preserving crisp outer limb geometry.
 * - Atmospheric bloom: glowing moonlight halo radiating softly from illuminated terrain.
 * - Deeper earthshine: dark side rests at deep night tone (#171712) with faint 6% texture.
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

  // Safety gutter prevents anti-aliased pixels and rotated geometry from clipping at canvas boundary
  const gutter = Math.max(4, Math.round(size * 0.05));
  const canvasSize = size + gutter * 2;
  const cx = canvasSize / 2;
  const cy = canvasSize / 2;
  const r = size / 2;
  const isWaxing = phaseIndex <= 4;

  const path = useMemo(
    () => litMoonPath(cx, cy, r, phaseFraction, isWaxing),
    [cx, cy, r, phaseFraction, isWaxing]
  );

  const discPath = useMemo(
    () => moonDiscPath(cx, cy, r),
    [cx, cy, r]
  );

  const rotDeg = getMoonTextureRotation(brightLimbAngleDeg, isWaxing);
  const rotRad = (rotDeg * Math.PI) / 180;

  const canvas = (
    <Canvas
      style={{
        width: canvasSize,
        height: canvasSize,
        margin: -gutter, // Preserves exact layout size in parent flex containers
      }}
    >
      <Group
        transform={[
          { translateX: cx },
          { translateY: cy },
          { rotate: rotRad },
          { translateX: -cx },
          { translateY: -cy },
        ]}
      >
        {/* Soft atmospheric moonlight bloom radiating from the illuminated region */}
        <Path
          path={path}
          color={Colors.moonlight}
          opacity={0.3}
        >
          <BlurMask blur={Math.max(3, r * 0.08)} style="normal" />
        </Path>

        {/* Unlit base disc (deep earthshine tone) */}
        <Circle cx={cx} cy={cy} r={r} color={Colors.earthshine} />

        {moonImage ? (
          <Group clip={discPath}>
            {/* Faint earthshine texture on unlit disc (6% opacity) */}
            <Group clip={path} invertClip>
              <SkiaImage
                image={moonImage}
                x={cx - r}
                y={cy - r}
                width={size}
                height={size}
                opacity={0.06}
              />
            </Group>
            {/* Lit lunar surface with softly diffused terminator transition */}
            <Mask
              mode="alpha"
              mask={
                <Group>
                  <Path path={path} color="white">
                    <BlurMask blur={Math.max(1.5, r * 0.02)} style="normal" />
                  </Path>
                </Group>
              }
            >
              <SkiaImage
                image={moonImage}
                x={cx - r}
                y={cy - r}
                width={size}
                height={size}
                opacity={1.0}
              />
            </Mask>
          </Group>
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
    alignItems: "center",
    justifyContent: "center",
  },
});
