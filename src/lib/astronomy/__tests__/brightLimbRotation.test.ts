import { test } from "node:test";
import assert from "node:assert/strict";
import * as SunCalc from "suncalc";
import {
  getBrightLimbAngle,
  getMoonLimbRotation,
  normalizeAngleDeg,
} from "@/lib/astronomy/brightLimb";

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
