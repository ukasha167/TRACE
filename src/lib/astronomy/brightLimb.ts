import * as SunCalc from "suncalc";
import type { MilestoneLocation } from "@/types";

/**
 * Computes the bright-limb angle (degrees) for the moon at a specific
 * date and geographic location.
 *
 * The illuminated fraction is essentially the same everywhere on Earth
 * at a given instant, but the *orientation* of the crescent in the
 * sky depends on the observer's latitude and the moon's position relative
 * to their local horizon (the parallactic angle). This is why the same
 * crescent looks like a "smile" near the equator and more like a vertical
 * sliver at high latitudes.
 *
 * UNITS — read before touching this function:
 * SunCalc v2 returns every angle in DEGREES, not radians. Its own index.d.ts
 * opens with "All angles are in degrees." Both `illumination.angle` and
 * `moonPosition.parallacticAngle` are therefore already degrees, and the
 * difference needs no conversion. An earlier revision of this file applied a
 * radians->degrees conversion (a holdover from SunCalc v1, which did return
 * radians), inflating the result by ~57x. Because the value is normalised into
 * (-180, 180] afterwards, the bug produced a plausible-looking but wrong tilt
 * rather than an obvious failure — the moon simply rendered at the wrong angle.
 *
 * @param date     Must be constructed via toLocalNoon() — never raw Date("YYYY-MM-DD")
 * @param location latitude/longitude from MilestoneLocation
 * @returns Angle in degrees. 0 = terminator vertical (top-lit), positive = clockwise tilt.
 */
export function getBrightLimbAngle(
  date: Date,
  location: MilestoneLocation
): number {
  const illumination = SunCalc.getMoonIllumination(date);
  const moonPosition = SunCalc.getMoonPosition(
    date,
    location.latitude,
    location.longitude
  );

  // Already in degrees — see UNITS note above. Do not add a Math.PI conversion.
  const zenithAngleDeg = illumination.angle - moonPosition.parallacticAngle;

  return normalizeAngleDeg(zenithAngleDeg);
}

/**
 * Normalizes an angle in degrees into (-180, 180].
 */
export function normalizeAngleDeg(deg: number): number {
  const normalized = ((deg % 360) + 360) % 360;
  return normalized > 180 ? normalized - 360 : normalized;
}

/**
 * Computes the clockwise rotation (degrees) to apply to a base moon glyph
 * drawn with its bright limb on the RIGHT (3 o'clock / East / +90°).
 *
 * Coordinate / rotation derivation:
 * 1. Rendering transforms (`transform: [{ rotate: ... }]`, Skia canvas `rotate`)
 *    rotate CLOCKWISE around the center, where positive angle turns from top towards right.
 * 2. In astronomy, `getBrightLimbAngle` measures position angle from Zenith (UP = 0°)
 *    with positive being counter-clockwise (Eastward).
 *    Therefore, the clockwise on-sky angle from Zenith is:
 *      psi = -brightLimbAngleDeg
 *    (Up = 0°, Right = +90°, Down = 180°, Left = -90°).
 * 3. The base glyph has its bright limb oriented to the RIGHT (+90° from Zenith).
 *    To rotate it so that the bright limb points at angle psi:
 *      rotationDeg = psi - 90° = -brightLimbAngleDeg - 90°
 *
 * Physical cases:
 * - 51°N First Quarter on meridian: brightLimbAngleDeg ≈ -101° -> rotation ≈ +11°,
 *   keeping the lit side on the RIGHT with a near-vertical terminator.
 * - Equator young crescent after sunset: brightLimbAngleDeg ≈ +152° -> rotation ≈ +118°,
 *   turning the bright limb DOWN to form a "smile" crescent lit from below.
 * - 51°N Waning Moon in morning: brightLimbAngleDeg ≈ +96° -> rotation ≈ 174°,
 *   turning the bright limb to the LEFT with a near-vertical terminator.
 * - Null tilt (no location): falls back to 0° (waxing, right-lit) or 180° (waning, left-lit).
 *
 * Notice: When `brightLimbAngleDeg` is provided, `isWaxing` is NEVER used to flip
 * the shape, because `brightLimbAngleDeg` already carries whether the Sun is to the
 * right or left of the Moon.
 */
export function getMoonLimbRotation(
  brightLimbAngleDeg: number | null,
  isWaxing: boolean = true
): number {
  if (brightLimbAngleDeg == null) {
    return isWaxing ? 0 : 180;
  }
  return normalizeAngleDeg(-brightLimbAngleDeg - 90);
}

