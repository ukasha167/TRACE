import { test } from "node:test";
import assert from "node:assert/strict";
import {
  lookDirectionFromEuler,
  normalizeDeg,
  angleDelta,
  smoothAngle,
  updateNorthOffset,
  lookDirectionFromSensors,
  smoothVector,
  expectedUpInDeviceFrame,
  gravitySignFromEuler,
  deviceBasisFromSensors,
  lookVector,
  lookAngles,
  angularVelocityToWorld,
  integrateGyro,
  blendToward,
  cameraAxesFromBasis,
  cameraAxesFromAngles,
  rollFromAxes,
} from "@/lib/astronomy/attitude";

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

test("smoothAngle crosses the 0/360 seam without spinning", () => {
  const out = smoothAngle(359, 1, 0.5);
  assert.ok(out > 359.5 || out < 0.5, `expected to cross the seam, got ${out}`);
});

test("smoothAngle converges toward the target", () => {
  let a = 0;
  for (let i = 0; i < 200; i++) a = smoothAngle(a, 90, 0.2);
  assert.ok(Math.abs(angleDelta(a, 90)) < 0.01, `converged to ${a}`);
});

test("north offset snaps on first fix then moves slowly", () => {
  const first = updateNorthOffset(null, 10, 100);
  assert.equal(first, 90, "first reading should snap, not ease in");

  // A noisy compass spike must barely move a well-established offset.
  const nudged = updateNorthOffset(90, 10, 160, 0.05);
  assert.ok(
    Math.abs(angleDelta(nudged, 90)) < 4,
    `a 60-degree spike moved the offset by ${angleDelta(nudged, 90)}`
  );
});

test("normalizeDeg wraps both directions", () => {
  assert.equal(normalizeDeg(-1), 359);
  assert.equal(normalizeDeg(721), 1);
});

test("the north offset is frozen while the device is turning", () => {
  // The regression guard for dead horizontal panning. Turning fast must NOT
  // move the offset, or it cancels the very rotation the user is making.
  const held = updateNorthOffset(90, 10, 200, 60);
  assert.equal(held, 90, "offset must be held while turning quickly");

  // Standing still, it re-anchors as before.
  const moved = updateNorthOffset(90, 10, 200, 0);
  assert.notEqual(moved, 90, "offset should track while still");
});

test("a simulated turn is not cancelled by the offset", () => {
  // Turn 90 degrees over 60 frames with a compass that lags badly, and assert
  // the resulting view azimuth actually sweeps ~90 degrees.
  let offset: number | null = 0;
  let compass = 0;
  const startView = normalizeDeg(0 + (offset ?? 0));

  for (let f = 1; f <= 60; f++) {
    const relAz = f * 1.5;                 // 90 degrees over 60 frames
    const speed = 1.5 * 60;                // deg/s — clearly "turning"
    compass += 0.3;                        // compass lags far behind
    offset = updateNorthOffset(offset, relAz, compass, speed);
  }

  const endView = normalizeDeg(90 + (offset ?? 0));
  const swept = Math.abs(angleDelta(endView, startView));
  assert.ok(
    swept > 85,
    `a 90-degree turn only swept ${swept.toFixed(1)} degrees of view`
  );
});

// ---- Absolute orientation from raw gravity + magnetic field ----

/**
 * Device frame: +X right, +Y toward the top of the screen, +Z out of the screen.
 * At rest the accelerometer reports the reaction to gravity, i.e. world "up"
 * expressed in device coordinates.
 *
 * Magnetic field in the northern hemisphere points north AND down into the
 * ground: world (0, cos dip, -sin dip) with X=East, Y=North, Z=Up.
 */
const DIP = 45 * D;
const MC = Math.cos(DIP);
const MS = Math.sin(DIP);

test("upright phone with its back to the north reads NORTH", () => {
  // device: x -> East, y -> Up, z -> South
  const gravity = { x: 0, y: 1, z: 0 };
  const magnetic = { x: 0, y: -MS, z: -MC };
  const l = lookDirectionFromSensors(gravity, magnetic)!;
  assert.ok(l !== null);
  assert.ok(Math.abs(angleDelta(l.relativeAzimuthDeg, 0)) < 1e-6, `az ${l.relativeAzimuthDeg}`);
  assert.ok(Math.abs(l.altitudeDeg) < 1e-6, `alt ${l.altitudeDeg}`);
});

test("upright phone with its back to the EAST reads EAST, not west", () => {
  // The exact reported bug: the app showed west when the phone faced east.
  // device: x -> South, y -> Up, z -> West
  const gravity = { x: 0, y: 1, z: 0 };
  const magnetic = { x: -MC, y: -MS, z: 0 };
  const l = lookDirectionFromSensors(gravity, magnetic)!;
  assert.ok(
    Math.abs(angleDelta(l.relativeAzimuthDeg, 90)) < 1e-6,
    `expected 90 (east), got ${l.relativeAzimuthDeg}`
  );
});

test("upright phone with its back to the WEST reads WEST", () => {
  // device: x -> North, y -> Up, z -> East
  const gravity = { x: 0, y: 1, z: 0 };
  const magnetic = { x: MC, y: -MS, z: 0 };
  const l = lookDirectionFromSensors(gravity, magnetic)!;
  assert.ok(
    Math.abs(angleDelta(l.relativeAzimuthDeg, 270)) < 1e-6,
    `expected 270 (west), got ${l.relativeAzimuthDeg}`
  );
});

test("east and west are 180 apart, so the mirror bug cannot come back", () => {
  const g = { x: 0, y: 1, z: 0 };
  const east = lookDirectionFromSensors(g, { x: -MC, y: -MS, z: 0 })!;
  const west = lookDirectionFromSensors(g, { x: MC, y: -MS, z: 0 })!;
  assert.ok(
    Math.abs(Math.abs(angleDelta(east.relativeAzimuthDeg, west.relativeAzimuthDeg)) - 180) < 1e-6,
    "east and west must be opposite"
  );
});

test("phone flat on a table, screen up, looks DOWN", () => {
  const l = lookDirectionFromSensors({ x: 0, y: 0, z: 1 }, { x: 0, y: MC, z: -MS })!;
  assert.ok(Math.abs(l.altitudeDeg + 90) < 1e-6, `alt ${l.altitudeDeg}`);
});

test("tilting an upright phone back raises the look altitude", () => {
  // Rock the phone 45 degrees toward the sky about its x-axis.
  const c = Math.cos(45 * D), s = Math.sin(45 * D);
  const l = lookDirectionFromSensors({ x: 0, y: c, z: -s }, { x: 0, y: -MS * c - MC * s, z: MS * s - MC * c })!;
  assert.ok(l.altitudeDeg > 30, `expected a raised view, got ${l.altitudeDeg}`);
});

test("degenerate input returns null instead of a confident wrong answer", () => {
  assert.equal(lookDirectionFromSensors({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }), null);
  assert.equal(lookDirectionFromSensors({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 0 }), null);
  // Magnetic field parallel to gravity: no horizontal reference exists.
  assert.equal(lookDirectionFromSensors({ x: 0, y: 1, z: 0 }, { x: 0, y: 5, z: 0 }), null);
});

test("vector smoothing has no 360-degree seam", () => {
  // Smoothing vectors instead of angles is the point: sweep through north and
  // assert the smoothed heading never jumps by a large amount between steps.
  let v: any = null;
  let prev: number | null = null;
  for (let deg = -30; deg <= 30; deg += 2) {
    const r = deg * D;
    // Magnetic field for an upright phone rotated `deg` about vertical.
    const sample = { x: -MC * Math.sin(r), y: -MS, z: -MC * Math.cos(r) };
    v = smoothVector(v, sample, 0.5);
    const l = lookDirectionFromSensors({ x: 0, y: 1, z: 0 }, v)!;
    if (prev !== null) {
      assert.ok(
        Math.abs(angleDelta(l.relativeAzimuthDeg, prev)) < 10,
        `heading jumped ${angleDelta(l.relativeAzimuthDeg, prev)} degrees crossing north`
      );
    }
    prev = l.relativeAzimuthDeg;
  }
});

// ---- Accelerometer sign detection ----

test("world up in device coords is +Z for a level, face-up phone", () => {
  const up = expectedUpInDeviceFrame(0, 0);
  assert.ok(Math.abs(up.x) < 1e-9 && Math.abs(up.y) < 1e-9);
  assert.ok(Math.abs(up.z - 1) < 1e-9, `expected +Z, got ${up.z}`);
});

test("world up in device coords is +Y for an upright phone", () => {
  const up = expectedUpInDeviceFrame(90 * D, 0);
  assert.ok(Math.abs(up.y - 1) < 1e-9, `expected +Y, got ${up.y}`);
});

test("gravity sign detection catches an inverted accelerometer", () => {
  // Upright phone: world up is device +Y.
  const beta = 90 * D, gamma = 0;
  assert.equal(gravitySignFromEuler({ x: 0, y: 9.81, z: 0 }, beta, gamma), 1);
  assert.equal(gravitySignFromEuler({ x: 0, y: -9.81, z: 0 }, beta, gamma), -1);

  // Flat face-up: world up is device +Z.
  assert.equal(gravitySignFromEuler({ x: 0, y: 0, z: 9.81 }, 0, 0), 1);
  assert.equal(gravitySignFromEuler({ x: 0, y: 0, z: -9.81 }, 0, 0), -1);
});

test("ambiguous or dead readings report 0 rather than guessing", () => {
  assert.equal(gravitySignFromEuler({ x: 0, y: 0, z: 0 }, 0, 0), 0);
  // Perpendicular to the expected up: no information.
  assert.equal(gravitySignFromEuler({ x: 9.81, y: 0, z: 0 }, 0, 0), 0);
});

test("correcting the sign restores the right direction end to end", () => {
  // An upright phone with its back to the EAST, but an accelerometer that
  // reports the opposite sign. Uncorrected it must read west; corrected, east.
  const flipped = { x: 0, y: -1, z: 0 };
  const magnetic = { x: -MC, y: -MS, z: 0 };

  const wrong = lookDirectionFromSensors(flipped, magnetic)!;
  assert.ok(
    Math.abs(angleDelta(wrong.relativeAzimuthDeg, 90)) > 90,
    "an inverted accelerometer should indeed give a badly wrong heading"
  );

  const sign = gravitySignFromEuler(flipped, 90 * D, 0);
  assert.equal(sign, -1);
  const corrected = lookDirectionFromSensors(
    { x: flipped.x * sign, y: flipped.y * sign, z: flipped.z * sign },
    magnetic
  )!;
  assert.ok(
    Math.abs(angleDelta(corrected.relativeAzimuthDeg, 90)) < 1e-6,
    `corrected heading should be east, got ${corrected.relativeAzimuthDeg}`
  );
  assert.ok(Math.abs(corrected.altitudeDeg) < 1e-6, "and level");
});

// ---- Complementary filter ----

test("lookVector and lookAngles round-trip", () => {
  for (const [az, alt] of [[0, 0], [90, 30], [270, -45], [180, 80], [45, -10]]) {
    const back = lookAngles(lookVector(az, alt));
    assert.ok(Math.abs(angleDelta(back.relativeAzimuthDeg, az)) < 1e-9, `az ${az}`);
    assert.ok(Math.abs(back.altitudeDeg - alt) < 1e-9, `alt ${alt}`);
  }
});

test("integrating rotation about world up sweeps azimuth counter-clockwise", () => {
  // Right-handed rotation about +Up is counter-clockwise seen from above, so a
  // north-facing view must swing toward WEST (azimuth decreasing).
  let L = lookVector(0, 0);
  const omega = { x: 0, y: 0, z: 0.5 }; // rad/s about world up
  for (let i = 0; i < 100; i++) L = integrateGyro(L, omega, 0.01);
  const a = lookAngles(L);
  // 0.5 rad/s for 1s = 0.5 rad = 28.6 degrees, toward west => azimuth ~331.
  assert.ok(Math.abs(a.altitudeDeg) < 1e-6, "altitude must not drift");
  assert.ok(
    Math.abs(angleDelta(a.relativeAzimuthDeg, -28.65)) < 0.5,
    `expected ~331 degrees, got ${a.relativeAzimuthDeg}`
  );
});

test("integration keeps the look vector on the unit sphere", () => {
  let L = lookVector(37, 12);
  const omega = { x: 0.3, y: -0.2, z: 0.7 };
  for (let i = 0; i < 5000; i++) L = integrateGyro(L, omega, 0.016);
  assert.ok(Math.abs(Math.hypot(L.x, L.y, L.z) - 1) < 1e-9, "must stay normalised");
});

test("device angular velocity rotates into the world frame", () => {
  // Upright phone facing north: device +Y is world up, so a device-Y rotation
  // must appear as a world-Z (yaw) rotation.
  const basis = deviceBasisFromSensors(
    { x: 0, y: 1, z: 0 },
    { x: 0, y: -MS, z: -MC }
  )!;
  const w = angularVelocityToWorld(basis, { x: 0, y: 1, z: 0 });
  assert.ok(Math.abs(w.z - 1) < 1e-6, `expected yaw, got ${JSON.stringify(w)}`);
  assert.ok(Math.abs(w.x) < 1e-6 && Math.abs(w.y) < 1e-6);
});

test("the filter follows the gyro fast and still cancels its drift", () => {
  // Gyro reports a steady turn that is a little wrong (drift). The absolute
  // reading is correct but arrives noisy. The blend must end up near truth.
  const truthAz = 90;
  const absolute = lookVector(truthAz, 0);
  let L = lookVector(0, 0);

  for (let i = 0; i < 400; i++) {
    // Slightly-too-fast gyro: this is the drift the blend has to absorb.
    L = integrateGyro(L, { x: 0, y: 0, z: -0.006 }, 0.016);
    const noisy = {
      x: absolute.x + (Math.sin(i * 12.9) * 0.05),
      y: absolute.y + (Math.cos(i * 7.7) * 0.05),
      z: absolute.z + (Math.sin(i * 3.1) * 0.05),
    };
    L = blendToward(L, noisy, 0.03);
  }

  const a = lookAngles(L);
  assert.ok(
    Math.abs(angleDelta(a.relativeAzimuthDeg, truthAz)) < 6,
    `drift not cancelled: ended at ${a.relativeAzimuthDeg}, truth ${truthAz}`
  );
});

test("blending never produces a non-unit vector", () => {
  let L = lookVector(10, 5);
  for (let i = 0; i < 500; i++) {
    L = blendToward(L, { x: Math.sin(i), y: Math.cos(i), z: 0.2 }, 0.1);
    assert.ok(Math.abs(Math.hypot(L.x, L.y, L.z) - 1) < 1e-9);
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

test("device basis yields a camera that agrees with the look direction", () => {
  const gravity = { x: 0, y: 1, z: 0 };
  const magnetic = { x: -MC, y: -MS, z: 0 }; // upright, back to the east
  const basis = deviceBasisFromSensors(gravity, magnetic)!;
  const cam = cameraAxesFromBasis(basis);
  const look = lookDirectionFromSensors(gravity, magnetic)!;

  const fromAxes = lookAngles(cam.forward);
  assert.ok(
    Math.abs(angleDelta(fromAxes.relativeAzimuthDeg, look.relativeAzimuthDeg)) < 1e-6,
    "camera forward must match the look direction"
  );
  assert.ok(Math.abs(fromAxes.altitudeDeg - look.altitudeDeg) < 1e-6);
  // Upright phone: screen up really is world up.
  assert.ok(Math.abs(cam.up.z - 1) < 1e-6, `screen up should be world up, got ${cam.up.z}`);
});

test("rolling the device to landscape moves world up onto the screen's x axis", () => {
  // Upright, back east: device +Y is world up.
  const upright = cameraAxesFromBasis(
    deviceBasisFromSensors({ x: 0, y: 1, z: 0 }, { x: -MC, y: -MS, z: 0 })!
  );
  assert.ok(Math.abs(upright.up.z - 1) < 1e-6);

  // Same heading, rolled 90 degrees: gravity now reads along device -X.
  const landscape = cameraAxesFromBasis(
    deviceBasisFromSensors({ x: -1, y: 0, z: 0 }, { x: MS, y: -MC, z: 0 })!
  );
  assert.ok(
    Math.abs(landscape.up.z) < 1e-6,
    `landscape screen-up should not be world up, got ${landscape.up.z}`
  );
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
