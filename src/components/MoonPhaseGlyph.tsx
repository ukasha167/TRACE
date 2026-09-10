import React, { useMemo } from "react";
import { View, StyleSheet, PixelRatio } from "react-native";
import {
  Canvas,
  Circle,
  Fill,
  Group,
  ImageShader,
  Shader,
  useImage,
} from "@shopify/react-native-skia";
import { Colors, Radius } from "@/constants/theme";
import { getLitPathRotation } from "@/lib/astronomy/brightLimb";
import {
  lunarLambertL,
  sunDirection,
  earthshineGain,
  printExposure,
  EARTHSHINE_WRAP,
} from "@/lib/astronomy/moonLighting";
import {
  moonEffect,
  MINERAL_SATURATION,
  PRINT_CONTRAST,
  ALBEDO_MID,
  RELIEF_STRENGTH,
  ALBEDO_WHITE,
  unitRgb,
} from "@/components/moon/moonShader";

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
   * Screen rotation of the Moon's north pole (getLunarNorthRotation), which
   * orients the photograph. Null or absent falls back to rotating the
   * photograph with the terminator, which is the old coupled behaviour and is
   * off by up to tens of degrees near full — see getLunarNorthRotation. Records
   * without coordinates have no pole angle, and there is nothing to fall back
   * from: with no tilt at all both rotations are 0.
   */
  northAngleDeg?: number | null;
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
   * edge, and no more. "hero" carries much further, so the moon sits IN the
   * plate rather than on it. At hero scale the tight bloom alone reads as a
   * sticker on a black rectangle.
   */
  glow?: "tight" | "hero";
}

// Statically required assets so they bundle reliably with Metro
const MOON_ASSET = require("../../assets/moon_disc.png");
const MOON_NORMAL_ASSET = require("../../assets/moon_normal.png");

const MOONLIGHT = unitRgb(Colors.moonlight);
const EARTHSHINE = unitRgb(Colors.earthshine);
const DEG = Math.PI / 180;

/**
 * MOON PHASE GLYPH.
 *
 * The NASA LRO near-side photograph, lit as a sphere by a fragment shader. See
 * `moon/moonShader.ts` for the lighting model and `lib/astronomy/moonLighting.ts`
 * for the geometry it rests on.
 *
 * WHAT THIS USED TO BE, because the difference is the point. The photograph was
 * clipped to a two-arc path — circular limb plus semi-elliptical terminator —
 * with two blurred copies of that path stacked underneath as glow, a hard
 * `Circle` of earthshine behind it, and a 6% ghost of the texture on the dark
 * side. Everything about that was flat. The disc had no centre-to-limb
 * behaviour because a cutout has no normals, the "glow" ringed the whole disc
 * including the unlit half because a blurred silhouette does not know where the
 * Sun is, and the terminator's softness was one 1.5px blur, which is why it
 * read as an edge rather than as a curve turning away from the light.
 *
 * The shader draws the disc AND its halo in one pass, so the halo is a function
 * of the same sun direction that lights the surface and can only appear on the
 * illuminated side. Nothing here is composited from separate exposures, which
 * is what removes the banding.
 *
 * THE TWO ROTATIONS SURVIVE UNCHANGED. `getLitPathRotation` still aims the
 * light and `getLunarNorthRotation` still aims the photograph, and they are
 * still independent — decision 18. In the shader that separation is cheaper
 * than it was: the sun is a vector, the pole is a texture lookup rotation, and
 * neither can accidentally pick up the other's angle.
 */
export function MoonPhaseGlyph({
  phaseFraction,
  waxing,
  size = 40,
  brightLimbAngleDeg = null,
  northAngleDeg = null,
  variant = "plate",
  platePadding = 10,
  round = false,
  glow = "tight",
}: MoonPhaseGlyphProps) {
  const moonImage = useImage(MOON_ASSET);
  const normalImage = useImage(MOON_NORMAL_ASSET);
  const hero = glow === "hero";

  // Room for the halo. The bloom falls off as exp(-(r-1)/width) in radii, so the
  // gutter has to outrun the WIDER of the two terms or the glow gets sliced off
  // square, which looks worse than no glow at all. On a black ground that cut is
  // obvious in a way it never was on the Prussian plate, which is why the hero
  // gutter went from 0.26 to 0.34 of the disc. Negative margin below keeps the
  // laid-out size at `size`.
  const gutter = hero
    ? Math.round(size * 0.34)
    : Math.max(4, Math.round(size * 0.12));
  const canvasSize = size + gutter * 2;
  const cx = canvasSize / 2;
  const cy = canvasSize / 2;
  const r = size / 2;

  const uniforms = useMemo(() => {
    // The light. `getLitPathRotation` is the same number the old path was
    // rotated by, so the phase lands exactly where it always did.
    const litRotationDeg = getLitPathRotation(brightLimbAngleDeg, waxing);
    const sun = sunDirection(phaseFraction, litRotationDeg);

    // The photograph. Independent of the light — decision 18.
    const texRotDeg = northAngleDeg ?? litRotationDeg;

    return {
      uCenter: [cx, cy],
      uRadius: r,
      uSun: [sun.x, sun.y, sun.z],
      uLambert: lunarLambertL(sun.phaseAngle),
      uTexRot: texRotDeg * DEG,
      uSaturation: MINERAL_SATURATION,
      uWhite: ALBEDO_WHITE,
      uContrast: PRINT_CONTRAST,
      uMid: ALBEDO_MID,
      // Stopped down as the disc fills AND metered open when the crescent gets
      // too thin to carry the ramp. The second half is coupled to uEarthGain
      // below, so neither moves alone. See printExposure.
      uExposure: printExposure(phaseFraction),
      uTint: MOONLIGHT,
      uGlow: hero ? 0.16 : 0.1,
      // A tight bright core at the limb plus a faint wide skirt. One wide term
      // strong enough to see is fog, and fog flattens the disc it surrounds.
      uHalo: hero ? 0.3 : 0.22,
      uHaloWidth: hero ? 0.045 : 0.035,
      uHaloFar: hero ? 0.09 : 0.06,
      uHaloWide: hero ? 0.22 : 0.14,
      uEarthshine: EARTHSHINE,
      // The Earth's phase, which is the Moon's inverted. See earthshineGain.
      uEarthGain: earthshineGain(phaseFraction),
      uEarthWrap: EARTHSHINE_WRAP,
      // One device pixel, expressed in radii. fragCoord is in points, so a
      // constant here would be three times too soft on a 3x screen.
      uAA: 1 / PixelRatio.get() / r,
      uRelief: RELIEF_STRENGTH,
    };
  }, [cx, cy, r, phaseFraction, waxing, brightLimbAngleDeg, northAngleDeg, hero]);

  const canvas = (
    <Canvas
      style={{
        width: canvasSize,
        height: canvasSize,
        margin: -gutter, // Preserves exact layout size in parent flex containers
      }}
    >
      {moonEffect && moonImage && normalImage ? (
        <Fill>
          {/* Children bind to the `uniform shader` declarations in order:
              albedo first, then normals. */}
          <Shader source={moonEffect} uniforms={uniforms}>
            <ImageShader
              image={moonImage}
              fit="fill"
              rect={{ x: cx - r, y: cy - r, width: size, height: size }}
              tx="clamp"
              ty="clamp"
            />
            <ImageShader
              image={normalImage}
              fit="fill"
              rect={{ x: cx - r, y: cy - r, width: size, height: size }}
              tx="clamp"
              ty="clamp"
            />
          </Shader>
        </Fill>
      ) : (
        // The texture has not decoded yet, or this device would not compile the
        // SkSL. Either way an unlit disc is the honest placeholder: obviously
        // not the real thing, and it never shows a phase that isn't there.
        <Group>
          <Circle cx={cx} cy={cy} r={r} color={Colors.earthshine} />
        </Group>
      )}
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
    // Black, not the Prussian plate. A lunar photograph on a blue-black ground
    // loses its dark limb into the surface it sits on, so the disc stops being a
    // sphere with a night side and starts being a lit crescent floating on a
    // rectangle. See Colors.space.
    backgroundColor: Colors.space,
    borderRadius: Radius.plate,
    alignItems: "center",
    justifyContent: "center",
  },
});
