import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EYE_DIAGONAL_FOV_DEG,
  eyeFieldOfView,
  groundOpacity,
  groundBounds,
  type ScreenRect,
  landscapeLight,
  LANDSCAPE_NIGHT,
  moonGlare,
  airmass,
  moonSkyLight,
} from "../skyView";
import { makeCameraBasis, projectVector, type CameraBasis } from "../skySphere";
import { glide, settled } from "../../glide";

const W = 393;
const H = 852;

test("the normal lens is 46.8 degrees across the diagonal", () => {
  assert.ok(Math.abs(EYE_DIAGONAL_FOV_DEG - 46.79) < 0.01);
});

test("the eye's field keeps the diagonal whatever the screen's shape", () => {
  for (const [w, h] of [[W, H], [H, W], [600, 600]]) {
    const fov = eyeFieldOfView(w, h);
    const focal = w / 2 / Math.tan((fov * Math.PI) / 360);
    const diagonal = (2 * Math.atan(Math.hypot(w, h) / 2 / focal) * 180) / Math.PI;
    assert.ok(Math.abs(diagonal - EYE_DIAGONAL_FOV_DEG) < 1e-9, `${w}x${h}`);
  }
  assert.ok(Math.abs(eyeFieldOfView(W, H) - 20.6) < 0.1, "a portrait phone opens at about 20.6 degrees across");
});

test("the ground is solid looking up and gone looking down", () => {
  assert.equal(groundOpacity(30), 1);
  assert.equal(groundOpacity(10), 1);
  assert.equal(groundOpacity(-2), 0);
  assert.equal(groundOpacity(-40), 0);
  assert.ok(groundOpacity(0) > 0 && groundOpacity(0) < 0.15, "nearly clear at the horizon");
  for (let a = -5; a < 12; a += 0.5) assert.ok(groundOpacity(a + 0.5) >= groundOpacity(a), "never flickers");
});

// The landscape panorama's top row (src/data/landscape.json).
const TREELINE = 18.6;
const rect = (): ScreenRect => ({ x: NaN, y: NaN, width: NaN, height: NaN });

/** The altitude of the ray through screen point (x, y), as the landscape shader rebuilds it. */
function altitudeAt(cam: CameraBasis, x: number, y: number): number {
  const ox = x - W / 2, oy = y - H / 2;
  const dx = cam.focal * cam.fx + ox * cam.rx - oy * cam.ux;
  const dy = cam.focal * cam.fy + ox * cam.ry - oy * cam.uy;
  const dz = cam.focal * cam.fz + ox * cam.rz - oy * cam.uz;
  return (Math.asin(dz / Math.hypot(dx, dy, dz)) * 180) / Math.PI;
}

/** makeCameraBasis turned about its own forward axis, as a phone held at an angle turns it. */
function rolled(cam: CameraBasis, rollDeg: number): CameraBasis {
  const c = Math.cos((rollDeg * Math.PI) / 180), s = Math.sin((rollDeg * Math.PI) / 180);
  return {
    ...cam,
    rx: cam.rx * c + cam.ux * s, ry: cam.ry * c + cam.uy * s, rz: cam.rz * c + cam.uz * s,
    ux: cam.ux * c - cam.rx * s, uy: cam.uy * c - cam.ry * s, uz: cam.uz * c - cam.rz * s,
  };
}

test("a level view's ground runs the full width, from the bottom edge to above the centre", () => {
  const r = rect();
  assert.ok(groundBounds(makeCameraBasis(180, 0, 60, W), W, H, TREELINE, r));
  assert.equal(r.x, 0);
  assert.equal(r.width, W);
  assert.equal(r.y + r.height, H);
  assert.ok(r.y > 0, "the top of the screen is sky, so the pass does not cover it");
  assert.ok(r.y < H / 2, "the treeline stands above the horizon, which is the centre line");
});

test("looking straight up shows no ground, straight down shows only ground", () => {
  const r = rect();
  assert.equal(groundBounds(makeCameraBasis(0, 89, 60, W), W, H, TREELINE, r), false);
  assert.ok(Number.isNaN(r.x), "the rectangle is left alone when there is no ground");
  assert.ok(groundBounds(makeCameraBasis(0, -89, 60, W), W, H, TREELINE, r));
  assert.deepEqual(r, { x: 0, y: 0, width: W, height: H });
});

test("no pixel below the treeline falls outside the ground's rectangle, at any angle, roll or zoom", () => {
  // A fixed sequence, so a failure names the same camera every run.
  let seed = 7;
  const next = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const r = rect();
  for (let n = 0; n < 150; n++) {
    const fov = [eyeFieldOfView(W, H), 46, 100][n % 3];
    const az = next() * 360, alt = next() * 178 - 89, roll = next() * 360 - 180;
    const cam = rolled(makeCameraBasis(az, alt, fov, W), roll);
    const any = groundBounds(cam, W, H, TREELINE, r);
    for (let y = 0; y <= H; y += 6) {
      for (let x = 0; x <= W; x += 6) {
        if (altitudeAt(cam, x, y) >= TREELINE) continue;
        const where = `az ${az.toFixed(1)} alt ${alt.toFixed(1)} roll ${roll.toFixed(1)} fov ${fov.toFixed(1)}, pixel ${x},${y}`;
        assert.ok(any, `ground missed entirely: ${where}`);
        assert.ok(x >= r.x - 1e-9 && x <= r.x + r.width + 1e-9 && y >= r.y - 1e-9 && y <= r.y + r.height + 1e-9, `outside the rectangle: ${where}`);
      }
    }
  }
});

test("the field is darkest on a moonless night and fully lit by a high sun", () => {
  assert.equal(landscapeLight(-30, -10, 1), LANDSCAPE_NIGHT);
  assert.equal(landscapeLight(85, -10, 0), 1);
  assert.ok(landscapeLight(-30, 60, 1) > landscapeLight(-30, 60, 0.1), "a full moon lights it more than a crescent");
  assert.ok(landscapeLight(0, -10, 0) > LANDSCAPE_NIGHT, "some light at sunset");
  for (let a = -20; a < 60; a += 1) assert.ok(landscapeLight(a + 1, -10, 0) >= landscapeLight(a, -10, 0), "rises with the sun");
});

test("a small full moon glares, a zoomed one is drawn as the shader made it", () => {
  const small = moonGlare(5, 1);
  assert.ok(small.alpha > 0.45 && small.exposure > 1.5);
  assert.ok(small.radius >= 26, "the glare does not shrink with the disc");
  const big = moonGlare(80, 1);
  assert.equal(big.alpha, 0);
  assert.equal(big.exposure, 1);
  assert.ok(moonGlare(5, 0.05).alpha < small.alpha / 3, "a thin crescent glares far less");
  assert.equal(moonGlare(5, 0).alpha, 0, "a new moon has no glare");
});

test("airmass is one overhead and finite on the horizon", () => {
  assert.ok(Math.abs(airmass(90) - 1) < 0.001);
  assert.ok(Math.abs(airmass(30) - 2) < 0.01);
  assert.ok(airmass(0) > 37 && airmass(0) < 39);
  assert.equal(airmass(-5), airmass(0));
});

test("an overhead moon is drawn as the shader made it, a low one goes orange", () => {
  const high = moonSkyLight(90, -30);
  assert.deepEqual([high.r, high.g, high.b].map((v) => +v.toFixed(6)), [1, 1, 1]);
  const low = moonSkyLight(5, -30);
  assert.ok(low.r > low.g && low.g > low.b, "blue goes first");
  assert.ok(low.b / low.r < 0.25, "a moon five degrees up is orange, not white");
  let last = 0;
  for (let alt = 1; alt <= 90; alt++) {
    const m = moonSkyLight(alt, -30);
    assert.ok(m.b / m.r >= last - 1e-12, "whiter the higher it climbs");
    last = m.b / m.r;
  }
});

test("daylight takes the moon down a quarter and no further", () => {
  const night = moonSkyLight(50, -20);
  const day = moonSkyLight(50, 30);
  assert.ok(Math.abs(day.g / night.g - 0.75) < 1e-9);
  assert.ok(Math.abs(moonSkyLight(0, -30).r - 0.35) < 1e-9, "the brightest channel never drops below the floor");
});

test("a moon under the horizon is not coloured by air it is not seen through", () => {
  const deep = moonSkyLight(-30, -30);
  assert.deepEqual([deep.r, deep.g, deep.b], [1, 1, 1]);
  let last = moonSkyLight(0, -30).b;
  for (let alt = -0.5; alt >= -12; alt -= 0.5) {
    const b = moonSkyLight(alt, -30).b;
    assert.ok(b >= last - 1e-12, "fades back to white, no jump at the horizon");
    last = b;
  }
});

test("the glide closes the same gap at 60 and 120 frames a second", () => {
  let a = 0, b = 0;
  for (let i = 0; i < 30; i++) a = glide(a, 1, 1000 / 60, 160);
  for (let i = 0; i < 60; i++) b = glide(b, 1, 1000 / 120, 160);
  assert.ok(Math.abs(a - b) < 1e-9);
  assert.ok(glide(0, 1, 5000, 160) <= 1, "a long frame never overshoots");
  assert.equal(glide(0.3, 1, 0, 160), 0.3);
  assert.ok(settled(0.99995, 1) && !settled(0.9, 1));
});
