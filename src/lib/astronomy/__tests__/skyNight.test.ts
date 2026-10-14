import { test } from "node:test";
import assert from "node:assert/strict";
import {
  siderealCamera,
  siderealDelta,
  nightWindow,
  eclipseShadow,
  horizonVector,
} from "@/lib/astronomy/skyNight";
import { equatorialToHorizontal } from "@/lib/astronomy/skyTransform";
import { cameraAxesFromAngles } from "@/lib/astronomy/attitude";

const greenwich = { latitude: 51.4779, longitude: 0 };
const sydney = { latitude: -33.8688, longitude: 151.2093 };
const STARS = [
  { name: "Sirius", ra: 101.2871, dec: -16.7161 },
  { name: "Vega", ra: 279.2347, dec: 38.7837 },
  { name: "Polaris", ra: 37.9529, dec: 89.2641 },
  { name: "Canopus", ra: 95.9879, dec: -52.6957 },
];

const dot = (a: number[], b: { x: number; y: number; z: number }) => a[0] * b.x + a[1] * b.y + a[2] * b.z;

test("turning the camera by sidereal time shows the sky of the later instant", () => {
  // The scrubber never moves a star. This proves that looking at the t0 sphere
  // through the turned camera is the same as recomputing every star at t.
  for (const place of [greenwich, sydney]) {
    const t0 = new Date(Date.UTC(2015, 8, 27, 22));
    for (const hours of [-5, 1.5, 4, 7.25]) {
      const t = new Date(t0.getTime() + hours * 3_600_000);
      const axes = cameraAxesFromAngles(143, 31, 0);
      const turned = siderealCamera(axes, place.latitude, siderealDelta(t0, t));
      for (const s of STARS) {
        const h0 = equatorialToHorizontal(s.ra, s.dec, place.latitude, place.longitude, t0);
        const h1 = equatorialToHorizontal(s.ra, s.dec, place.latitude, place.longitude, t);
        const v0 = horizonVector(h0.altitudeDeg, h0.azimuthDeg);
        const v1 = horizonVector(h1.altitudeDeg, h1.azimuthDeg);
        for (const k of ["forward", "right", "up"] as const) {
          const want = dot(v1, axes[k]);
          const got = dot(v0, turned[k]);
          assert.ok(Math.abs(want - got) < 1e-4, `${s.name} ${k} at ${hours}h: ${got} vs ${want}`);
        }
      }
    }
  }
});

test("a night window runs from before sunset to after sunrise and holds its anchor", () => {
  const midnight = new Date(Date.UTC(2015, 8, 28, 0));
  const w = nightWindow(midnight, greenwich);
  assert.ok(w.sunset && w.sunrise);
  assert.ok(w.start < w.sunset! && w.end > w.sunrise!);
  assert.ok(w.start <= midnight && w.end >= midnight);
  // Greenwich in late September: roughly twelve hours of dark.
  const dark = (w.sunrise!.getTime() - w.sunset!.getTime()) / 3_600_000;
  assert.ok(dark > 11 && dark < 13, `dark for ${dark} h`);
});

test("from the afternoon, the window is the night ahead", () => {
  const afternoon = new Date(Date.UTC(2015, 8, 27, 14));
  const w = nightWindow(afternoon, greenwich);
  assert.ok(w.sunset! > afternoon);
});

test("the 2015 eclipse is total at its peak, from Greenwich", () => {
  const e = eclipseShadow(new Date(Date.UTC(2015, 8, 28, 2, 47)), greenwich);
  assert.ok(e, "the moon should be in the shadow");
  assert.equal(e!.phase, "total");
  // The umbra is about 0.7° across the sky at the moon's distance.
  assert.ok(e!.umbraRadiusDeg > 0.6 && e!.umbraRadiusDeg < 0.8, `umbra ${e!.umbraRadiusDeg}`);
});

test("before the eclipse and on an ordinary night the moon is clear of the shadow", () => {
  assert.equal(eclipseShadow(new Date(Date.UTC(2015, 8, 27, 22)), greenwich), null);
  assert.equal(eclipseShadow(new Date(Date.UTC(2015, 8, 10, 0)), greenwich), null);
});

test("partway in, the eclipse is partial", () => {
  // Umbral first contact was 01:07 UTC and totality began 02:11.
  assert.equal(eclipseShadow(new Date(Date.UTC(2015, 8, 28, 1, 40)), greenwich)?.phase, "partial");
});

test("a moment in the night is said against midnight, sunset or sunrise, never a clock", async () => {
  const { describeNightMoment } = await import("@/lib/astronomy/skyNight");
  const { formatDuration } = await import("@/lib/astronomy/nightFacts");
  const midnight = new Date(Date.UTC(2015, 8, 28, 0));
  const sunset = new Date(Date.UTC(2015, 8, 27, 17, 48));
  const sunrise = new Date(Date.UTC(2015, 8, 28, 5, 55));
  const say = (h: number, m: number, day = 28) =>
    describeNightMoment(new Date(Date.UTC(2015, 8, day, h, m)), midnight, sunset, sunrise, formatDuration);
  assert.equal(say(0, 0), "Midnight");
  assert.equal(say(18, 30, 27), "42 min after sunset");
  assert.equal(say(1, 30), "1 h 30 min after midnight");
  assert.equal(say(5, 40), "15 min before sunrise");
});
