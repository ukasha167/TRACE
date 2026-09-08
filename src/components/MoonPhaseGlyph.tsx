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
  /**
   * Which way the moon is heading, from SunCalc via MoonSnapshot.waxing.
   *
   * REQUIRED, and never derived from phaseIndex. This prop used to be
   * `phaseIndex` with `isWaxing = phaseIndex <= 4` computed inside. Buckets 0
   * and 4 straddle their syzygy, so half of every "Full Moon" bucket is waning
   * and half of every "New Moon" bucket is waxing, and the photograph rendered
   * upside down for all of them. Measured against lunar north pole position
   * angles from astronomy-engine: 171.6 degrees wrong for a 98.8% waning moon
   * over Greenwich, against a 2.9-5.5 degree floor when it is right.
   */
  waxing: boolean;
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
  /**
   * Round the plate into a disc. Used in list rows, where a circular thumbnail
   * echoes the moon inside it instead of boxing it.
   */
  round?: boolean;
  /**
   * How far the moonlight carries into the dark around the disc.
   *
   * "tight" is the thumbnail treatment: enough bloom that the limb is not a cut
   * edge, and no more. "hero" adds a second, much wider and fainter pass so the
   * moon sits IN the plate rather than on it. At hero scale the tight bloom
   * alone reads as a sticker on a black rectangle, which is most of why the
   * large moons did not feel like the subject of their screens.
   */
  glow?: "tight" | "hero";
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
  waxing,
  size = 40,
  brightLimbAngleDeg = null,
  variant = "plate",
  platePadding = 10,
  round = false,
  glow = "tight",
}: MoonPhaseGlyphProps) {
  const moonImage = useImage(MOON_ASSET);
  const hero = glow === "hero";

  // Safety gutter prevents anti-aliased pixels and rotated geometry from
  // clipping at the canvas boundary. The hero halo needs far more room: a blur
  // wider than the gutter gets sliced off square, which looks worse than no
  // halo at all. Negative margin below keeps the laid-out size at `size`.
  const gutter = hero
    ? Math.round(size * 0.26)
    : Math.max(4, Math.round(size * 0.05));
  const canvasSize = size + gutter * 2;
  const cx = canvasSize / 2;
  const cy = canvasSize / 2;
  const r = size / 2;

  const path = useMemo(
    () => litMoonPath(cx, cy, r, phaseFraction, waxing),
    [cx, cy, r, phaseFraction, waxing]
  );

  const discPath = useMemo(
    () => moonDiscPath(cx, cy, r),
    [cx, cy, r]
  );

  const rotDeg = getMoonTextureRotation(brightLimbAngleDeg, waxing);
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
        {/* The wide halo, hero surfaces only: light carrying into the plate. */}
        {hero && (
          <Path path={path} color={Colors.moonlight} opacity={0.13}>
            <BlurMask blur={r * 0.42} style="normal" />
          </Path>
        )}

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
    <View
      style={[
        styles.plate,
        { padding: platePadding },
        round && { borderRadius: (size + platePadding * 2) / 2 },
      ]}
    >
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
