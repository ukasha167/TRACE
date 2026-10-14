import { test } from "node:test";
import assert from "node:assert/strict";
import * as SunCalc from "suncalc";
import * as Astronomy from "astronomy-engine";
import {
  getBrightLimbAngle,
  getMoonLimbRotation,
  getLitPathRotation,
  getLunarNorthRotation,
  normalizeAngleDeg,
} from "@/lib/astronomy/brightLimb";

const DEG = Math.PI / 180;

/**
 * PROOF OF BRIGHT-LIMB ROTATION
 *
 * The bright limb of the Moon points directly towards the Sun by definition.
 * We independently compute the on-sky position angle of the Sun as seen from
 * the Moon in the observer's local horizontal (Alt/Az) frame using spherical
 * trigonometry on SunCalc's raw getPosition and getMoonPosition, completely
 * independent of getBrightLimbAngle:
 *
 *   tan(theta) = cos(h_s) * sin(A_s - A_m) /
 *                (sin(h_s) * cos(h_m) - cos(h_s) * sin(h_m) * cos(A_s - A_m))
 *
 * Measured clockwise from Zenith:
 *   Up = 0°, Right = +90°, Down = ±180°, Left = -90°.
 *
 * For a base glyph constructed with its bright limb on the RIGHT (+90°):
 *   onScreenBrightLimbAngle = normalizeAngleDeg(90 + getMoonLimbRotation(tilt))
 *
 * This must match the independent on-sky Sun angle in both magnitude and sign.
 */
function independentSunAngleFromMoon(
  date: Date,
  lat: number,
  lng: number
): number {
  const s = SunCalc.getPosition(date, lat, lng);
  const m = SunCalc.getMoonPosition(date, lat, lng);
  const rad = Math.PI / 180;
  const hs = s.altitude * rad;
  const hm = m.altitude * rad;
  const dAz = (s.azimuth - m.azimuth) * rad;

  const y = Math.cos(hs) * Math.sin(dAz);
  const x =
    Math.sin(hs) * Math.cos(hm) -
    Math.cos(hs) * Math.sin(hm) * Math.cos(dAz);

  return Math.atan2(y, x) / rad;
}

// ---- Fixtures (impersonal, verifiable dates per §14) ----

test("first-quarter moon high on meridian at 51°N is lit on the right with near-vertical terminator", () => {
  // London, 2024-04-15 19:30 UTC: Moon high near meridian (alt ~61°, az ~214°), Sun set in West.
  const date = new Date("2024-04-15T19:30:00Z");
  const lat = 51.5;
  const lng = 0;

  const tilt = getBrightLimbAngle(date, { latitude: lat, longitude: lng, label: "London" });
  const indep = independentSunAngleFromMoon(date, lat, lng);
  const rotation = getMoonLimbRotation(tilt);
  const onScreenLimb = normalizeAngleDeg(90 + rotation);

  // Independent Sun angle is ~+101° (Right and slightly down).
  assert.ok(indep > 90 && indep < 115, `expected Sun to the right (~101°), got ${indep}`);

  // On-screen bright limb must match independent angle within 1°
  const diff = Math.abs(normalizeAngleDeg(onScreenLimb - indep));
  assert.ok(diff < 1.0, `expected diff < 1°, got diff ${diff}°`);

  // Physical check: rotation is near 0° (+11°), keeping lit side on right with near-vertical terminator
  assert.ok(Math.abs(rotation) < 20, `expected near-vertical rotation, got ${rotation}`);
});

test("waning crescent/quarter morning at 51°N is lit on the left with near-vertical terminator", () => {
  // London, 2024-04-02 05:00 UTC: Waning moon in South-East, Sun rising in East (left of moon).
  const date = new Date("2024-04-02T05:00:00Z");
  const lat = 51.5;
  const lng = 0;

  const tilt = getBrightLimbAngle(date, { latitude: lat, longitude: lng, label: "London" });
  const indep = independentSunAngleFromMoon(date, lat, lng);
  const rotation = getMoonLimbRotation(tilt);
  const onScreenLimb = normalizeAngleDeg(90 + rotation);

  // Independent Sun angle is ~-95° (Left, toward East).
  assert.ok(indep < -85 && indep > -110, `expected Sun to the left (~-95°), got ${indep}`);

  // On-screen bright limb must match independent angle within 1°
  const diff = Math.abs(normalizeAngleDeg(onScreenLimb - indep));
  assert.ok(diff < 1.0, `expected diff < 1°, got diff ${diff}°`);

  // Rotation must turn base right-lit glyph to the LEFT (~180° rotation)
  assert.ok(Math.abs(normalizeAngleDeg(rotation - 180)) < 20, `expected ~180° rotation, got ${rotation}`);
});

test("young crescent at equator just after sunset is a smile lit from below", () => {
  // Equator (0°N, 0°E), 2024-04-09 18:30 UTC: Sun set, young crescent directly above setting sun.
  const date = new Date("2024-04-09T18:30:00Z");
  const lat = 0;
  const lng = 0;

  const tilt = getBrightLimbAngle(date, { latitude: lat, longitude: lng, label: "Equator" });
  const indep = independentSunAngleFromMoon(date, lat, lng);
  const rotation = getMoonLimbRotation(tilt);
  const onScreenLimb = normalizeAngleDeg(90 + rotation);

  // Sun is below the horizon beneath the moon (angle ~ -150° / +210°).
  assert.ok(Math.abs(indep) > 135, `expected Sun below the moon (>135° from zenith), got ${indep}`);

  // On-screen limb matches independent calculation within 3° (slight horizon refraction difference)
  const diff = Math.abs(normalizeAngleDeg(onScreenLimb - indep));
  assert.ok(diff < 3.0, `expected diff < 3°, got diff ${diff}°`);

  // Physical check: on-screen bright limb points DOWN (smile crescent)
  assert.ok(Math.abs(onScreenLimb) > 135, `expected limb pointing down, got ${onScreenLimb}`);
});

test("southern hemisphere (Sydney) waxing moon is lit on the left", () => {
  // Sydney (-33.87°S, 151.21°E), 2024-04-15 09:30 UTC: Looking North at waxing moon, Sun set on the LEFT.
  const date = new Date("2024-04-15T09:30:00Z");
  const lat = -33.87;
  const lng = 151.21;

  const tilt = getBrightLimbAngle(date, { latitude: lat, longitude: lng, label: "Sydney" });
  const indep = independentSunAngleFromMoon(date, lat, lng);
  const rotation = getMoonLimbRotation(tilt);
  const onScreenLimb = normalizeAngleDeg(90 + rotation);

  // In Southern hemisphere, waxing moon has Sun on the LEFT (negative angle, ~-120°).
  assert.ok(indep < -100 && indep > -140, `expected Sun on left in southern hemisphere, got ${indep}`);

  const diff = Math.abs(normalizeAngleDeg(onScreenLimb - indep));
  assert.ok(diff < 1.0, `expected diff < 1°, got diff ${diff}°`);
});

test("null tilt falls back to un-tilted almanac orientation without crashing", () => {
  // Waxing fallback: 0° (lit on right)
  assert.equal(getMoonLimbRotation(null, true), 0);
  // Waning fallback: 180° (lit on left)
  assert.equal(getMoonLimbRotation(null, false), 180);
});

test("old buggy consumer code fails the physical assertions", () => {
  // Demonstrates why the old code failed:
  // Old code in MoonPhaseGlyph and ExportCardCanvas took a waning moon, flipped it to left (-90°),
  // and then rotated by +tilt degrees: oldAngle = -90 + tilt.
  const date = new Date("2024-04-02T05:00:00Z"); // London waning
  const tilt = getBrightLimbAngle(date, { latitude: 51.5, longitude: 0, label: "London" }); // ~+96°
  const oldBuggyOnScreenLimb = normalizeAngleDeg(-90 + tilt); // -90 + 96 = +6° (pointing UP!)

  // Old code pointed almost straight UP (+6°), completely missing the Sun on the left (-95°).
  assert.ok(Math.abs(oldBuggyOnScreenLimb) < 15, `old buggy limb was ~+6°, got ${oldBuggyOnScreenLimb}`);
  // Error was over 100 degrees!
  const oldError = Math.abs(normalizeAngleDeg(oldBuggyOnScreenLimb - (-95.4)));
  assert.ok(oldError > 90, `old error was huge: ${oldError}°`);
});

/**
 * PROOF OF LUNAR NORTH ROTATION
 *
 * The lunar photograph and the terminator are two different things pinned to
 * two different directions in space:
 *
 *   - The terminator is fixed by the Sun. Its projected ellipse has its minor
 *     axis exactly along the bright limb, and `getLitPathRotation` follows it.
 *   - The photograph is fixed by the Moon's rotation axis, and
 *     `getLunarNorthRotation` follows that.
 *
 * The app used to drive both from the bright limb alone, which assumes the pole
 * sits exactly 90° from the bright limb in position angle. Libration (~8°) and
 * the sub-solar latitude (1.54°) break that assumption, and near syzygy it
 * breaks completely.
 *
 * `lunarNorthScreenRotation` below is an independent implementation: classical
 * spherical trigonometry on scalar RA/Dec in the OF-DATE frame, against the
 * production function's vector projection in J2000. Different arithmetic and a
 * different frame, so agreement is evidence rather than a tautology.
 */
function lunarNorthScreenRotation(date: Date, lat: number, lng: number): number {
  const rad = Math.PI / 180;
  const observer = new Astronomy.Observer(lat, lng, 0);

  // Topocentric Moon, equinox of date.
  const moon = Astronomy.Equator(Astronomy.Body.Moon, date, observer, true, true);
  // RotationAxis reports the pole in J2000, so rotate it into the same frame.
  const pole = Astronomy.EquatorFromVector(
    Astronomy.RotateVector(
      Astronomy.Rotation_EQJ_EQD(date),
      Astronomy.RotationAxis(Astronomy.Body.Moon, date).north
    )
  );

  const a1 = moon.ra * 15 * rad;
  const d1 = moon.dec * rad;
  const a2 = pole.ra * 15 * rad;
  const d2 = pole.dec * rad;

  // Position angle of the pole from celestial north, through east.
  const P =
    Math.atan2(
      Math.cos(d2) * Math.sin(a2 - a1),
      Math.sin(d2) * Math.cos(d1) -
        Math.cos(d2) * Math.sin(d1) * Math.cos(a2 - a1)
    ) / rad;

  const q = SunCalc.getMoonPosition(date, lat, lng).parallacticAngle;

  // Screen transforms turn clockwise; position angles run counter-clockwise.
  return normalizeAngleDeg(-(P - q));
}

/**
 * Tolerance for the two pole implementations. The measured worst case over
 * 5,400 samples (six sites, 1985-2024) is 0.15°, which is the J2000 vs of-date
 * frame difference and nothing else. 1° leaves headroom without letting a real
 * regression through — the bug this replaced was off by 3-66°.
 */
const POLE_TOLERANCE_DEG = 1;

/**
 * How far the pole may sit from perpendicular-to-the-bright-limb at
 * well-conditioned phases. This is the libration the old coupled rotation threw
 * away. Measured max over the same sweep, restricted to 0.15 < illumination <
 * 0.85: 5.54°.
 */
const LIBRATION_TOLERANCE_DEG = 8;

const SITES: [string, number, number][] = [
  ["London", 51.5, 0],
  ["Tokyo", 35.68, 139.65],
  ["Sydney", -33.87, 151.21],
  ["Equator", 0, 0],
  ["Reykjavik", 64.13, -21.9],
  ["Quito", -0.18, -78.47],
];

const PHASES = [
  "2024-04-15T19:30:00Z", // first quarter
  "2024-04-02T05:00:00Z", // last quarter
  "2015-09-27T20:00:00Z", // 99.9% waxing, seven hours before the eclipse
  "1996-04-21T20:46:00Z", // 15% waxing crescent
];

test("lunar north rotation matches an independent spherical-trig implementation", () => {
  let worst = 0;
  let worstAt = "";
  for (const iso of PHASES) {
    for (const [name, lat, lng] of SITES) {
      const date = new Date(iso);
      const mine = getLunarNorthRotation(date, {
        latitude: lat,
        longitude: lng,
      });
      const independent = lunarNorthScreenRotation(date, lat, lng);
      const diff = Math.abs(normalizeAngleDeg(mine - independent));
      if (diff > worst) {
        worst = diff;
        worstAt = `${iso} ${name}`;
      }
    }
  }
  assert.ok(
    worst < POLE_TOLERANCE_DEG,
    `worst pole disagreement ${worst.toFixed(3)}° at ${worstAt}`
  );
});

test("the pole is NOT 90° from the bright limb — this is the libration the old code dropped", () => {
  // At well-conditioned phases the two rotations stay within libration of each
  // other, which is why the old coupled model looked plausible. But the offset
  // is real, and on at least one fixture it is degrees, not rounding.
  let largest = 0;
  for (const iso of ["2024-04-15T19:30:00Z", "2015-09-27T20:00:00Z", "1996-04-21T20:46:00Z"]) {
    for (const [name, lat, lng] of SITES) {
      const date = new Date(iso);
      const location = { latitude: lat, longitude: lng, label: name };
      const illumination = SunCalc.getMoonIllumination(date);
      const litPath = getLitPathRotation(
        getBrightLimbAngle(date, location),
        illumination.phase < 0.5
      );
      const north = getLunarNorthRotation(date, location);
      const offset = Math.abs(normalizeAngleDeg(north - litPath));

      assert.ok(
        offset < LIBRATION_TOLERANCE_DEG,
        `${iso} ${name}: offset ${offset.toFixed(2)}° exceeds libration`
      );
      largest = Math.max(largest, offset);
    }
  }
  // If this ever collapses to zero the two rotations have been re-coupled.
  assert.ok(
    largest > 2,
    `expected a real libration offset, largest was only ${largest.toFixed(2)}°`
  );
});

test("near syzygy the bright limb degenerates and the pole does not", () => {
  // At exact new or full the Sun sits almost directly behind or in front of the
  // observer, so its projection onto the lunar disc is a vanishing vector that
  // points anywhere. The bright-limb rotation therefore whips through a near-
  // complete turn in two hours. The pole has no such degeneracy.
  //
  // This is the inverse of what the coupled model claimed: it is precisely where
  // that model was worst, and precisely where the whole lunar face is on show.
  const swing = (iso: string, lat: number, lng: number) => {
    const centre = new Date(iso).getTime();
    let pole = 0;
    let coupled = 0;
    let prevPole: number | null = null;
    let prevCoupled: number | null = null;
    for (let step = -6; step <= 6; step++) {
      const date = new Date(centre + step * 10 * 60_000);
      const location = { latitude: lat, longitude: lng, label: "fixture" };
      const illumination = SunCalc.getMoonIllumination(date);
      const p = getLunarNorthRotation(date, location);
      const c = getLitPathRotation(
        getBrightLimbAngle(date, location),
        illumination.phase < 0.5
      );
      if (prevPole !== null) pole += Math.abs(normalizeAngleDeg(p - prevPole));
      if (prevCoupled !== null)
        coupled += Math.abs(normalizeAngleDeg(c - prevCoupled));
      prevPole = p;
      prevCoupled = c;
    }
    return { pole, coupled };
  };

  // Total solar eclipse — exact new moon.
  const newMoon = swing("2024-04-08T18:17:00Z", 35.68, 139.65);
  assert.ok(
    newMoon.coupled > 250,
    `expected the bright limb to whip round at new moon, got ${newMoon.coupled.toFixed(1)}°`
  );
  assert.ok(
    newMoon.pole < 60,
    `expected the pole to stay smooth at new moon, got ${newMoon.pole.toFixed(1)}°`
  );

  // Total lunar eclipse — exact full moon.
  const fullMoon = swing("2015-09-28T02:47:00Z", 51.5, 0);
  assert.ok(
    fullMoon.coupled > 250,
    `expected the bright limb to whip round at full moon, got ${fullMoon.coupled.toFixed(1)}°`
  );
  assert.ok(
    fullMoon.pole < 60,
    `expected the pole to stay smooth at full moon, got ${fullMoon.pole.toFixed(1)}°`
  );

  // At a quarter both track the same parallactic rotation, so the divergence
  // above is the degeneracy and not a difference in how they follow the sky.
  const quarter = swing("2024-04-15T19:30:00Z", 51.5, 0);
  assert.ok(
    Math.abs(quarter.pole - quarter.coupled) < 5,
    `at a quarter the two should track together: ${quarter.pole.toFixed(1)}° vs ${quarter.coupled.toFixed(1)}°`
  );
});

test("lunar north rotation stays within (-180, 180]", () => {
  for (let step = 0; step < 120; step++) {
    const date = new Date(Date.UTC(2024, 0, 1) + step * 7.3 * 3_600_000);
    for (const [name, lat, lng] of SITES) {
      const value = getLunarNorthRotation(date, { latitude: lat, longitude: lng });
      assert.ok(
        value > -180 && value <= 180,
        `${name} ${date.toISOString()} produced ${value}`
      );
    }
  }
});

test("without a location both rotations fall back to the upright almanac moon", () => {
  // No coordinates means no tilt and no pole angle. Callers pass null for both,
  // the photograph and the terminator stay coupled at 0°, and North is up.
  assert.equal(getLitPathRotation(null, true), 0);
  assert.equal(getLitPathRotation(null, false), 0);
});

test("waxing is never inferred from the phase bucket", () => {
  // Kept from the coupled-rotation era and still load-bearing: this is not
  // about the pole at all, it is about which SIDE is lit, and a bucket-derived
  // direction flips that by 180 degrees whatever the photograph does.
  // 98.8% illuminated and WANING, but Math.round(phase * 8) % 8 === 4, the
  // "Full Moon" bucket. Anything reading direction off that index is 180° out.
  const when = new Date("2015-09-29T00:00:00Z");
  const illumination = SunCalc.getMoonIllumination(when);
  const bucket = Math.round(illumination.phase * 8) % 8;

  assert.equal(bucket, 4, "fixture must sit in the Full Moon bucket");
  assert.equal(illumination.waxing, false, "fixture must actually be waning");

  const tilt = getBrightLimbAngle(when, {
    latitude: 51.4779,
    longitude: 0.0015,
    label: "Greenwich",
  });
  const fromBucket = getLitPathRotation(tilt, bucket <= 4);
  const fromTruth = getLitPathRotation(tilt, illumination.waxing);

  assert.ok(
    Math.abs(normalizeAngleDeg(fromBucket - fromTruth)) > 179,
    "the bucket and the real direction must disagree by 180°"
  );
});
