/**
 * DEVICE ATTITUDE -> WHERE THE PHONE IS POINTED.
 *
 * THE BUG THIS REPLACES: an earlier revision took altitude from the `beta`
 * Euler angle alone and azimuth from the compass alone. Two decoupled scalars
 * are not an orientation. Roll was ignored entirely, and the compass heading
 * refers to a different device axis depending on how the phone is held, so the
 * pair never composed into a coherent direction. The practical symptom was that
 * a target stayed on screen no matter how the phone was turned.
 *
 * The fix is to do it properly: build the full rotation matrix from the W3C
 * ZXY Euler convention, and rotate the device's viewing axis into world space.
 *
 * FRAMES
 *   device: +X right, +Y toward the top of the screen, +Z out of the screen
 *           toward the user. The camera therefore looks along -Z.
 *   world:  +X east, +Y north, +Z up.
 *
 * R = Rz(alpha) . Rx(beta) . Ry(gamma), intrinsic, per the W3C
 * DeviceOrientation spec that both iOS and Android follow.
 */

const RAD = 180 / Math.PI;

export interface LookDirection {
  altitudeDeg: number;
  /** Azimuth in the attitude's OWN reference frame, not necessarily true north. */
  relativeAzimuthDeg: number;
}

/**
 * The direction the back of the phone points, from Euler angles in RADIANS.
 *
 * Derived from the third column of R: rotating (0, 0, -1) through R gives
 *   L = ( -(ca*sg + sa*sb*cg),  -(sa*sg - ca*sb*cg),  -cb*cg )
 * which is the closed form used below — no matrix allocation per frame.
 */
export function lookDirectionFromEuler(
  alpha: number,
  beta: number,
  gamma: number
): LookDirection {
  const ca = Math.cos(alpha);
  const sa = Math.sin(alpha);
  const cb = Math.cos(beta);
  const sb = Math.sin(beta);
  const cg = Math.cos(gamma);
  const sg = Math.sin(gamma);

  const east = -(ca * sg + sa * sb * cg);
  const north = -(sa * sg - ca * sb * cg);
  const up = -(cb * cg);

  // Guard against a denormalised triple from a noisy sensor frame.
  const len = Math.hypot(east, north, up) || 1;

  return {
    altitudeDeg: Math.asin(Math.max(-1, Math.min(1, up / len))) * RAD,
    relativeAzimuthDeg: normalizeDeg(Math.atan2(east / len, north / len) * RAD),
  };
}

/** Wraps into [0, 360). */
export function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Shortest signed difference a - b, in (-180, 180]. */
export function angleDelta(a: number, b: number): number {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/**
 * Angle-aware exponential smoothing. Interpolates the short way around the
 * circle so 359 -> 1 doesn't spin the view the long way.
 *
 * @param factor 0 = never move, 1 = no smoothing at all.
 */
export function smoothAngle(current: number, target: number, factor: number): number {
  return normalizeDeg(current + angleDelta(target, current) * factor);
}

/**
 * Angular speed, in deg/s, above which the north offset must NOT be re-anchored.
 *
 * THE BUG THIS EXISTS TO PREVENT — a real negative feedback loop that made
 * horizontal panning feel dead:
 *
 *   view azimuth = relativeAzimuth + offset
 *   offset       eases toward (compassHeading - relativeAzimuth)
 *
 * Turn the phone and `relativeAzimuth` moves instantly, but the compass is slow
 * and still reads the old heading. The measured offset therefore moves in the
 * OPPOSITE direction to the turn, and at 60 samples a second it cancels most of
 * the real rotation within half a second. The view barely moves horizontally
 * while vertical — which has no such loop — tracks fine.
 *
 * The offset is a property of the environment, not of how you are moving, so it
 * only ever needs re-anchoring while the device is roughly still.
 */
export const OFFSET_FREEZE_DEG_PER_SEC = 8;

/**
 * SENSOR FUSION, and the reason pointing feels solid rather than swimmy.
 *
 * The gyro-derived attitude is smooth and fast but its azimuth zero is
 * arbitrary. The compass knows true north but is noisy and slow. So we take
 * ONLY a slowly-varying north offset from the compass and let the attitude do
 * all the fast motion.
 *
 * @param angularSpeedDegPerSec how fast the device is turning. Above
 *        OFFSET_FREEZE_DEG_PER_SEC the offset is held, not updated — see above.
 */
export function updateNorthOffset(
  currentOffset: number | null,
  relativeAzimuthDeg: number,
  compassHeadingDeg: number,
  angularSpeedDegPerSec = 0,
  factor = 0.05
): number {
  const measured = normalizeDeg(compassHeadingDeg - relativeAzimuthDeg);
  if (currentOffset === null) return measured; // snap on first fix
  // Moving: hold. Re-anchoring mid-turn would cancel the turn.
  if (angularSpeedDegPerSec > OFFSET_FREEZE_DEG_PER_SEC) return currentOffset;
  return smoothAngle(currentOffset, measured, factor);
}

// ---------------------------------------------------------------------------
// ABSOLUTE ORIENTATION FROM RAW SENSORS
// ---------------------------------------------------------------------------

/**
 * WHY THIS REPLACES THE EULER PATH.
 *
 * lookDirectionFromEuler() is correct for the W3C ZXY convention, in which
 * `alpha` increases COUNTERCLOCKWISE seen from above. Compass azimuth runs
 * CLOCKWISE. Platforms disagree about which one they hand you, and if the sign
 * is inverted the view mirrors about north — anchor facing north, turn east,
 * and the app shows west. Exactly 180 degrees wrong at the extremes.
 *
 * Rather than guess a platform convention, derive the orientation from physics.
 * Gravity gives "down" and the magnetic field gives "north"; together they pin a
 * complete world basis with nothing left to assume. This is the same
 * construction as Android's SensorManager.getRotationMatrix.
 *
 *   A = normalize(gravity)        up, in device coordinates
 *   H = normalize(magnetic x A)   east, in device coordinates
 *   M = A x H                     north, in device coordinates
 *   R = rows [H, M, A]            maps device vectors -> world (East, North, Up)
 *
 * The camera looks along device -Z, so its world direction is -(H.z, M.z, A.z).
 *
 * Returns null when the two vectors are parallel or degenerate — which happens
 * in a strong magnetic anomaly, and is worth reporting rather than rendering a
 * confident wrong answer.
 */
export interface Vec3 { x: number; y: number; z: number }

export function lookDirectionFromSensors(
  gravity: Vec3,
  magnetic: Vec3
): LookDirection | null {
  const ga = Math.hypot(gravity.x, gravity.y, gravity.z);
  const ma = Math.hypot(magnetic.x, magnetic.y, magnetic.z);
  if (ga < 1e-6 || ma < 1e-6) return null;

  const ax = gravity.x / ga, ay = gravity.y / ga, az = gravity.z / ga;

  // H = magnetic x A  -> east in device coordinates
  let hx = magnetic.y * az - magnetic.z * ay;
  let hy = magnetic.z * ax - magnetic.x * az;
  let hz = magnetic.x * ay - magnetic.y * ax;
  const hn = Math.hypot(hx, hy, hz);
  // Parallel vectors: the phone is pointed along the field line, or the
  // magnetometer is being swamped. No usable heading.
  if (hn < 1e-6) return null;
  hx /= hn; hy /= hn; hz /= hn;

  // M = A x H -> north in device coordinates
  const mz = ax * hy - ay * hx;

  const east = -hz;
  const north = -mz;
  const up = -az;

  return {
    altitudeDeg: Math.asin(Math.max(-1, Math.min(1, up))) * RAD,
    relativeAzimuthDeg: normalizeDeg(Math.atan2(east, north) * RAD),
  };
}

/**
 * Low-pass filter for a sensor vector.
 *
 * Smoothing the raw VECTORS rather than the derived angles is deliberate: angles
 * wrap at 360 and averaging across the seam produces a violent swing, while
 * vector components are continuous everywhere.
 */
export function smoothVector(current: Vec3 | null, sample: Vec3, factor: number): Vec3 {
  if (!current) return { ...sample };
  return {
    x: current.x + (sample.x - current.x) * factor,
    y: current.y + (sample.y - current.y) * factor,
    z: current.z + (sample.z - current.z) * factor,
  };
}

/**
 * World "up" expressed in DEVICE coordinates, from the Euler angles.
 *
 * This is the third ROW of R = Rz(alpha).Rx(beta).Ry(gamma), i.e. R^T applied
 * to world up (0,0,1):
 *
 *   up_device = (-cb*sg, sb, cb*cg)
 *
 * Sanity: flat and level (all angles zero) gives (0, 0, 1) — up is straight out
 * of the screen, which is correct for a phone face-up on a table.
 *
 * WHAT IT IS FOR: resolving the accelerometer's sign convention at runtime.
 * Android reports the REACTION to gravity (+9.81 on z when face-up); iOS
 * CoreMotion reports the opposite. Getting it backwards flips altitude AND
 * mirrors azimuth, because east is derived from a cross product with gravity.
 *
 * Only beta and gamma appear here — not alpha — which matters because alpha is
 * the angle whose convention platforms actually disagree about. Tilt is
 * gravity-derived and consistent everywhere, so this is a trustworthy referee.
 */
export function expectedUpInDeviceFrame(beta: number, gamma: number): Vec3 {
  const cb = Math.cos(beta);
  const sb = Math.sin(beta);
  const cg = Math.cos(gamma);
  const sg = Math.sin(gamma);
  return { x: -cb * sg, y: sb, z: cb * cg };
}

/**
 * +1 if the accelerometer already points "up", -1 if it must be negated.
 * Returns 0 when the reading is too weak or too ambiguous to judge.
 */
export function gravitySignFromEuler(
  measured: Vec3,
  beta: number,
  gamma: number
): 1 | -1 | 0 {
  const m = Math.hypot(measured.x, measured.y, measured.z);
  if (m < 1e-6) return 0;
  const up = expectedUpInDeviceFrame(beta, gamma);
  const dot = (measured.x * up.x + measured.y * up.y + measured.z * up.z) / m;
  // Near-perpendicular readings carry no information; wait for a better one.
  if (Math.abs(dot) < 0.5) return 0;
  return dot > 0 ? 1 : -1;
}

// ---------------------------------------------------------------------------
// COMPLEMENTARY FILTER: gyroscope prediction + accel/mag correction
// ---------------------------------------------------------------------------

/**
 * The device's east/north/up axes, expressed in DEVICE coordinates.
 *
 * Same construction as lookDirectionFromSensors, exposed separately because the
 * gyroscope reports angular velocity in the device frame and it has to be
 * rotated into the world frame before it can be integrated.
 */
export interface DeviceBasis { H: Vec3; M: Vec3; A: Vec3 }

export function deviceBasisFromSensors(
  gravity: Vec3,
  magnetic: Vec3
): DeviceBasis | null {
  const ga = Math.hypot(gravity.x, gravity.y, gravity.z);
  if (ga < 1e-6) return null;
  const A = { x: gravity.x / ga, y: gravity.y / ga, z: gravity.z / ga };

  let hx = magnetic.y * A.z - magnetic.z * A.y;
  let hy = magnetic.z * A.x - magnetic.x * A.z;
  let hz = magnetic.x * A.y - magnetic.y * A.x;
  const hn = Math.hypot(hx, hy, hz);
  if (hn < 1e-6) return null;
  const H = { x: hx / hn, y: hy / hn, z: hz / hn };

  const M = {
    x: A.y * H.z - A.z * H.y,
    y: A.z * H.x - A.x * H.z,
    z: A.x * H.y - A.y * H.x,
  };
  return { H, M, A };
}

/** Unit look vector (east, north, up) for an azimuth/altitude pair. */
export function lookVector(azimuthDeg: number, altitudeDeg: number): Vec3 {
  const alt = altitudeDeg * (Math.PI / 180);
  const az = azimuthDeg * (Math.PI / 180);
  const c = Math.cos(alt);
  return { x: c * Math.sin(az), y: c * Math.cos(az), z: Math.sin(alt) };
}

/** Inverse of lookVector. */
export function lookAngles(v: Vec3): LookDirection {
  const n = Math.hypot(v.x, v.y, v.z) || 1;
  return {
    altitudeDeg: Math.asin(Math.max(-1, Math.min(1, v.z / n))) * RAD,
    relativeAzimuthDeg: normalizeDeg(Math.atan2(v.x, v.y) * RAD),
  };
}

/**
 * Rotates a device-frame angular velocity into the world frame.
 * omega_world = (H.w, M.w, A.w) — the components of w along the device's own
 * east, north and up axes.
 */
export function angularVelocityToWorld(basis: DeviceBasis, omega: Vec3): Vec3 {
  const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
  return {
    x: dot(basis.H, omega),
    y: dot(basis.M, omega),
    z: dot(basis.A, omega),
  };
}

/**
 * Integrates the look vector forward by one gyro sample: dL/dt = omega x L.
 *
 * WHY THIS MATTERS. Accelerometer and magnetometer give an absolute orientation
 * that is stable over minutes but noisy frame to frame; the gyroscope gives
 * motion that is beautifully smooth over a second but drifts over minutes.
 * Neither alone is good enough — smoothing the noisy one hard enough to look
 * calm makes it lag, which is the trade the previous version was stuck in.
 *
 * Integrating the gyro supplies the fast motion, and blending gently toward the
 * absolute reading cancels its drift. That is a complementary filter, and it is
 * why a planetarium tracks your hand instead of swimming after it.
 */
export function integrateGyro(look: Vec3, omegaWorld: Vec3, dt: number): Vec3 {
  const cx = omegaWorld.y * look.z - omegaWorld.z * look.y;
  const cy = omegaWorld.z * look.x - omegaWorld.x * look.z;
  const cz = omegaWorld.x * look.y - omegaWorld.y * look.x;
  const x = look.x + cx * dt;
  const y = look.y + cy * dt;
  const z = look.z + cz * dt;
  const n = Math.hypot(x, y, z) || 1;
  return { x: x / n, y: y / n, z: z / n };
}

/**
 * Blends the integrated estimate toward the absolute one.
 * @param factor small — 0.02 trusts the gyro almost entirely between corrections.
 */
export function blendToward(current: Vec3, absolute: Vec3, factor: number): Vec3 {
  const x = current.x + (absolute.x - current.x) * factor;
  const y = current.y + (absolute.y - current.y) * factor;
  const z = current.z + (absolute.z - current.z) * factor;
  const n = Math.hypot(x, y, z) || 1;
  return { x: x / n, y: y / n, z: z / n };
}

/**
 * Full camera basis in world coordinates, INCLUDING ROLL.
 *
 * THE BUG THIS FIXES: the previous basis derived `right` from the look azimuth
 * alone and forced its z-component to zero, which pins the horizon parallel to
 * the screen's x-axis forever. Rotate the phone to landscape and the horizon
 * stays running left-to-right across the screen instead of rotating with the
 * device. It was a planisphere pretending to be a window.
 *
 * The device basis already contains the whole orientation, so all three camera
 * axes come straight out of it. R (rows H, M, A) maps device -> world, so:
 *
 *   right   = R . (1, 0, 0) = (H.x, M.x, A.x)
 *   up      = R . (0, 1, 0) = (H.y, M.y, A.y)
 *   forward = R . (0, 0,-1) = -(H.z, M.z, A.z)
 *
 * Roll then falls out for free: rolling the phone rotates `right` and `up`
 * about `forward`, and the sky rotates with it, as it must if the screen is a
 * window rather than a picture.
 */
export interface WorldCameraAxes {
  forward: Vec3;
  right: Vec3;
  up: Vec3;
}

export function cameraAxesFromBasis(basis: DeviceBasis): WorldCameraAxes {
  const { H, M, A } = basis;
  return {
    right: { x: H.x, y: M.x, z: A.x },
    up: { x: H.y, y: M.y, z: A.y },
    forward: { x: -H.z, y: -M.z, z: -A.z },
  };
}

/**
 * Camera axes for a look direction plus an explicit roll, used by drag mode
 * (which has no device attitude to read) and by the static chart.
 *
 * rollDeg = 0 keeps the horizon level on screen, which is what a dragged view
 * should do; sensor mode passes the device's real roll instead.
 */
export function cameraAxesFromAngles(
  azimuthDeg: number,
  altitudeDeg: number,
  rollDeg = 0
): WorldCameraAxes {
  const forward = lookVector(azimuthDeg, altitudeDeg);
  const azR = azimuthDeg * (Math.PI / 180);
  // Level right-hand axis, then rolled about the view direction.
  const r0 = { x: Math.cos(azR), y: -Math.sin(azR), z: 0 };
  const u0 = {
    x: r0.y * forward.z - r0.z * forward.y,
    y: r0.z * forward.x - r0.x * forward.z,
    z: r0.x * forward.y - r0.y * forward.x,
  };
  if (rollDeg === 0) return { forward, right: r0, up: u0 };

  const c = Math.cos(rollDeg * (Math.PI / 180));
  const s = Math.sin(rollDeg * (Math.PI / 180));
  return {
    forward,
    right: { x: r0.x * c + u0.x * s, y: r0.y * c + u0.y * s, z: r0.z * c + u0.z * s },
    up: { x: u0.x * c - r0.x * s, y: u0.y * c - r0.y * s, z: u0.z * c - r0.z * s },
  };
}

/**
 * Signed roll of a camera frame about its own view direction, in degrees.
 *
 * Roll is taken from the DEVICE BASIS rather than fused, because it derives
 * from gravity alone — which is stable and drift-free — while heading is the
 * part that needs the gyro. So the view direction can come from the
 * complementary filter and the roll straight from the accelerometer.
 */
export function rollFromAxes(axes: WorldCameraAxes): number {
  const f = axes.forward;
  // World up with the component along `forward` removed: the "level" screen-up
  // for this view direction.
  const d = f.z; // dot(worldUp, forward), worldUp = (0,0,1)
  const lx = -f.x * d;
  const ly = -f.y * d;
  const lz = 1 - f.z * d;
  const ln = Math.hypot(lx, ly, lz);
  if (ln < 1e-6) return 0; // looking straight up or down: roll is undefined
  const ux = lx / ln, uy = ly / ln, uz = lz / ln;

  const c = ux * axes.up.x + uy * axes.up.y + uz * axes.up.z;
  // Sign from the component of (camUp x level) along forward. This order, not
  // the reverse: cameraAxesFromAngles rotates `up` toward -`right` for positive
  // roll, and (level x camUp) measures that the other way round.
  const sx = axes.up.y * uz - axes.up.z * uy;
  const sy = axes.up.z * ux - axes.up.x * uz;
  const sz = axes.up.x * uy - axes.up.y * ux;
  const s = sx * f.x + sy * f.y + sz * f.z;
  return Math.atan2(s, c) * RAD;
}
