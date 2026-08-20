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
 * Formula from spec §6.3 — no changes.
 *
 * @param date     Must be constructed via toLocalNoon() — never raw Date("YYYY-MM-DD")
 * @param location latitude/longitude from MilestoneLocation
 * @returns Angle in degrees. 0° = terminator vertical (top-lit), positive = clockwise tilt.
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
  // Both angle and parallacticAngle are in radians
  const zenithAngleRad = illumination.angle - moonPosition.parallacticAngle;
  const degrees = (zenithAngleRad * 180) / Math.PI;

  // Normalize to (-180, 180] using JS-safe positive modulo
  // (JS % can return negative values for negative operands)
  const normalized = ((degrees % 360) + 360) % 360;
  return normalized > 180 ? normalized - 360 : normalized;
}
