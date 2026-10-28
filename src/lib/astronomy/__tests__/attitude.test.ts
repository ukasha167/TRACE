import { test } from "node:test";
import assert from "node:assert/strict";
import {
  lookDirectionFromEuler,
  normalizeDeg,
  angleDelta,
  lookVector,
  lookAngles,
  cameraAxesFromEuler,
  cameraAxesFromAngles,
  rollFromAxes,
  COREMOTION_YAW_TO_ALPHA,
  sensorBlendPerFrame,
  sensorBlend,
  sensorTimeConstantMs,
  smoothAxes,
  type Vec3,
  type WorldCameraAxes,
} from "@/lib/astronomy/attitude";
import {
  cameraBasisFromAxes,
  projectVector,
  pointAlong,
} from "@/lib/astronomy/skySphere";

const D = Math.PI / 180;

/**
 * These pin the orientation model against physical reasoning about how a phone
 * is actually held. They are the regression guard for the "target never leaves
 * the screen" bug, which two decoupled scalars produced and which no amount of
 * smoothing would have fixed.
 */

test("upright phone facing north looks at the northern horizon", () => {
  const l = lookDirectionFromEuler(0, 90 * D, 0);
  assert.ok(Math.abs(l.altitudeDeg) < 1e-6, `altitude ${l.altitudeDeg}`);
  assert.ok(Math.abs(angleDelta(l.relativeAzimuthDeg, 0)) < 1e-6, `azimuth ${l.relativeAzimuthDeg}`);
});

test("phone flat on a table, screen up, looks straight DOWN", () => {
  // The camera is on the back, so screen-up means pointing at the ground.
  // This is the case the user reported as broken: it must NOT show the sky.
  const l = lookDirectionFromEuler(0, 0, 0);
  assert.ok(Math.abs(l.altitudeDeg + 90) < 1e-6, `altitude ${l.altitudeDeg}`);
});

test("phone flat, screen DOWN, looks straight up at the zenith", () => {
  const l = lookDirectionFromEuler(0, 180 * D, 0);
  assert.ok(Math.abs(l.altitudeDeg - 90) < 1e-6, `altitude ${l.altitudeDeg}`);
});

test("tilting an upright phone up raises the look altitude", () => {
  const horizon = lookDirectionFromEuler(0, 90 * D, 0);
  const tilted = lookDirectionFromEuler(0, 135 * D, 0);
  assert.ok(
    tilted.altitudeDeg > horizon.altitudeDeg + 40,
    `expected a large rise, got ${horizon.altitudeDeg} -> ${tilted.altitudeDeg}`
  );
});

test("yaw turns the view by the same amount", () => {
  // Upright phone, rotated 90 degrees about the vertical: azimuth must follow.
  const north = lookDirectionFromEuler(0, 90 * D, 0);
  const turned = lookDirectionFromEuler(90 * D, 90 * D, 0);
  const swept = Math.abs(angleDelta(turned.relativeAzimuthDeg, north.relativeAzimuthDeg));
  assert.ok(Math.abs(swept - 90) < 1e-6, `swept ${swept} degrees, expected 90`);
});

test("a full yaw sweep visits every azimuth exactly once", () => {
  // Guards the actual complaint: turning the phone must move the sky past you,
  // not leave the same patch on screen.
  const seen = new Set<number>();
  for (let a = 0; a < 360; a += 10) {
    const l = lookDirectionFromEuler(a * D, 90 * D, 0);
    seen.add(Math.round(l.relativeAzimuthDeg / 10) * 10 % 360);
  }
  assert.equal(seen.size, 36, `expected 36 distinct headings, got ${seen.size}`);
});

test("roll does not change where the phone points when held upright", () => {
  // Rolling about the viewing axis rotates the image, not the direction.
  const a = lookDirectionFromEuler(0, 90 * D, 0);
  const b = lookDirectionFromEuler(0, 90 * D, 30 * D);
  assert.ok(
    Math.abs(a.altitudeDeg - b.altitudeDeg) < 1e-9,
    `roll changed altitude: ${a.altitudeDeg} vs ${b.altitudeDeg}`
  );
});

test("look direction is always a valid altitude", () => {
  for (let al = 0; al < 360; al += 37) {
    for (let be = -180; be <= 180; be += 31) {
      for (let ga = -90; ga <= 90; ga += 29) {
        const l = lookDirectionFromEuler(al * D, be * D, ga * D);
        assert.ok(
          l.altitudeDeg >= -90.0001 && l.altitudeDeg <= 90.0001,
          `altitude out of range: ${l.altitudeDeg}`
        );
        assert.ok(
          l.relativeAzimuthDeg >= 0 && l.relativeAzimuthDeg < 360,
          `azimuth out of range: ${l.relativeAzimuthDeg}`
        );
      }
    }
  }
});

// ---- Angle helpers ----

test("angleDelta takes the short way round", () => {
  assert.equal(angleDelta(1, 359), 2);
  assert.equal(angleDelta(359, 1), -2);
  assert.equal(angleDelta(180, 0), 180);
});

test("normalizeDeg wraps both directions", () => {
  assert.equal(normalizeDeg(-1), 359);
  assert.equal(normalizeDeg(721), 1);
});

test("lookVector and lookAngles round-trip", () => {
  for (const [az, alt] of [[0, 0], [90, 30], [270, -45], [180, 80], [45, -10]]) {
    const back = lookAngles(lookVector(az, alt));
    assert.ok(Math.abs(angleDelta(back.relativeAzimuthDeg, az)) < 1e-9, `az ${az}`);
    assert.ok(Math.abs(back.altitudeDeg - alt) < 1e-9, `alt ${alt}`);
  }
});

// ---- Roll-aware camera ----

test("camera axes are orthonormal", () => {
  const dot = (a: any, b: any) => a.x * b.x + a.y * b.y + a.z * b.z;
  for (const roll of [0, 30, 90, -120, 180]) {
    const c = cameraAxesFromAngles(37, 20, roll);
    for (const v of [c.forward, c.right, c.up]) {
      assert.ok(Math.abs(Math.hypot(v.x, v.y, v.z) - 1) < 1e-9, "unit length");
    }
    assert.ok(Math.abs(dot(c.forward, c.right)) < 1e-9, "forward perp right");
    assert.ok(Math.abs(dot(c.forward, c.up)) < 1e-9, "forward perp up");
    assert.ok(Math.abs(dot(c.right, c.up)) < 1e-9, "right perp up");
  }
});

test("roll rotates the frame about the view direction, not the view itself", () => {
  const a = cameraAxesFromAngles(90, 10, 0);
  const b = cameraAxesFromAngles(90, 10, 90);
  // The direction you are looking must not change.
  assert.ok(Math.abs(a.forward.x - b.forward.x) < 1e-9);
  assert.ok(Math.abs(a.forward.y - b.forward.y) < 1e-9);
  assert.ok(Math.abs(a.forward.z - b.forward.z) < 1e-9);
  // But the frame must. At 90 degrees of roll, right becomes the old up.
  assert.ok(Math.abs(b.right.x - a.up.x) < 1e-9, "right should rotate into up");
  assert.ok(Math.abs(b.right.z - a.up.z) < 1e-9);
});

test("a rolled phone tilts the horizon on screen", () => {
  // The reported bug: in landscape the horizon must run up the screen, not
  // across it. With 90 degrees of roll, the world-up axis moves out of the
  // camera's up axis and into its right axis.
  const level = cameraAxesFromAngles(0, 0, 0);
  const rolled = cameraAxesFromAngles(0, 0, 90);
  assert.ok(Math.abs(level.up.z - 1) < 1e-9, "level: screen up is world up");
  assert.ok(Math.abs(rolled.up.z) < 1e-9, "rolled: screen up is no longer world up");
  assert.ok(Math.abs(Math.abs(rolled.right.z) - 1) < 1e-9, "rolled: world up moved to screen right");
});

test("roll is zero for a level camera and matches what was applied", () => {
  for (const applied of [0, 25, -40, 90]) {
    const axes = cameraAxesFromAngles(120, 15, applied);
    const measured = rollFromAxes(axes);
    assert.ok(
      Math.abs(angleDelta(measured, applied)) < 1e-6,
      `applied ${applied}, measured ${measured}`
    );
  }
});

test("roll is reported as zero when looking straight up", () => {
  assert.equal(rollFromAxes(cameraAxesFromAngles(0, 90, 0)), 0);
});

// ---------------------------------------------------------------------------
// ROLL AND SCREEN ROTATION
// ---------------------------------------------------------------------------

/**
 * WHICH WAY THE SKY TURNS WHEN THE PHONE ROLLS.
 *
 * This pins the fact the immersive view's label rotation depends on. Labels are
 * drawn in screen space, so text with no transform is already level with the
 * SCREEN. To keep it level with the HORIZON it must turn the same way the
 * horizon turns, and the renderer had it turning the opposite way.
 *
 * Positive roll rotates the sky CLOCKWISE on screen (y-down), so a label that
 * should follow the horizon rotates by +rollDeg. See app/sky/[id].tsx.
 */
test("positive roll turns the sky clockwise on screen", () => {
  const AZ = 0; // facing north
  const ALT = 0; // at the horizon
  // A point 10 degrees above the view centre: straight up the screen at roll 0.
  const above = lookVector(AZ, 10);

  const screenAngle = (rollDeg: number) => {
    const axes = cameraAxesFromAngles(AZ, ALT, rollDeg);
    const cam = cameraBasisFromAxes(axes, 60, 400);
    const pt = projectVector([above.x, above.y, above.z], cam, 400, 800);
    assert.ok(pt, "the test point must be in front of the camera");
    // Screen bearing, clockwise from straight up (y is down).
    return (Math.atan2(pt.x - 200, 400 - pt.y) * 180) / Math.PI;
  };

  assert.ok(Math.abs(screenAngle(0)) < 0.01, "at roll 0 the point sits straight up");

  for (const roll of [15, 30, -25, 60]) {
    const bearing = screenAngle(roll);
    assert.ok(
      Math.abs(bearing - roll) < 0.01,
      `roll ${roll}° should move the point to a screen bearing of ${roll}°, got ${bearing.toFixed(2)}°`
    );
  }
});

test("rollFromAxes inverts cameraAxesFromAngles", () => {
  // The renderer reads roll back out of the axes it was handed, so the two must
  // round-trip exactly or the label correction is applied at the wrong size.
  for (const [az, alt, roll] of [
    [0, 0, 0],
    [0, 0, 35],
    [120, 25, -40],
    [270, -30, 80],
    [45, 60, 15],
  ] as const) {
    const back = rollFromAxes(cameraAxesFromAngles(az, alt, roll));
    assert.ok(
      Math.abs(angleDelta(back, roll)) < 1e-6,
      `az ${az} alt ${alt} roll ${roll}: read back ${back.toFixed(4)}`
    );
  }
});

// ---------------------------------------------------------------------------
// THE FUSED ATTITUDE: W3C ANGLES TO A CAMERA, AND EACH PLATFORM'S ANGLES
// ---------------------------------------------------------------------------

const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const near = (a: Vec3, b: Vec3, eps = 1e-9) =>
  Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps && Math.abs(a.z - b.z) < eps;

/** Every W3C triple the sweeps below use, beta past vertical included. */
function* poses(): Generator<[number, number, number]> {
  for (let a = -170; a < 180; a += 47) {
    for (let b = -170; b < 180; b += 41) {
      for (let g = -85; g < 90; g += 34) yield [a * D, b * D, g * D];
    }
  }
}

/** R = Rz(a).Rx(b).Ry(g) as WebKit writes it out, row by row (device to world). */
function zxy(a: number, b: number, g: number): number[] {
  const cX = Math.cos(b), sX = Math.sin(b);
  const cY = Math.cos(g), sY = Math.sin(g);
  const cZ = Math.cos(a), sZ = Math.sin(a);
  return [
    cZ * cY - sZ * sX * sY, -cX * sZ, cY * sZ * sX + cZ * sY,
    cY * sZ + cZ * sX * sY, cZ * cX, sZ * sY - cZ * cY * sX,
    -cX * sY, sX, cX * cY,
  ];
}

test("the camera's forward is the direction lookDirectionFromEuler gives", () => {
  for (const [a, b, g] of poses()) {
    const cam = lookAngles(cameraAxesFromEuler(a, b, g).forward);
    const look = lookDirectionFromEuler(a, b, g);
    assert.ok(Math.abs(cam.altitudeDeg - look.altitudeDeg) < 1e-9);
    if (Math.abs(look.altitudeDeg) < 89) {
      assert.ok(Math.abs(angleDelta(cam.relativeAzimuthDeg, look.relativeAzimuthDeg)) < 1e-6);
    }
  }
});

test("the camera frame is orthonormal and right-handed for every attitude", () => {
  for (const [a, b, g] of poses()) {
    const c = cameraAxesFromEuler(a, b, g);
    for (const v of [c.forward, c.right, c.up]) assert.ok(Math.abs(Math.hypot(v.x, v.y, v.z) - 1) < 1e-9);
    assert.ok(Math.abs(dot(c.forward, c.up)) < 1e-9);
    assert.ok(Math.abs(dot(c.forward, c.right)) < 1e-9);
    // right = forward x up, as device +X = (-Z) x (+Y).
    const f = c.forward, u = c.up;
    assert.ok(near(c.right, { x: f.y * u.z - f.z * u.y, y: f.z * u.x - f.x * u.z, z: f.x * u.y - f.y * u.x }));
  }
});

test("an upright phone has world up at the top of its screen", () => {
  const c = cameraAxesFromEuler(0, 90 * D, 0);
  assert.ok(near(c.up, { x: 0, y: 0, z: 1 }), JSON.stringify(c.up));
  assert.ok(near(c.forward, { x: 0, y: 1, z: 0 }), "looking north");
  assert.ok(near(c.right, { x: 1, y: 0, z: 0 }), "right edge east");
});

test("alpha turns counterclockwise, so -90 faces EAST and +90 faces WEST", () => {
  // The mirror bug: read as a compass bearing, alpha shows west for east.
  const east = lookAngles(cameraAxesFromEuler(-90 * D, 90 * D, 0).forward);
  const west = lookAngles(cameraAxesFromEuler(90 * D, 90 * D, 0).forward);
  assert.ok(Math.abs(angleDelta(east.relativeAzimuthDeg, 90)) < 1e-9, `east read ${east.relativeAzimuthDeg}`);
  assert.ok(Math.abs(angleDelta(west.relativeAzimuthDeg, 270)) < 1e-9, `west read ${west.relativeAzimuthDeg}`);
});

test("a phone on its side, top to the north, is a landscape view west with the horizon vertical", () => {
  // Flat, then turned 90 degrees about its own long axis: right edge down.
  const c = cameraAxesFromEuler(0, 0, 90 * D);
  const look = lookAngles(c.forward);
  assert.ok(Math.abs(look.altitudeDeg) < 1e-9);
  assert.ok(Math.abs(angleDelta(look.relativeAzimuthDeg, 270)) < 1e-9);
  assert.ok(Math.abs(Math.abs(rollFromAxes(c)) - 90) < 1e-6, `roll ${rollFromAxes(c)}`);
});

test("an upright iPhone with its right edge to the east looks north", () => {
  // CoreMotion's frame: X magnetic north, Y west, Z up. The right edge east
  // is the reference X axis turned -90 degrees about Z, so yaw is -90.
  const c = cameraAxesFromEuler(-90 * D + COREMOTION_YAW_TO_ALPHA, 90 * D, 0);
  const look = lookAngles(c.forward);
  assert.ok(Math.abs(look.altitudeDeg) < 1e-9);
  assert.ok(Math.abs(angleDelta(look.relativeAzimuthDeg, 0)) < 1e-9, `read ${look.relativeAzimuthDeg}`);
});

test("CoreMotion's own matrix, moved to east-north-up, is the camera of yaw + 90", () => {
  for (const [yaw, pitch, roll] of poses()) {
    const R = zxy(yaw, pitch, roll); // device to CoreMotion's (north, west, up)
    // A column in (north, west, up) is (-west, north, up) in east-north-up.
    const col = (j: number): Vec3 => ({ x: -R[3 + j], y: R[j], z: R[6 + j] });
    const c = cameraAxesFromEuler(yaw + COREMOTION_YAW_TO_ALPHA, pitch, roll);
    const f = col(2);
    assert.ok(near(c.right, col(0)), "right");
    assert.ok(near(c.up, col(1)), "up");
    assert.ok(near(c.forward, { x: -f.x, y: -f.y, z: -f.z }), "forward");
  }
});

test("Android's getOrientation angles, as expo sends them, rebuild the same camera", () => {
  for (const [a, b, g] of poses()) {
    const R = zxy(a, b, g); // what TYPE_ROTATION_VECTOR's matrix holds
    // SensorManager.getOrientation, then DeviceMotionModule.kt's signs.
    const azimuth = Math.atan2(R[1], R[4]);
    const pitch = Math.asin(-R[7]);
    const roll = Math.atan2(-R[6], R[8]);
    const sent = cameraAxesFromEuler(-azimuth, -pitch, roll);
    const truth = cameraAxesFromEuler(a, b, g);
    // getOrientation folds beta into [-90, 90] and takes the other Euler
    // branch past vertical; the rotation, and so the camera, is the same.
    assert.ok(near(sent.forward, truth.forward, 1e-9), `forward at ${[a, b, g].map((x) => x / D)}`);
    assert.ok(near(sent.up, truth.up, 1e-9), `up at ${[a, b, g].map((x) => x / D)}`);
  }
});

// ---------------------------------------------------------------------------
// STELLARIUM'S SMOOTHING
// ---------------------------------------------------------------------------

test("the per-frame coefficient is Stellarium's: 0.05 at 5 degrees, 0.2 at 130", () => {
  assert.equal(sensorBlendPerFrame(5), 0.05);
  assert.equal(sensorBlendPerFrame(0.1), 0.05, "clamped below 5");
  assert.ok(Math.abs(sensorBlendPerFrame(130) - 0.2) < 1e-12);
  assert.ok(Math.abs(sensorBlendPerFrame(400) - 0.2) < 1e-12, "clamped above 130");
  assert.ok(Math.abs(sensorBlendPerFrame(67.5) - 0.125) < 1e-12, "linear between");
});

test("one 60 Hz frame is Stellarium's step, and two 120 Hz frames make the same step", () => {
  const fov = 20;
  assert.ok(Math.abs(sensorBlend(fov, 1000 / 60) - sensorBlendPerFrame(fov)) < 1e-12);
  const half = sensorBlend(fov, 1000 / 120);
  const twoFrames = 1 - (1 - half) * (1 - half);
  assert.ok(Math.abs(twoFrames - sensorBlendPerFrame(fov)) < 1e-12);
  assert.equal(sensorBlend(fov, 0), 0);
  assert.equal(sensorBlend(fov, 500), sensorBlend(fov, 100), "a dropped frame is capped");
});

test("the average is heavier zoomed in than wide", () => {
  assert.ok(sensorTimeConstantMs(5) > sensorTimeConstantMs(20));
  assert.ok(sensorTimeConstantMs(20) > sensorTimeConstantMs(65));
  assert.ok(sensorTimeConstantMs(65) > sensorTimeConstantMs(100));
});

/** Unit vector `deg` degrees off `axes.forward`, toward `axes.right` and `axes.up`. */
function nudged(axes: WorldCameraAxes, dxDeg: number, dyDeg: number): WorldCameraAxes {
  const tx = Math.tan(dxDeg * D), ty = Math.tan(dyDeg * D);
  const f = axes.forward, r = axes.right, u = axes.up;
  const v = { x: f.x + r.x * tx + u.x * ty, y: f.y + r.y * tx + u.y * ty, z: f.z + r.z * tx + u.z * ty };
  const n = Math.hypot(v.x, v.y, v.z);
  const fwd = { x: v.x / n, y: v.y / n, z: v.z / n };
  return smoothAxes(axes, { forward: fwd, up: axes.up, right: axes.right }, 1);
}

test("a hand at rest is held still: tremor on the screen is cut to under a fifth", () => {
  // A phone held at the eye's field, shaking by up to 0.2 degrees at 8 to 13
  // Hz, the band of a resting hand's tremor, read at 120 Hz. The same shake
  // straight onto the screen is the jitter reported.
  const rest = cameraAxesFromEuler(0, 110 * D, 0);
  let shown = rest;
  let inSq = 0, outSq = 0, n = 0;
  for (let i = 0; i < 1200; i++) {
    const dx = 0.2 * Math.sin(i * 0.52) * Math.cos(i * 0.09);
    const dy = 0.2 * Math.cos(i * 0.6) * Math.sin(i * 0.07);
    shown = smoothAxes(shown, nudged(rest, dx, dy), sensorBlend(20, 1000 / 120));
    if (i < 240) continue; // let it settle
    const off = Math.acos(Math.min(1, dot(shown.forward, rest.forward))) / D;
    inSq += dx * dx + dy * dy;
    outSq += off * off;
    n++;
  }
  const ratio = Math.sqrt(outSq / n) / Math.sqrt(inSq / n);
  assert.ok(ratio < 0.2, `tremor passed through at ${(ratio * 100).toFixed(0)}%`);
});

test("a real turn is followed to the end", () => {
  // Turn 60 degrees at 90 degrees a second, then hold. One second after the
  // hand stops, the view is within a tenth of a degree of where it points.
  let shown = cameraAxesFromAngles(0, 30, 0);
  const dt = 1000 / 120;
  let t = 0;
  for (; t < 2000; t += dt) {
    const az = Math.min(60, (90 * t) / 1000);
    shown = smoothAxes(shown, cameraAxesFromAngles(az, 30, 0), sensorBlend(20, dt));
  }
  const end = lookAngles(shown.forward);
  assert.ok(Math.abs(angleDelta(end.relativeAzimuthDeg, 60)) < 0.1, `stopped at ${end.relativeAzimuthDeg}`);
  assert.ok(Math.abs(end.altitudeDeg - 30) < 0.01, `altitude ${end.altitudeDeg}`);
});

test("easing keeps the frame orthonormal, and a full step lands on the target", () => {
  let shown = cameraAxesFromEuler(0.3, 1.2, -0.4);
  for (let i = 0; i < 300; i++) {
    const target = cameraAxesFromEuler(Math.sin(i * 0.05) * 2, 1.2 + Math.cos(i * 0.07), Math.sin(i * 0.11));
    shown = smoothAxes(shown, target, 0.15);
    for (const v of [shown.forward, shown.right, shown.up]) assert.ok(Math.abs(Math.hypot(v.x, v.y, v.z) - 1) < 1e-9);
    assert.ok(Math.abs(dot(shown.forward, shown.up)) < 1e-9);
    assert.ok(Math.abs(dot(shown.forward, shown.right)) < 1e-9);
  }
  const target = cameraAxesFromEuler(1, 2, 0.5);
  const landed = smoothAxes(shown, target, 1);
  assert.ok(near(landed.forward, target.forward) && near(landed.up, target.up) && near(landed.right, target.right));
});

test("easing across the zenith goes over the top, not round the side", () => {
  // From 80 degrees up facing north to 80 degrees up facing south. An average
  // of the azimuth, which is Stellarium's, would sweep through east or west.
  let shown = cameraAxesFromAngles(0, 80, 0);
  const target = cameraAxesFromAngles(180, 80, 0);
  let highest = 0;
  for (let i = 0; i < 200; i++) {
    shown = smoothAxes(shown, target, 0.05);
    assert.ok(Math.abs(shown.forward.x) < 1e-9, `swung ${shown.forward.x} east`);
    highest = Math.max(highest, lookAngles(shown.forward).altitudeDeg);
  }
  assert.ok(highest > 89, `never passed the zenith, highest ${highest}`);
});

// ---------------------------------------------------------------------------
// A FIGURE'S LINES GROWING OUT OF THEIR STARS
// ---------------------------------------------------------------------------

test("a growing line starts on its first star, ends on its second, and stays on their great circle", () => {
  const a = lookVector(80, 10), b = lookVector(95, 25);
  const pts = new Float32Array([a.x, a.y, a.z, b.x, b.y, b.z]);
  const out = { x: 0, y: 0, z: 0 };
  pointAlong(pts, 0, 0, out);
  assert.ok(near(out, a, 1e-6));
  pointAlong(pts, 0, 1, out);
  assert.ok(near(out, b, 1e-6));
  // The plane of the great circle through a and b.
  const nrm = { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
  let last = -1;
  for (let k = 0.1; k < 1; k += 0.1) {
    pointAlong(pts, 0, k, out);
    assert.ok(Math.abs(Math.hypot(out.x, out.y, out.z) - 1) < 1e-6, "on the sphere");
    assert.ok(Math.abs(dot(out, nrm)) < 1e-6, "on the great circle");
    const fromA = Math.acos(Math.min(1, dot(out, a)));
    assert.ok(fromA > last, "moves steadily away from the first star");
    last = fromA;
  }
});
