import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EYE_DIAGONAL_FOV_DEG,
  eyeFieldOfView,
  groundOpacity,
  groundRegion,
  airmass,
  moonSkyLight,
} from "../skyView";
import { makeCameraBasis, projectVector } from "../skySphere";
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

test("a level view puts the horizon across the middle and the ground below it", () => {
  const cam = makeCameraBasis(180, 0, 60, W);
  const g = groundRegion(cam, W, H)!;
  assert.ok(g);
  const ys = g.points.filter((_, i) => i % 2 === 1);
  assert.ok(Math.abs(Math.min(...ys) - H / 2) < 1e-6);
  assert.equal(Math.max(...ys), H);
  assert.ok(g.edge && Math.abs(g.edge.y - H / 2) < 1e-6 && g.edge.ny > 0.999, "ground lies down the screen");
});

test("the ground's edge sits exactly on the projected horizon", () => {
  const cam = makeCameraBasis(97, 23, 40, W);
  const g = groundRegion(cam, W, H)!;
  const p = projectVector([Math.sin(97 * Math.PI / 180), Math.cos(97 * Math.PI / 180), 0], cam, W, H)!;
  assert.ok(Math.abs(p.y - g.edge!.y) < 1e-6, "the horizon straight ahead is where the edge is");
});

test("looking straight up shows no ground, straight down shows only ground", () => {
  assert.equal(groundRegion(makeCameraBasis(0, 89, 60, W), W, H), null);
  const down = groundRegion(makeCameraBasis(0, -89, 60, W), W, H)!;
  assert.equal(down.points.length, 8, "the whole screen");
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
