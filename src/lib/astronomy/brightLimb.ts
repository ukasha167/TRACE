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

  // Normalize to (-180, 180] using JS-safe positive modulo
  // (JS % can return negative values for negative operands)
  const normalized = ((zenithAngleDeg % 360) + 360) % 360;
  return normalized > 180 ? normalized - 360 : normalized;
}
