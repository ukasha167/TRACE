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
 * DeviceOrientation spec. alpha turns COUNTERCLOCKWISE seen from above, which
 * is the opposite way to a compass: read with the wrong sign, the view mirrors
 * about north.
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

export interface Vec3 { x: number; y: number; z: number }

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
 * Full camera basis in world coordinates, INCLUDING ROLL.
 *
 * THE BUG THIS FIXES: the previous basis derived `right` from the look azimuth
 * alone and forced its z-component to zero, which pins the horizon parallel to
 * the screen's x-axis forever. Rotate the phone to landscape and the horizon
 * stays running left-to-right across the screen instead of rotating with the
 * device. It was a planisphere pretending to be a window.
 */
export interface WorldCameraAxes {
  forward: Vec3;
  right: Vec3;
  up: Vec3;
}

/**
 * The camera frame for a device attitude, from the W3C Euler angles in RADIANS.
 *
 * R maps device vectors to the world, so the camera's axes are R's columns:
 *
 *   right   = R . (1, 0, 0)
 *   up      = R . (0, 1, 0)
 *   forward = R . (0, 0,-1)
 *
 * Roll falls out for free: rolling the phone rotates `right` and `up` about
 * `forward`, and the sky rotates with it, as it must if the screen is a window
 * rather than a picture. `forward` is lookDirectionFromEuler's vector.
 */
export function cameraAxesFromEuler(
  alpha: number,
  beta: number,
  gamma: number
): WorldCameraAxes {
  const ca = Math.cos(alpha);
  const sa = Math.sin(alpha);
  const cb = Math.cos(beta);
  const sb = Math.sin(beta);
  const cg = Math.cos(gamma);
  const sg = Math.sin(gamma);
  return {
    right: { x: ca * cg - sa * sb * sg, y: sa * cg + ca * sb * sg, z: -cb * sg },
    up: { x: -sa * cb, y: ca * cb, z: sb },
    forward: { x: -(ca * sg + sa * sb * cg), y: -(sa * sg - ca * sb * cg), z: -cb * cg },
  };
}

/**
 * WHERE iOS PUTS NORTH: add this to CoreMotion's yaw to get W3C alpha.
 *
 * expo-sensors starts CoreMotion in CMAttitudeReferenceFrameXMagneticNorthZVertical
 * (SensorsUtils.swift) and forwards attitude.yaw, pitch and roll unchanged as
 * alpha, beta and gamma (DeviceMotionModule.swift). CoreMotion composes them as
 * Rz(yaw).Rx(pitch).Ry(roll), the W3C order; WebKit builds that matrix from
 * them in WebCoreMotionManager.mm. But CoreMotion's frame has its X axis on
 * magnetic north (CMAttitude.h), so yaw 0 is the phone's RIGHT edge pointing
 * north. In east-north-up, where alpha 0 is the top edge pointing north, that
 * is a quarter turn.
 *
 * Android needs nothing. DeviceMotionModule.kt reads TYPE_ROTATION_VECTOR,
 * which is east-north-up with magnetic north, through SensorManager.getOrientation
 * and sends -azimuth, -pitch and roll. Those are the W3C angles exactly:
 * getOrientation's azimuth is atan2(R[1], R[4]) = -alpha, its pitch
 * asin(-R[7]) = -beta, its roll atan2(-R[6], R[8]) = gamma.
 *
 * Both platforms are magnetic. The compass supplies the declination.
 */
export const COREMOTION_YAW_TO_ALPHA = Math.PI / 2;

/**
 * Camera axes for a look direction plus an explicit roll, used by drag mode
 * (which has no device attitude to read) and by the static chart.
 *
 * rollDeg = 0 keeps the horizon level on screen, which is what a dragged view
 * should do.
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
 * The inverse of cameraAxesFromAngles' roll; the renderer uses it to turn the
 * compass labels with the horizon.
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

// ---------------------------------------------------------------------------
// STELLARIUM'S SENSOR SMOOTHING
// ---------------------------------------------------------------------------

/**
 * How much of the gap to the newest reading one 60 Hz frame closes, at this
 * field of view. Stellarium Mobile's iOS sensor manager (SensorsMgr.mm,
 * Guillaume Chéreau, 2015):
 *
 *   averagingCoef = 0.05 + (fov - 5) * 0.15 / 125,   fov clamped to [5, 130]
 *
 * THE ZOOM IS THE POINT. A hand at rest shakes by a fraction of a degree, and
 * the same fraction of a degree is three times as many points at 21 degrees as
 * at 65. So the filter tightens as the view narrows: 0.05 a frame at 5 degrees
 * and below, 0.2 at 130. The filter this replaces did the opposite, easing
 * lighter when zoomed in, and the eye's field showed every tremor.
 *
 * Stellarium's Qt build (SensorsMgr.cpp), which read the raw accelerometer and
 * magnetometer rather than a fused attitude, used mix(0.01, 0.1, fov / 130):
 * about three times heavier at the eye's field, because raw readings carry the
 * hand's own acceleration. The view here reads the OS's fused attitude, as the
 * iOS build did.
 */
export function sensorBlendPerFrame(fovDeg: number): number {
  const f = Math.min(130, Math.max(5, fovDeg));
  return 0.05 + ((f - 5) * 0.15) / 125;
}

/**
 * The same blend over `dtMs` of elapsed time. Stellarium's coefficient is per
 * frame at 60 Hz; applied per frame on a 120 Hz screen it would ease twice as
 * fast (DECISIONS 59). A dropped frame is capped at 100 ms, as glide() caps it.
 */
export function sensorBlend(fovDeg: number, dtMs: number): number {
  if (!(dtMs > 0)) return 0;
  return 1 - Math.pow(1 - sensorBlendPerFrame(fovDeg), Math.min(dtMs, 100) / (1000 / 60));
}

/** The blend as a time constant in ms: the gap shrinks to 37% in one of these. */
export function sensorTimeConstantMs(fovDeg: number): number {
  return -(1000 / 60) / Math.log(1 - sensorBlendPerFrame(fovDeg));
}

/**
 * One step of the exponential average from the shown frame toward the
 * newest attitude, `k` of the way.
 *
 * Stellarium averages the gravity vector for pitch and roll, and the azimuth
 * as an angle. Averaging an azimuth spins the view at the zenith, where the
 * azimuth is undefined and swings through 180 degrees between two readings,
 * and this view passes through the zenith on purpose. So the same average is
 * taken on the camera's own forward and up vectors: forward carries azimuth and
 * altitude, up carries roll, and neither has a seam. Up is made perpendicular
 * to forward again afterwards, so the frame stays orthonormal.
 */
export function smoothAxes(
  current: WorldCameraAxes,
  target: WorldCameraAxes,
  k: number
): WorldCameraAxes {
  const cf = current.forward, tf = target.forward;
  let fx = cf.x + (tf.x - cf.x) * k;
  let fy = cf.y + (tf.y - cf.y) * k;
  let fz = cf.z + (tf.z - cf.z) * k;
  const fn = Math.hypot(fx, fy, fz);
  // Two opposite directions have no halfway point to ease through.
  if (fn < 1e-6) return target;
  fx /= fn; fy /= fn; fz /= fn;

  const cu = current.up, tu = target.up;
  let ux = cu.x + (tu.x - cu.x) * k;
  let uy = cu.y + (tu.y - cu.y) * k;
  let uz = cu.z + (tu.z - cu.z) * k;
  const d = ux * fx + uy * fy + uz * fz;
  ux -= fx * d; uy -= fy * d; uz -= fz * d;
  const un = Math.hypot(ux, uy, uz);
  if (un < 1e-6) return target;
  ux /= un; uy /= un; uz /= un;

  return {
    forward: { x: fx, y: fy, z: fz },
    up: { x: ux, y: uy, z: uz },
    // right = forward x up, which is device +X for forward -Z and up +Y.
    right: { x: fy * uz - fz * uy, y: fz * ux - fx * uz, z: fx * uy - fy * ux },
  };
}
