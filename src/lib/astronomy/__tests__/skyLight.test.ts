import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bvToKelvin,
  ksAirmass,
  moonIntensity,
  moonSkyBrightness,
  darkSkyBrightness,
  milkyWayContrast,
  twilightClearance,
  adapt,
  DARK_SKY_NL,
} from "../skyLight";
import { getSolarSystemSky, angularRadiusDeg } from "../skyBodies";
import catalog from "@/data/bsc.json";
import type { Star } from "@/types";

const STARS = catalog as Star[];

test("B-V gives the sun's temperature and runs hot to cool", () => {
  assert.ok(Math.abs(bvToKelvin(0.65) - 5780) < 80, `${bvToKelvin(0.65)}`);
  assert.ok(Math.abs(bvToKelvin(0) - 10100) < 200);
  for (let bv = -0.3; bv < 1.9; bv += 0.1) assert.ok(bvToKelvin(bv + 0.1) < bvToKelvin(bv));
});

test("the catalogue carries measured colours for the stars that have them", () => {
  const bv = (name: string) => STARS.find((s) => s.proper === name)!.bv!;
  assert.ok(bv("Betelgeuse") > 1.7, "Betelgeuse is red");
  assert.ok(bv("Rigel") < 0, "Rigel is blue");
  assert.ok(bv("Antares") > 1.7);
  assert.ok(bvToKelvin(bv("Rigel")) > 10000 && bvToKelvin(bv("Betelgeuse")) < 3600);
  assert.ok(STARS.filter((s) => s.bv != null).length > 8000);
});

test("a full moon is far brighter than twice a quarter moon", () => {
  assert.ok(moonIntensity(0) / moonIntensity(90) > 7);
});

test("a full moon at 45 degrees floods the sky and buries the Milky Way", () => {
  const full = moonSkyBrightness(0, 45, 45, 45);
  assert.ok(full > 1000 && full < 20000, `${full} nL`);
  const contrast = milkyWayContrast(darkSkyBrightness(45), full);
  assert.ok(contrast < 0.1, `${contrast}`);
  assert.equal(moonSkyBrightness(0, 95, 45, 45), 0, "no moonlight with the moon set");
  assert.ok(moonSkyBrightness(90, 45, 45, 45) < full / 5, "a quarter moon is much kinder");
  assert.ok(moonSkyBrightness(0, 45, 45, 10) > moonSkyBrightness(0, 45, 45, 90), "brightest near the moon");
});

test("the dark sky brightens toward the horizon, and airmass is one overhead", () => {
  assert.equal(ksAirmass(0), 1);
  assert.equal(darkSkyBrightness(0), DARK_SKY_NL);
  assert.ok(darkSkyBrightness(80) > darkSkyBrightness(40));
});

test("the Milky Way only comes out after astronomical twilight", () => {
  assert.equal(twilightClearance(-6), 0);
  assert.equal(twilightClearance(-12), 0);
  assert.equal(twilightClearance(-18), 1);
  assert.ok(twilightClearance(-15) > 0 && twilightClearance(-15) < 1);
});

test("the eye adapts to light fast and to dark slowly", () => {
  const darker = adapt(0, 1, 500);
  const lighter = adapt(1, 0, 500);
  assert.ok(darker < 0.25, "half a second into the dark is still mostly blind");
  assert.ok(lighter < 0.1, "half a second into light is already adjusted");
});

test("bodies carry their true sizes", () => {
  const sky = getSolarSystemSky(new Date(Date.UTC(2024, 0, 15, 22)), { latitude: 51.48, longitude: 0 });
  const r = (b: { radiusKm: number; distanceAu: number }) => angularRadiusDeg(b.radiusKm, b.distanceAu) * 3600;
  assert.ok(r(sky.sun!) > 940 && r(sky.sun!) < 980, "the sun is about 16 arcminutes across its radius");
  assert.ok(r(sky.moon!) > 850 && r(sky.moon!) < 1010, "and so is the moon");
  const jupiter = sky.planets.find((p) => p.id === "jupiter")!;
  assert.ok(r(jupiter) > 14 && r(jupiter) < 25.5, "Jupiter is tens of arcseconds");
  const saturn = sky.planets.find((p) => p.id === "saturn")!;
  assert.ok(saturn.ringTiltDeg != null && Math.abs(saturn.ringTiltDeg) < 27.5);
  assert.ok(jupiter.pole && saturn.pole, "resolved discs know which way is north");
  assert.ok(jupiter.flattening > 0.06);
});

test("the sphere's matrix takes any star back to its catalogue position", async () => {
  const { buildSkySphere } = await import("../skySphere");
  const sphere = buildSkySphere(STARS, { latitude: 24.86, longitude: 67.0 }, new Date(Date.UTC(2026, 9, 16, 20)), 6.2);
  const M = sphere.toEquatorial;
  const byHr = new Map(STARS.map((s) => [s.hr, s]));
  for (let i = 0; i < sphere.count; i += 97) {
    const v = [sphere.vec[i * 3], sphere.vec[i * 3 + 1], sphere.vec[i * 3 + 2]];
    const e = [0, 1, 2].map((r) => M[r * 3] * v[0] + M[r * 3 + 1] * v[1] + M[r * 3 + 2] * v[2]);
    const s = byHr.get(sphere.hr[i])!;
    const d = Math.PI / 180;
    // Compared as coordinates: acos of a dot product near 1 has no precision left.
    const ra = Math.atan2(e[1], e[0]) / d;
    const dec = Math.asin(Math.max(-1, Math.min(1, e[2]))) / d;
    const off = Math.hypot((((ra - s.ra + 540) % 360) - 180) * Math.cos(s.dec * d), dec - s.dec);
    assert.ok(off < 0.001, `HR ${s.hr} lands ${off.toFixed(5)} degrees off`);
  }
});

test("bright stars carry their colour bin and faint ones are white", async () => {
  const { starTint, STAR_TINT_KELVIN } = await import("../skyLight");
  const betelgeuse = STARS.find((s) => s.proper === "Betelgeuse")!;
  const rigel = STARS.find((s) => s.proper === "Rigel")!;
  assert.equal(STAR_TINT_KELVIN[starTint(betelgeuse.bv, betelgeuse.mag) - 1], 3300);
  assert.ok(STAR_TINT_KELVIN[starTint(rigel.bv, rigel.mag) - 1] >= 9500, "Rigel is blue-white");
  assert.equal(starTint(1.8, 5.5), 0, "too faint for the eye to see a colour");
  assert.equal(starTint(undefined, 1), 0, "no measurement, no colour");
});

test("stars near the horizon are dimmed by the air", async () => {
  const { buildSkySphere, projectSphere, makeCameraBasis } = await import("../skySphere");
  const sphere = buildSkySphere(STARS, { latitude: 24.86, longitude: 67.0 }, new Date(Date.UTC(2026, 9, 16, 20)), 6.2);
  const cam = makeCameraBasis(180, 4, 20, 400);
  const out = new Float32Array(sphere.count * 3);
  const zenith = { x: 0, y: 0, z: 1 };
  const clear = projectSphere(sphere, cam, 400, 860, out, 6.2, zenith);
  const hazy = projectSphere(sphere, cam, 400, 860, out, 6.2, zenith, undefined, 0.172);
  assert.ok(hazy < clear * 0.7, `${hazy} of ${clear} stars survive near the horizon`);
});
