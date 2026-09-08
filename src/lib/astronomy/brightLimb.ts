import * as SunCalc from "suncalc";
import * as Astronomy from "astronomy-engine";
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
 * Computes the clockwise rotation (degrees) to apply to the LIT REGION path
 * (`litMoonPath`) — the illuminated limb and the terminator ellipse.
 *
 * NAMING, because the old name was a trap: this used to be
 * `getMoonTextureRotation` and drove the lunar photograph as well as the
 * terminator. It no longer does, and it must not — see
 * `getLunarNorthRotation` below for why the two rotations are independent.
 *
 * In the unrotated lunar body frame:
 * - North is at the top (0°)
 * - Waxing crescent is lit on the RIGHT (+90°, Mare Crisium side)
 * - Waning crescent is lit on the LEFT (-90°, Oceanus Procellarum side)
 *
 * The terminator is the great circle on the Moon whose plane is perpendicular
 * to the Moon->Sun direction. Its projection onto the disc is an ellipse whose
 * MINOR axis lies exactly along the projected Sun direction, i.e. along the
 * bright limb. That relation is exact — no libration correction applies to it,
 * because it is fixed by the Sun's direction alone and says nothing about where
 * the Moon's poles are.
 *
 * In the observer's sky the bright limb points at psi = -brightLimbAngleDeg
 * (clockwise from Zenith), so:
 * - Waxing:  rotation = psi - 90° = -brightLimbAngleDeg - 90°
 * - Waning:  rotation = psi + 90° = -brightLimbAngleDeg + 90°
 * - Null tilt (no location): rotation = 0° (upright almanac orientation, North up)
 *
 * @param isWaxing MUST come from SunCalc via MoonSnapshot.waxing. Deriving it
 *        as `phaseIndex <= 4` is a 180° error for every waning moon in the
 *        primary buckets, and it shipped.
 */
export function getLitPathRotation(
  brightLimbAngleDeg: number | null,
  isWaxing: boolean = true
): number {
  if (brightLimbAngleDeg == null) {
    return 0;
  }
  const psi = -brightLimbAngleDeg;
  return normalizeAngleDeg(isWaxing ? psi - 90 : psi + 90);
}

/**
 * Computes the clockwise rotation (degrees) to apply to the LUNAR PHOTOGRAPH —
 * the NASA LRO near-side disc, which is drawn with the Moon's north pole up.
 *
 * WHY THIS IS NOT `getLitPathRotation`, and why the app used to be wrong:
 *
 * The old code rotated photograph and terminator together by one angle derived
 * from the bright limb. That silently assumes the Moon's north pole sits exactly
 * 90° from the bright limb in position angle. It does not. Two effects break it:
 *
 *   1. The sub-solar latitude (up to 1.54°, the Moon's equator tilt to the
 *      ecliptic) means the terminator plane is not quite pole-to-pole.
 *   2. Optical libration (up to ~8°) tilts the pole in and out of the plane of
 *      sky, and the projections of two perpendicular 3D directions onto a plane
 *      are not themselves perpendicular. This one dominates.
 *
 * Measured over 2,000+ site/date samples against this function, the coupled
 * approximation is off by a median 1.3° at the quarters, ~7° at 5-10%
 * illumination, and it collapses entirely near syzygy — up to 66° at 97-99%
 * illumination, which is the most visible case of all, since a nearly-full moon
 * shows its whole face. The bright-limb direction becomes ill-conditioned there
 * (at full moon the Sun is almost directly behind the observer, so its projected
 * direction on the disc is a vanishing vector pointing anywhere), and the old
 * code fed that noise straight into the photograph.
 *
 * The pole has no such degeneracy: it is a real direction in space at every
 * phase. So the photograph now follows the pole and the terminator follows the
 * Sun, which is what each of them is physically tied to.
 *
 * MATH: -(P - q), where
 *   P = position angle of the Moon's north pole from celestial north, measured
 *       eastward (counter-clockwise on sky), from astronomy-engine's
 *       RotationAxis; and
 *   q = the parallactic angle, which re-references P from celestial north to
 *       the observer's zenith.
 * Negated because screen transforms rotate clockwise while position angles run
 * counter-clockwise — the same datum flip documented in `getMoonLimbRotation`.
 *
 * `q` comes from SunCalc, exactly as it does in `getBrightLimbAngle`, so both
 * rotations are referenced to the same zenith. That matters more than the
 * absolute accuracy of `q`: a shared error cancels between them, and their
 * relative orientation is what a reader sees.
 *
 * Topocentric, because the Moon's ~1° diurnal parallax moves it enough on the
 * sky to shift the pole's bearing by a comparable amount.
 *
 * @returns Clockwise degrees in (-180, 180]. Callers pass null instead of
 *          calling this when the record has no coordinates.
 */
export function getLunarNorthRotation(
  date: Date,
  location: Pick<MilestoneLocation, "latitude" | "longitude">
): number {
  const observer = new Astronomy.Observer(
    location.latitude,
    location.longitude,
    0
  );

  // ofdate = false -> J2000, matching RotationAxis, which reports the pole in
  // EQJ. Both directions must live in one frame or the bearing between them is
  // meaningless. aberration = true, as in skyBodies.
  const eq = Astronomy.Equator(Astronomy.Body.Moon, date, observer, false, true);
  const axis = Astronomy.RotationAxis(Astronomy.Body.Moon, date);

  const poleAngle = positionAngleDeg(
    [eq.vec.x, eq.vec.y, eq.vec.z],
    [axis.north.x, axis.north.y, axis.north.z]
  );

  const parallactic = SunCalc.getMoonPosition(
    date,
    location.latitude,
    location.longitude
  ).parallacticAngle;

  return normalizeAngleDeg(-(poleAngle - parallactic));
}

/**
 * Position angle of direction `target` as seen at sky point `at`, measured from
 * celestial north through east, in degrees.
 *
 * Both arguments are equatorial vectors in the SAME frame; neither needs to be
 * normalised. The sky-plane basis at `at` is built by projecting out the radial
 * component, so this is plain vector geometry with no trigonometric identities
 * to get backwards.
 */
function positionAngleDeg(
  at: [number, number, number],
  target: [number, number, number]
): number {
  const m = normalizeVector(at);
  const dotM = (v: [number, number, number]) =>
    v[0] * m[0] + v[1] * m[1] + v[2] * m[2];

  // North in the plane of sky: the celestial pole (0,0,1) with its radial part removed.
  const polar: [number, number, number] = [0, 0, 1];
  const north = normalizeVector([
    polar[0] - m[0] * dotM(polar),
    polar[1] - m[1] * dotM(polar),
    polar[2] - m[2] * dotM(polar),
  ]);
  // East completes the frame: north x m, looking outward along m.
  const east: [number, number, number] = [
    north[1] * m[2] - north[2] * m[1],
    north[2] * m[0] - north[0] * m[2],
    north[0] * m[1] - north[1] * m[0],
  ];

  const projected: [number, number, number] = [
    target[0] - m[0] * dotM(target),
    target[1] - m[1] * dotM(target),
    target[2] - m[2] * dotM(target),
  ];
  const along = (b: [number, number, number]) =>
    projected[0] * b[0] + projected[1] * b[1] + projected[2] * b[2];

  return (Math.atan2(along(east), along(north)) * 180) / Math.PI;
}

function normalizeVector(
  v: [number, number, number]
): [number, number, number] {
  const length = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / length, v[1] / length, v[2] / length];
}
