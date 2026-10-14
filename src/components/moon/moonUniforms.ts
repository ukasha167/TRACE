import { PixelRatio } from "react-native";
import { Colors } from "@/constants/theme";
import { getLitPathRotation } from "@/lib/astronomy/brightLimb";
import {
  lunarLambertL,
  sunDirection,
  earthshineGain,
  printExposure,
  EARTHSHINE_WRAP,
} from "@/lib/astronomy/moonLighting";
import {
  MINERAL_SATURATION,
  PRINT_CONTRAST,
  ALBEDO_MID,
  RELIEF_STRENGTH,
  ALBEDO_WHITE,
  unitRgb,
} from "./moonShader";

/**
 * The moon shader's uniforms for one disc, in one place.
 *
 * MoonPhaseGlyph used to build these inline. The life-in-moons grid and the
 * star map draw many moons into one canvas, and a second copy of this block
 * would be the decision 13 bug waiting to happen: a grid cell and the glyph it
 * opens into lit by two sets of numbers that drift apart. Everything that draws
 * a moon asks here.
 */

const MOONLIGHT = unitRgb(Colors.moonlight);
const EARTHSHINE = unitRgb(Colors.earthshine);
const DEG = Math.PI / 180;

export interface MoonLight {
  phaseFraction: number;
  /** From SunCalc via MoonSnapshot.waxing. Never from phaseIndex. */
  waxing: boolean;
  brightLimbAngleDeg: number | null;
  northAngleDeg: number | null;
}

export type MoonGlow = "tight" | "hero";

/**
 * Room around the disc for the halo, in points. The bloom falls off as
 * exp(-(r-1)/width) in radii, so the gutter has to outrun the wider term or the
 * glow is sliced off square.
 */
export function moonGutter(size: number, glow: MoonGlow): number {
  return glow === "hero" ? Math.round(size * 0.34) : Math.max(4, Math.round(size * 0.12));
}

export function moonUniforms(
  moon: MoonLight,
  cx: number,
  cy: number,
  r: number,
  glow: MoonGlow,
  /**
   * Antialiasing half-width in radii. Defaults to one device pixel. A card
   * authored at its output size passes 1 / r, since there one unit is a pixel.
   */
  aa?: number
) {
  const hero = glow === "hero";
  // The light. `getLitPathRotation` is the same number the old path was
  // rotated by, so the phase lands exactly where it always did.
  const litRotationDeg = getLitPathRotation(moon.brightLimbAngleDeg, moon.waxing);
  const sun = sunDirection(moon.phaseFraction, litRotationDeg);
  // The photograph. Independent of the light, decision 18.
  const texRotDeg = moon.northAngleDeg ?? litRotationDeg;

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
    // too thin to carry the ramp. Coupled to uEarthGain; see printExposure.
    uExposure: printExposure(moon.phaseFraction),
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
    uEarthGain: earthshineGain(moon.phaseFraction),
    uEarthWrap: EARTHSHINE_WRAP,
    // One device pixel, expressed in radii. fragCoord is in points, so a
    // constant here would be three times too soft on a 3x screen.
    uAA: aa ?? 1 / PixelRatio.get() / r,
    uRelief: RELIEF_STRENGTH,
  };
}
