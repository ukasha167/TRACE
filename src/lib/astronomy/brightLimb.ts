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

/**
 * Computes the clockwise rotation (degrees) to apply to the lunar body
 * (texture and terminator path together).
 *
 * In the unrotated lunar body frame:
 * - North is at the top (0°)
 * - Waxing crescent is lit on the RIGHT (+90°, Mare Crisium side)
 * - Waning crescent is lit on the LEFT (-90°, Oceanus Procellarum side)
 *
 * ACCURACY, MEASURED, NOT ASSUMED.
 *
 * Rotating texture and terminator together assumes the bright limb sits exactly
 * 90° from the lunar pole in position angle. That holds to the sub-solar
 * latitude (1.54°, because the lunar equator is barely inclined to the ecliptic
 * so the terminator runs almost pole to pole) and is then shifted by optical
 * libration of up to 8°.
 *
 * Cross-checked against lunar north pole position angles from astronomy-engine's
 * RotationAxis across six sites and phases, the disagreement runs 2.9° to 8.4°.
 * An earlier revision of this comment claimed "under 1.6 degrees" and called
 * libration negligible; that was the sub-solar term quoted as if it were the
 * whole error. See __tests__/brightLimbRotation.test.ts.
 *
 * Below about 1% illumination the relation collapses entirely (60° out at an
 * elongation of 1.3°, where topocentric parallax alone moves the bright-limb
 * angle by 29°). It does not matter: there is no lit surface to orient.
 *
 * To remove the approximation, rotate the texture by the pole angle and the
 * terminator path by the bright-limb angle as two independent transforms.
 *
 * In the observer's sky, the bright limb points at angle psi = -brightLimbAngleDeg
 * (clockwise from Zenith).
 *
 * Therefore:
 * - Waxing:  rotation = psi - 90° = -brightLimbAngleDeg - 90°
 * - Waning:  rotation = psi - (-90°) = -brightLimbAngleDeg + 90°
 * - Null tilt (no location): rotation = 0° (standard upright almanac orientation, North up)
 *
 * @param isWaxing MUST come from SunCalc via MoonSnapshot.waxing. Deriving it
 *        as `phaseIndex <= 4` is a 180° error for every waning moon in the
 *        primary buckets, and it shipped.
 */
export function getMoonTextureRotation(
  brightLimbAngleDeg: number | null,
  isWaxing: boolean = true
): number {
  if (brightLimbAngleDeg == null) {
    return 0;
  }
  const psi = -brightLimbAngleDeg;
  return normalizeAngleDeg(isWaxing ? psi - 90 : psi + 90);
}


