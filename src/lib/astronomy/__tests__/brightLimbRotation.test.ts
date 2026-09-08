import { test } from "node:test";
import assert from "node:assert/strict";
import * as SunCalc from "suncalc";
import * as Astronomy from "astronomy-engine";
import {
  getBrightLimbAngle,
  getMoonLimbRotation,
  getMoonTextureRotation,
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
 * PROOF OF TEXTURE ROTATION, AGAINST AN INDEPENDENT IMPLEMENTATION
 *
 * getMoonTextureRotation rotates the lunar photograph, so what it must agree
 * with is the on-screen direction of the Moon's own north pole. That comes from
 * astronomy-engine's RotationAxis, a separately written codebase that shares no
 * arithmetic with SunCalc or with brightLimb.ts.
 *
 *   P = position angle of the lunar north pole from celestial north, eastward
 *   q = parallactic angle
 *   P - q = pole angle from the zenith, eastward
 *   clockwise screen rotation = -(P - q)
 *
 * THE BUG THIS PINS. Both callers used to compute `isWaxing = phaseIndex <= 4`.
 * Buckets 0 and 4 straddle their syzygy, so half of every "Full Moon" bucket is
 * waning. Greenwich on 2015-09-28 is a 98.8% WANING moon sitting in bucket 4,
 * and the bucket-derived value was 171.6 degrees out: the photograph rendered
 * upside down. Reykjavik 2019-01-05 is the same failure at new moon, 119.8 out.
 *
 * THE RESIDUAL, MEASURED. On the correct path the disagreement runs 2.9 to 8.4
 * degrees across ordinary phases. That is libration, not sloppiness: rotating
 * the texture and the terminator as one body assumes the bright limb sits
 * exactly 90 degrees from the lunar pole in position angle, which is true to
 * the sub-solar latitude (1.54 degrees) but is then shifted by optical
 * libration of up to 8 degrees. The code comment used to claim 1.6 degrees;
 * that was the sub-solar term alone.
 *
 * NEAR EXACT NEW MOON IT BREAKS DOWN COMPLETELY, and that is fine. At an
 * elongation of 1.3 degrees (Reykjavik, 2019-01-05) the vector from the Moon
 * toward the Sun projects to almost nothing on the sky plane, so its direction
 * is set by residuals: topocentric parallax alone moves the bright-limb angle
 * 28.7 degrees there, and the pole relation is 60 degrees out. Nothing is lit
 * at 0.01 percent illumination, so there is no surface orientation to get
 * wrong. The tolerance below therefore covers phases a person can actually see.
 */
function lunarNorthScreenRotation(when: Date, lat: number, lon: number): number {
  const t = Astronomy.MakeTime(when);
  const obs = new Astronomy.Observer(lat, lon, 0);
  const eq = Astronomy.Equator(Astronomy.Body.Moon, t, obs, true, true);
  const alpha = eq.ra * 15 * DEG;
  const delta = eq.dec * DEG;

  // RotationAxis reports the pole in J2000; the Moon's apparent place above is
  // of-date, so the pole has to be rotated into the same frame before the two
  // can be differenced.
  const ax = Astronomy.RotationAxis(Astronomy.Body.Moon, t);
  const poleEqd = Astronomy.RotateVector(
    Astronomy.Rotation_EQJ_EQD(t),
    Astronomy.VectorFromSphere(new Astronomy.Spherical(ax.dec, ax.ra * 15, 1), t)
  );
  const ps = Astronomy.SphereFromVector(poleEqd);
  const alphaP = ps.lon * DEG;
  const deltaP = ps.lat * DEG;

  const P =
    Math.atan2(
      Math.cos(deltaP) * Math.sin(alphaP - alpha),
      Math.sin(deltaP) * Math.cos(delta) -
        Math.cos(deltaP) * Math.sin(delta) * Math.cos(alphaP - alpha)
    ) / DEG;

  const lst = (Astronomy.SiderealTime(t) + lon / 15) * 15 * DEG;
  const H = lst - alpha;
  const q =
    Math.atan2(
      Math.sin(H),
      Math.tan(lat * DEG) * Math.cos(delta) - Math.sin(delta) * Math.cos(H)
    ) / DEG;

  return normalizeAngleDeg(-(P - q));
}

/** Measured envelope across ordinary phases, rounded up from 8.4. */
const LIBRATION_TOLERANCE_DEG = 12;

const TEXTURE_CASES: [string, string, number, number][] = [
  // The screenshot case: a 99.9% waxing moon over Lahore. Measured error 3.4°.
  ["Lahore, near-full waxing", "2004-10-28T00:00:00+05:00", 31.5204, 74.3587],
  // Bucket 4 while WANING. This is the one that was 171.6 degrees wrong.
  ["Greenwich, near-full waning", "2015-09-29T00:00:00Z", 51.4779, 0.0015],
  ["Quito, young crescent", "2023-03-25T00:00:00-05:00", -0.18, -78.47],
  ["Sydney, waning gibbous", "2020-06-11T00:00:00+10:00", -33.87, 151.21],
  ["Lahore, waning crescent", "2004-04-16T00:00:00+05:00", 31.5204, 74.3587],
];

for (const [name, iso, lat, lon] of TEXTURE_CASES) {
  test(`texture rotation matches astronomy-engine's lunar pole: ${name}`, () => {
    const when = new Date(iso);
    const illumination = SunCalc.getMoonIllumination(when);
    const tilt = getBrightLimbAngle(when, {
      latitude: lat,
      longitude: lon,
      label: name,
    });

    const ours = getMoonTextureRotation(tilt, illumination.waxing);
    const truth = lunarNorthScreenRotation(when, lat, lon);
    const error = Math.abs(normalizeAngleDeg(ours - truth));

    assert.ok(
      error < LIBRATION_TOLERANCE_DEG,
      `${name}: rotation ${ours.toFixed(1)}° vs pole ${truth.toFixed(1)}°, off by ${error.toFixed(1)}°`
    );
  });
}

test("the pole relation degenerates at exact new moon, where nothing is lit", () => {
  // Reykjavik, 2019-01-05. Elongation 1.29°, illumination 0.013%.
  const when = new Date("2019-01-06T00:00:00Z");
  const illumination = SunCalc.getMoonIllumination(when);
  assert.ok(illumination.fraction < 0.001, "fixture must be essentially new");

  const tilt = getBrightLimbAngle(when, {
    latitude: 64.13,
    longitude: -21.9,
    label: "Reykjavik",
  });
  const ours = getMoonTextureRotation(tilt, illumination.waxing);
  const truth = lunarNorthScreenRotation(when, 64.13, -21.9);
  const error = Math.abs(normalizeAngleDeg(ours - truth));

  // Recorded rather than tolerated: if a future change makes this small, the
  // texture path has become topocentric and the tolerance above can tighten.
  assert.ok(
    error > LIBRATION_TOLERANCE_DEG,
    `expected the near-new case to be far out, got ${error.toFixed(1)}°`
  );
});

test("waxing is never inferred from the phase bucket", () => {
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
  const fromBucket = getMoonTextureRotation(tilt, bucket <= 4);
  const fromTruth = getMoonTextureRotation(tilt, illumination.waxing);

  assert.ok(
    Math.abs(normalizeAngleDeg(fromBucket - fromTruth)) > 179,
    "the bucket and the real direction must disagree by 180°"
  );
});
