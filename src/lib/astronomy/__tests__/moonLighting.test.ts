import test from "node:test";
import assert from "node:assert/strict";
import {
  phaseAngleDeg,
  lunarLambertL,
  sunDirection,
  terminatorSemiAxis,
  lunarLambertReflectance,
  earthshineTerm,
  earthshineGain,
  surfaceBrightness,
  EARTHSHINE_WRAP,
  EARTHSHINE_FLOOR,
} from "../moonLighting";
import { getLitPathRotation } from "../brightLimb";

/**
 * The shader replaced a two-arc path. These hold it to drawing the same moon.
 */

test("phase angle inverts the illuminated fraction", () => {
  assert.equal(phaseAngleDeg(1), 0); // full: sun behind the observer
  assert.equal(phaseAngleDeg(0), 180); // new
  assert.ok(Math.abs(phaseAngleDeg(0.5) - 90) < 1e-9); // quarter
  // f = (1 + cos g) / 2, round tripped.
  for (const f of [0.01, 0.17, 0.42, 0.63, 0.88, 0.999]) {
    const g = (phaseAngleDeg(f) * Math.PI) / 180;
    assert.ok(Math.abs((1 + Math.cos(g)) / 2 - f) < 1e-12);
  }
});

test("the shader's terminator is the same ellipse litMoonPath draws", () => {
  // litMoonPath uses b = r * |2f - 1|. The shader's terminator falls out of
  // N·L = 0 as an ellipse of semi-axis |cos g|, and cos g = 2f - 1. If these
  // ever diverge the phase is drawn two different ways in two places.
  for (const f of [0, 0.05, 0.25, 0.5, 0.75, 0.95, 1]) {
    const fromPath = Math.abs(2 * f - 1);
    const g = (phaseAngleDeg(f) * Math.PI) / 180;
    const fromShader = Math.abs(Math.cos(g));
    assert.ok(
      Math.abs(fromPath - fromShader) < 1e-12,
      `f=${f}: path ${fromPath} vs shader ${fromShader}`
    );
    assert.ok(Math.abs(terminatorSemiAxis(f) - fromPath) < 1e-12);
  }
});

test("the terminator is straight at the quarters and a full limb at syzygy", () => {
  assert.equal(terminatorSemiAxis(0.5), 0);
  assert.equal(terminatorSemiAxis(0), 1);
  assert.equal(terminatorSemiAxis(1), 1);
});

test("the sun direction is a unit vector whose z is the phase cosine", () => {
  for (const f of [0, 0.13, 0.5, 0.77, 1]) {
    for (const rot of [-170, -90, 0, 45, 130]) {
      const s = sunDirection(f, rot);
      const len = Math.hypot(s.x, s.y, s.z);
      assert.ok(Math.abs(len - 1) < 1e-12, `not unit at f=${f} rot=${rot}`);
      assert.ok(Math.abs(s.z - (2 * f - 1)) < 1e-12);
    }
  }
});

test("full moon puts the sun behind the observer, new moon behind the moon", () => {
  const full = sunDirection(1, 0);
  assert.ok(Math.abs(full.z - 1) < 1e-12);
  assert.ok(Math.hypot(full.x, full.y) < 1e-9);

  const now = sunDirection(0, 0);
  assert.ok(Math.abs(now.z + 1) < 1e-12);
});

test("the sun lands where getLitPathRotation aimed the bright limb", () => {
  // getLitPathRotation is the number the old path was rotated by, and the path
  // it rotated had its lit limb on +x. So after rotation the limb points along
  // (cos R, sin R) in Skia's y-down frame, and feeding the shader the same R
  // has to put the sun there too. Otherwise this is a change of phase
  // presentation rather than a change of rendering. Decisions 12 and 13.
  //
  // brightLimbAngleDeg is the limb's position angle from the zenith, so 0 means
  // the lit edge points straight up the screen, NOT to the right.
  // Compare directions, not magnitudes: the in-plane part of a unit sun vector
  // is only sin(g) long, so at a crescent it can never reach 1 no matter which
  // way it points. Which way it points is the thing under test.
  const inPlane = (f: number, rot: number) => {
    const s = sunDirection(f, rot);
    const m = Math.hypot(s.x, s.y);
    return { x: s.x / m, y: s.y / m };
  };

  const up = inPlane(0.25, getLitPathRotation(0, true));
  assert.ok(up.y < -0.999, `limb at the zenith should light the top, got y=${up.y}`);
  assert.ok(Math.abs(up.x) < 1e-9);

  const down = inPlane(0.25, getLitPathRotation(0, false));
  assert.ok(down.y > 0.999, `waning at zenith angle 0 lights the bottom, got y=${down.y}`);

  // psi = -brightLimbAngleDeg is clockwise from the zenith, so -90 points right.
  const right = inPlane(0.25, getLitPathRotation(-90, true));
  assert.ok(right.x > 0.999, `expected the sun on +x, got x=${right.x}`);

  // No location means no tilt to apply: the almanac orientation, lit on +x.
  const almanac = inPlane(0.25, getLitPathRotation(null, true));
  assert.ok(almanac.x > 0.999, `untilted moon should be lit on +x, got ${almanac.x}`);
});

test("Lunar-Lambert is 1 at full and clamped where the fit runs out", () => {
  assert.equal(lunarLambertL(0), 1);
  assert.ok(lunarLambertL(90) > 0 && lunarLambertL(90) < 1);
  // The cubic goes negative past its fitted range; it must not subtract light.
  assert.equal(lunarLambertL(180), 0);
  assert.ok(lunarLambertL(175) >= 0);
});

test("the full moon renders flat, which is the whole point of not using Lambert", () => {
  // At full, L is 1 and the sun is the view direction, so mu0 == mu and the
  // Lommel-Seeliger term is 2*mu/(2*mu) = 1 everywhere on the disc. A Lambert
  // sphere would fall from 1 at centre to 0 at the limb, which is the classic
  // wrong-looking moon.
  const L = lunarLambertL(0);
  for (const mu of [0.999, 0.8, 0.5, 0.2, 0.05]) {
    const r = lunarLambertReflectance(mu, mu, L);
    assert.ok(
      Math.abs(r - 1) < 1e-9,
      `full moon should be flat, got ${r} at mu=${mu}`
    );
  }
});

test("brightness falls to zero at the terminator without a step", () => {
  // The complaint the shader exists to answer is banding. Walk the lit side and
  // assert the curve is monotonic and that no neighbouring sample jumps: a
  // visible band is a discontinuity in this sequence.
  const f = 0.42;
  const g = phaseAngleDeg(f);
  const L = lunarLambertL(g);
  const sun = sunDirection(f, 0);

  let previous = Infinity;
  let biggestStep = 0;
  const N = 2000;
  for (let i = 0; i <= N; i++) {
    // Walk the surface by angle, not by x. Stepping x uniformly bunches the
    // samples at the limb, where z = sqrt(1 - x^2) turns over, and the sampling
    // artefact that produces looks exactly like the banding being tested for.
    const theta = (i / N) * Math.PI;
    const x = Math.cos(theta);
    const z = Math.sin(theta);
    const mu0 = x * sun.x + z * sun.z;
    const value = lunarLambertReflectance(mu0, z, L);
    if (i > 0) biggestStep = Math.max(biggestStep, Math.abs(value - previous));
    assert.ok(value <= previous + 1e-9, `not monotonic at i=${i}`);
    previous = value;
  }
  // Half a degree of arc per sample. A band visible on a phone is a step of
  // several percent; this catches anything above a fifth of one percent.
  assert.ok(biggestStep < 0.002, `discontinuity of ${biggestStep} across the disc`);
});

test("nothing on the unlit side receives light", () => {
  const f = 0.3;
  const L = lunarLambertL(phaseAngleDeg(f));
  const sun = sunDirection(f, 0);
  for (let i = 0; i <= 200; i++) {
    const x = -1 + (2 * i) / 200;
    const z = Math.sqrt(Math.max(0, 1 - x * x));
    const mu0 = x * sun.x + z * sun.z;
    if (mu0 < 0) {
      assert.equal(lunarLambertReflectance(mu0, z, L), 0);
    }
  }
});

test("earthshine reaches onto the sunlit side, so the two lights overlap", () => {
  // THE SEAM. Sunlight reaches exactly zero at mu0 = 0. If earthshine also
  // starts at mu0 = 0 there is a band across which neither light covers the
  // surface, and a dark line traces the terminator all the way round the disc.
  // That is what shipped: the gate was smoothstep(0.06, -0.06, mu0), so
  // earthshine was still zero everywhere the sunlit term had anything left.
  // Measured across a 42% moon, luminance ran 0.065 on the earthlit side, fell
  // to 0.035 at the crossing, and climbed back.
  assert.ok(earthshineTerm(0, 0.7) > 0, "nothing lights the terminator itself");
  assert.ok(
    earthshineTerm(EARTHSHINE_WRAP / 2, 0.7) > 0,
    "earthshine never reaches the sunlit side, so the lights meet at a seam"
  );

  // It still has to end somewhere. A wrap that ran the whole disc would be
  // ambient light, and ambient light on a sphere is the flat look this replaced.
  assert.equal(earthshineTerm(EARTHSHINE_WRAP + 0.01, 0.7), 0);
});

test("earthshine grades across the night side instead of filling it", () => {
  // The dark half used to be one constant, so it read as a coin pasted behind a
  // crescent. Measured on that build: luminance held between 0.062 and 0.067
  // across the entire unlit side of a 42% moon, with no gradient at all.
  //
  // Emission is held fixed, so this asks about the illumination alone.
  const mu = 0.7;
  let previous = -Infinity;
  for (let i = 0; i <= 200; i++) {
    const mu0 = -(i / 200); // terminator, out to the anti-solar point
    const value = earthshineTerm(mu0, mu);
    assert.ok(value > previous, `flat or falling at mu0 = ${mu0}`);
    previous = value;
  }

  // And the gradient is a gradient, not a rounding difference: the far side of
  // the night hemisphere is several times the brightness of the ground next to
  // the terminator, which is what makes it read as a surface curving away.
  assert.ok(earthshineTerm(-1, mu) > 4 * earthshineTerm(-0.1, mu));
});

test("earthshine limb-darkens, so the night side is a hemisphere", () => {
  // Same illumination, grazing emission. Without this the unlit side is a flat
  // plate with a hard rim; with it the silhouette rounds off.
  assert.ok(earthshineTerm(-0.8, 0.0) < earthshineTerm(-0.8, 1.0));
});

test("earthshine follows the Earth's phase, which is the Moon's inverted", () => {
  // A 2% moon hangs under a 98% Earth. That is the whole reason the ash-grey
  // disc is a thing anyone can see inside a thin crescent and not inside a
  // gibbous, and it is why this is a function of phase rather than a constant.
  assert.ok(earthshineGain(0.02) > earthshineGain(0.5));
  assert.ok(earthshineGain(0.5) > earthshineGain(0.98));
  assert.equal(earthshineGain(0), 1);

  // Floored, so a gibbous moon's night side never reaches the ground and the
  // disc keeps its silhouette against black. The one print decision here.
  assert.equal(earthshineGain(1), EARTHSHINE_FLOOR);
  assert.ok(earthshineGain(0.81) >= EARTHSHINE_FLOOR);
});

test("the sunlit side is never dimmed by the earthshine term", () => {
  // Earthshine is added, so it can only lift. The check that matters is that it
  // is small where the Sun is: a wrap wide enough to wash the lit crescent
  // would be flattening exactly the surface the photometry works hardest on.
  const f = 0.42;
  const L = lunarLambertL(phaseAngleDeg(f));
  const level = 0.075;
  const sunOnly = lunarLambertReflectance(0.9, 0.9, L);
  const both = surfaceBrightness(0.9, 0.9, L, level, f);
  assert.equal(both, sunOnly, "earthshine leaks onto full sunlight");
});
