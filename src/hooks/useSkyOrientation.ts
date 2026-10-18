import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { Accelerometer, Gyroscope, Magnetometer } from "expo-sensors";
import * as Location from "expo-location";
import {
  lookDirectionFromSensors,
  deviceBasisFromSensors,
  angularVelocityToWorld,
  integrateGyro,
  blendToward,
  lookVector,
  lookAngles,
  cameraAxesFromBasis,
  cameraAxesFromAngles,
  rollFromAxes,
  type WorldCameraAxes,
  smoothVector,
  normalizeDeg,
  angleDelta,
  type Vec3,
} from "@/lib/astronomy/attitude";
import { GLIDE, glide } from "@/lib/glide";

/**
 * Where the immersive view is pointed. Spec §7.3.
 *
 * ARCHITECTURE, and why it feels different from the first attempt:
 *
 * 1. FULL ATTITUDE, not two scalars. The look direction comes from the complete
 *    ZXY rotation (see attitude.ts). Taking altitude from `beta` alone and
 *    azimuth from the compass alone does not compose into a real direction, and
 *    produced a view where the target never left the screen.
 *
 * 2. SENSOR FUSION. The gyro-derived attitude is smooth and fast but its
 *    azimuth zero is arbitrary; the compass knows true north but is noisy. So
 *    the compass contributes ONLY a slowly-varying north offset, and the
 *    attitude does all the fast motion. Hard-smoothing a near-constant offset
 *    removes compass jitter without adding any lag to head movement.
 *
 * 3. SMOOTHING RUNS ON THE FRAME CLOCK, not the sensor clock. Sensor callbacks
 *    only write to refs; a requestAnimationFrame loop eases the view toward
 *    them and publishes one state update per frame. Sensor noise and render
 *    rate stay decoupled, which is what removes the jitter.
 */

export type OrientationMode = "sensor" | "drag";

export interface SkyOrientationDebug {
  betaDeg: number | null;
  headingDeg: number | null;
  accuracy: number | null;
  motionEvents: number;
  headingEvents: number;
  permission: string | null;
  /** Magnetic declination applied, degrees. */
  northOffset: number | null;
  magEvents: number;
  gyroEvents: number;
  /** Measured render rate, for deciding whether the renderer needs work. */
  fps: number;
  angularSpeed: number;
}

export interface SkyOrientation {
  viewRef: React.MutableRefObject<{ az: number; alt: number }>;
  /** Roll-aware camera frame. The renderer must use this. */
  axesRef: React.MutableRefObject<WorldCameraAxes>;
  /** Throttled, for labels only. The renderer must use viewRef. */
  azimuthDeg: number;
  altitudeDeg: number;
  mode: OrientationMode;
  headingAccuracy: number | null;
  motionAvailable: boolean;
  headingAvailable: boolean;
  canPoint: boolean;
  compassUnreliable: boolean;
  permissionDenied: boolean;
  setMode: (mode: OrientationMode) => void;
  /** Detected accelerometer sign, before any manual override. */
  detectedGravitySign: number;
  flipGravity: boolean;
  flipHeading: boolean;
  toggleFlipGravity: () => void;
  toggleFlipHeading: () => void;
  pan: (dx: number, dy: number, fovDeg: number, viewWidth: number) => void;
  /** The finger lifted at this velocity, points per second: the view coasts on. */
  release: (vx: number, vy: number, fovDeg: number, viewWidth: number) => void;
  /** Turn the dragged view to face a direction, gliding there unless `now`. */
  lookAt: (azimuthDeg: number, altitudeDeg: number, now?: boolean) => void;
  debug: SkyOrientationDebug;
}

export const MIN_USABLE_ACCURACY = 2;

/**
 * Per-frame easing, scaled by field of view.
 *
 * A fixed factor is wrong: at 20 degrees FOV the same angular error is three
 * times the screen distance it is at 65, so identical smoothing reads as heavy
 * lag when zoomed in. Response therefore tightens as the view narrows.
 */
function smoothingFor(fovDeg: number): number {
  // Light. The complementary filter already delivers a smooth signal, so this
  // is only a final polish pass — the heavy easing it used to do was
  // compensating for raw accel/mag noise that the gyro now absorbs, and
  // stacking both would just reintroduce the lag we set out to remove.
  //
  // A time constant in milliseconds, for lib/glide.ts. It was a per-frame
  // factor (0.9 zoomed in, 0.65 wide), which ran twice as fast on a 120 Hz
  // iPhone as on a 60 Hz phone; these are the same easing at 60 Hz.
  const t = Math.max(0, Math.min(1, (fovDeg - 18) / (100 - 18)));
  return 7 + t * 9; // 7 ms zoomed in -> 16 ms wide
}
/** Beyond this the view snaps instead of easing, so fast turns don't lag. */
const SNAP_DEG = 45;

/**
 * WHICH WAY THE ACCELEROMETER POINTS, PER PLATFORM.
 *
 * `lookDirectionFromSensors` wants `gravity` to be world UP expressed in device
 * coordinates. Lying flat with the screen up, that is (0, 0, +1). The raw
 * reading in that posture is not the same on both platforms, and expo-sensors
 * does not normalise it:
 *
 *   Android  AccelerometerModule.kt forwards Sensor.TYPE_ACCELEROMETER divided
 *            by GRAVITY_EARTH and nothing else. Android reports the REACTION to
 *            gravity, so screen-up reads (0, 0, +1). Sign +1.
 *   iOS      AccelerometerModule.swift forwards CMAccelerometerData.acceleration
 *            unchanged. CoreMotion reports the opposite, so screen-up reads
 *            (0, 0, -1). Sign -1.
 *
 * This was hardcoded to -1 for both, which is right on iOS and wrong on Android.
 * The symptom is specific and worth recognising: altitude inverts AND azimuth
 * mirrors, together, because east comes from `magnetic x gravity` and negating
 * gravity flips that cross product too. So a user turning on "Flip up/down"
 * appears to fix the left/right axis as well, which is what happened here.
 *
 * The manual overrides stay. Sensor conventions are a vendor decision and a
 * switch someone can flip in two seconds beats a default nobody can correct.
 */
const GRAVITY_SIGN = Platform.OS === "android" ? 1 : -1;

/**
 * @param diagnostics whether the debug panel is open. Its numbers are published
 *   through React state, so with the panel shut they are not published at all.
 */
export function useSkyOrientation(
  initialAzimuth = 180,
  fovDeg = 65,
  diagnostics = false
): SkyOrientation {
  // NOT React state. Publishing the view through setState ran a full
  // reconciliation pass 60 times a second, which congested the JS thread and
  // delayed the sensor callbacks themselves — frames rendered at 30-50fps while
  // the orientation behind them updated at 10-20Hz. The renderer reads this ref
  // from its own frame loop instead, and React never re-renders for motion.
  const viewRef = useRef({ az: initialAzimuth, alt: 25 });
  /**
   * Where the finger has put the view. In drag mode the frame loop glides
   * viewRef toward this rather than pan() writing viewRef directly: touch
   * events reach the JS thread unevenly, two in one frame and none in the next,
   * and a view moved by each event as it lands moves in steps. The azimuth is
   * not wrapped, so a glide across north takes the short way.
   */
  const dragTarget = useRef({ az: initialAzimuth, alt: 25 });
  const dragCoast = useRef(false);
  /**
   * Full camera frame, roll included. The renderer uses THIS, not az/alt —
   * deriving the frame from angles alone forces the horizon parallel to the
   * screen's x-axis, so it never rotates when the phone turns to landscape.
   */
  const axesRef = useRef<WorldCameraAxes>(cameraAxesFromAngles(initialAzimuth, 25, 0));
  const rollRef = useRef(0);
  // Throttled copy, for the on-screen labels only (~4Hz).
  const [label, setLabel] = useState({ az: initialAzimuth, alt: 25 });
  const [mode, setMode] = useState<OrientationMode>("drag");

  const [headingAccuracy, setHeadingAccuracy] = useState<number | null>(null);
  const [motionAvailable, setMotionAvailable] = useState(false);
  const [headingAvailable, setHeadingAvailable] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  // Manual escape hatches. Sensor conventions vary by vendor and I would rather
  // ship a switch the user can flip in two seconds than a wrong default.
  const [flipGravity, setFlipGravity] = useState(false);
  const [flipHeading, setFlipHeading] = useState(false);
  const [debug, setDebug] = useState<SkyOrientationDebug>({
    betaDeg: null, headingDeg: null, accuracy: null,
    motionEvents: 0, headingEvents: 0, permission: null, northOffset: null,
    magEvents: 0, gyroEvents: 0, fps: 0, angularSpeed: 0,
  });

  // Sensor callbacks only ever write here — never setState, which would queue a
  // React update per sensor sample.
  const gravity = useRef<Vec3 | null>(null);
  const magnetic = useRef<Vec3 | null>(null);
  const declination = useRef(0);
  const magCount = useRef(0);
  const gyroCount = useRef(0);

  /** Fused look direction, world frame. The gyro drives it, accel/mag corrects it. */
  const look = useRef<Vec3 | null>(null);
  const lastGyroAt = useRef(0);
  const smoothed = useRef({ az: initialAzimuth, alt: 25 });
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const motionCount = useRef(0);
  const headingCount = useRef(0);
  const angularSpeed = useRef(0);
  const flipGravityRef = useRef(flipGravity);
  flipGravityRef.current = flipGravity;
  const flipHeadingRef = useRef(flipHeading);
  flipHeadingRef.current = flipHeading;
  const fovRef = useRef(fovDeg);
  fovRef.current = fovDeg;
  const diagnosticsRef = useRef(diagnostics);
  diagnosticsRef.current = diagnostics;
  const headingAccuracyRef = useRef(headingAccuracy);
  headingAccuracyRef.current = headingAccuracy;

  // Whether there is a motion sensor at all, asked once. Drag mode needs the
  // answer to say so when pointing cannot work, without running the sensors.
  useEffect(() => {
    let cancelled = false;
    Accelerometer.isAvailableAsync()
      .then((available) => { if (!cancelled) setMotionAvailable(available); })
      .catch(() => { if (!cancelled) setMotionAvailable(false); });
    return () => { cancelled = true; };
  }, []);

  // ---- Raw sensors -> absolute orientation ----
  //
  // Gravity comes from the RAW Accelerometer, not DeviceMotion's
  // accelerationIncludingGravity. DeviceMotion is a composite sensor and on
  // Android frequently ignores setUpdateInterval, delivering far slower than the
  // magnetometer. Since altitude depends only on gravity while azimuth also uses
  // the magnetometer, that mismatch made vertical motion visibly stepped while
  // horizontal stayed smooth. Raw sensors, sampled at matched rates, fixes it.
  //
  // ONLY WHILE POINTING. Three sensors at 60 Hz ran for as long as the view was
  // open, including in drag mode, where nothing reads them. They now start when
  // pointing starts and stop when it stops, and the readings are dropped on the
  // way out so a return to pointing cannot snap to where the phone used to be.
  useEffect(() => {
    if (mode !== "sensor") return;
    let cancelled = false;
    const subs: { remove: () => void }[] = [];

    (async () => {
      let available = false;
      try {
        available = await Accelerometer.isAvailableAsync();
      } catch {
        available = false;
      }
      if (cancelled || !available) return;

      const HZ = 1000 / 60;
      Accelerometer.setUpdateInterval(HZ);
      Magnetometer.setUpdateInterval(HZ);
      Gyroscope.setUpdateInterval(HZ);

      subs.push(
        Accelerometer.addListener((a) => {
          const sg = GRAVITY_SIGN * (flipGravityRef.current ? -1 : 1);
          // Track hard while turning, settle hard when still. A fixed constant
          // has to choose between lag and jitter; this gets both.
          const fast = angularSpeed.current > 20;
          gravity.current = smoothVector(
            gravity.current,
            { x: a.x * sg, y: a.y * sg, z: a.z * sg },
            fast ? 0.6 : 0.25
          );
          motionCount.current += 1;
        })
      );

      subs.push(
        Magnetometer.addListener((m) => {
          const fast = angularSpeed.current > 20;
          // Noisiest input here, so smoothed harder in every regime.
          magnetic.current = smoothVector(magnetic.current, m, fast ? 0.45 : 0.12);
          magCount.current += 1;
        })
      );

      subs.push(
        Gyroscope.addListener((g) => {
          angularSpeed.current = (Math.hypot(g.x, g.y, g.z) * 180) / Math.PI;
          gyroCount.current += 1;

          // PREDICT. The gyro carries the fast motion; accel/mag only correct
          // it. This is what makes the view track the hand instead of easing
          // after it — smoothing a noisy absolute reading hard enough to look
          // calm necessarily makes it lag, and that trade is what the
          // complementary filter escapes.
          const now = Date.now();
          const dt = lastGyroAt.current ? (now - lastGyroAt.current) / 1000 : 0;
          lastGyroAt.current = now;
          if (dt <= 0 || dt > 0.25) return; // first sample, or app was backgrounded

          if (!look.current || !gravity.current || !magnetic.current) return;
          const basis = deviceBasisFromSensors(gravity.current, magnetic.current);
          if (!basis) return;
          const omegaWorld = angularVelocityToWorld(basis, g);
          look.current = integrateGyro(look.current, omegaWorld, dt);
        })
      );

    })();

    return () => {
      cancelled = true;
      for (const s of subs) s.remove();
      gravity.current = null;
      magnetic.current = null;
      look.current = null;
      lastGyroAt.current = 0;
    };
  }, [mode]);

  // ---- Compass: north reference only ----
  //
  // Also only while pointing. It is the one thing in this view that needs the
  // location permission, so a person who only ever drags is never asked for it.
  useEffect(() => {
    if (mode !== "sensor") return;
    let cancelled = false;
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        setDebug((d) => ({ ...d, permission: status }));
        if (status !== "granted") { setPermissionDenied(true); return; }
        sub = await Location.watchHeadingAsync((h) => {
          // Only DECLINATION is taken from the compass: the fixed angle between
          // magnetic and true north at this place. It does not depend on how the
          // device is held, so unlike the previous north-offset it cannot form a
          // feedback loop with rotation. (About 1 degree at Greenwich, far below the
          // magnetometer's own error, so it is a refinement not a dependency.)
          if (h.trueHeading >= 0 && h.magHeading >= 0) {
            declination.current = angleDelta(h.trueHeading, h.magHeading);
          }
          headingCount.current += 1;
          setHeadingAccuracy(h.accuracy);
          setHeadingAvailable(true);
        });
      } catch {
        if (!cancelled) setHeadingAvailable(false);
      }
    })();
    return () => { cancelled = true; sub?.remove(); };
  }, [mode]);

  // ---- Frame loop: ease toward the sensors, publish once per frame ----
  useEffect(() => {
    let raf = 0;
    let frames = 0;
    let fpsFrames = 0;
    let fpsSince = Date.now();
    let fps = 0;
    // What the heading label last showed. It re-renders the screen, so it is
    // published only when the view has turned far enough to change it.
    const shown = { az: NaN, alt: NaN };
    const publishLabel = (az: number, alt: number) => {
      if (
        Math.abs(angleDelta(az, shown.az)) < 1 &&
        Math.abs(alt - shown.alt) < 1
      ) {
        return;
      }
      shown.az = az;
      shown.alt = alt;
      setLabel({ az, alt });
    };
    let lastAt = performance.now();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const at = performance.now();
      const dt = at - lastAt;
      lastAt = at;

      // Measure the actual render rate. This is the number that decides whether
      // the renderer needs moving off the JS thread.
      fpsFrames++;
      const now = Date.now();
      if (now - fpsSince >= 1000) {
        fps = (fpsFrames * 1000) / (now - fpsSince);
        fpsFrames = 0;
        fpsSince = now;
      }

      if (modeRef.current !== "sensor") {
        // Drag mode: the view glides toward where the finger put it. No device
        // attitude to read, so the horizon stays level, which is what a dragged
        // view should do.
        const v = viewRef.current;
        const t = dragTarget.current;
        const tau = dragCoast.current ? GLIDE.coast : GLIDE.follow;
        const az = glide(v.az, v.az + angleDelta(t.az, v.az), dt, tau);
        v.alt = glide(v.alt, t.alt, dt, tau);
        v.az = normalizeDeg(az);
        axesRef.current = cameraAxesFromAngles(
          viewRef.current.az,
          viewRef.current.alt,
          0
        );
        if (++frames % 15 === 0) publishLabel(viewRef.current.az, viewRef.current.alt);
        return;
      }
      if (!gravity.current || !magnetic.current) return;

      const abs = lookDirectionFromSensors(gravity.current, magnetic.current);
      // Null means the field is degenerate (a magnet nearby, or the phone
      // aligned with the field line). Coast on the gyro rather than snapping
      // somewhere confidently wrong.
      const basis = deviceBasisFromSensors(gravity.current, magnetic.current);
      if (basis) rollRef.current = rollFromAxes(cameraAxesFromBasis(basis));

      if (abs) {
        const absVec = lookVector(abs.relativeAzimuthDeg, abs.altitudeDeg);
        // CORRECT. Small factor: trust the gyro between corrections, and let
        // accel/mag quietly cancel its drift.
        look.current = look.current
          ? blendToward(look.current, absVec, 0.035)
          : absVec;
      }
      if (!look.current) return;

      const fused = lookAngles(look.current);
      const targetAz = normalizeDeg(
        fused.relativeAzimuthDeg + declination.current + (flipHeadingRef.current ? 180 : 0)
      );
      const targetAlt = fused.altitudeDeg;

      const s = smoothed.current;
      const tau = smoothingFor(fovRef.current);
      // Snap on large moves so a quick turn doesn't drag behind the hand.
      s.az = Math.abs(angleDelta(targetAz, s.az)) > SNAP_DEG
        ? targetAz
        : normalizeDeg(glide(s.az, s.az + angleDelta(targetAz, s.az), dt, tau));
      s.alt = Math.abs(targetAlt - s.alt) > SNAP_DEG
        ? targetAlt
        : glide(s.alt, targetAlt, dt, tau);

      viewRef.current.az = s.az;
      viewRef.current.alt = s.alt;
      // Roll comes straight from gravity — stable and drift-free — while the
      // view direction comes from the fused estimate.
      axesRef.current = cameraAxesFromAngles(s.az, s.alt, rollRef.current);

      // Labels and diagnostics only — never the view itself.
      if (++frames % 15 === 0) publishLabel(s.az, s.alt);
      if (frames % 30 === 0 && diagnosticsRef.current) {
        setDebug((d) => ({
          ...d,
          betaDeg: gravity.current?.z ?? null,
          headingDeg: magnetic.current?.z ?? null,
          accuracy: headingAccuracyRef.current,
          motionEvents: motionCount.current,
          headingEvents: headingCount.current,
          northOffset: declination.current,
          magEvents: magCount.current,
          gyroEvents: gyroCount.current,
          fps,
          angularSpeed: angularSpeed.current,
        }));
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // In drag mode the panel still shows what the last pointing session saw, and
  // whether a compass ever answered. Published only while the panel is open.
  useEffect(() => {
    if (mode === "sensor" || !diagnostics) return;
    const id = setInterval(() => {
      setDebug((d) => ({
        ...d,
        betaDeg: gravity.current?.z ?? null,
        headingDeg: magnetic.current?.z ?? null,
        accuracy: headingAccuracyRef.current,
        motionEvents: motionCount.current,
        headingEvents: headingCount.current,
        northOffset: declination.current,
        magEvents: magCount.current,
        gyroEvents: gyroCount.current,
        angularSpeed: angularSpeed.current,
      }));
    }, 500);
    return () => clearInterval(id);
  }, [mode, diagnostics]);

  const pan = useCallback(
    (dx: number, dy: number, fovDeg: number, viewWidth: number) => {
      const perPoint = fovDeg / viewWidth;
      const t = dragTarget.current;
      dragCoast.current = false;
      t.az = normalizeDeg(t.az - dx * perPoint);
      // No clamp beyond the poles: the view passes through the zenith and below
      // the horizon, which is what makes it feel like standing somewhere.
      t.alt = Math.max(-90, Math.min(90, t.alt + dy * perPoint));
      smoothed.current.az = t.az;
      smoothed.current.alt = t.alt;
    },
    []
  );

  const release = useCallback(
    (vx: number, vy: number, fovDeg: number, viewWidth: number) => {
      const throwPts = GLIDE.throwSeconds;
      pan(vx * throwPts, vy * throwPts, fovDeg, viewWidth);
      dragCoast.current = true;
    },
    [pan]
  );

  const lookAt = useCallback((azimuthDeg: number, altitudeDeg: number, now = false) => {
    dragTarget.current = { az: normalizeDeg(azimuthDeg), alt: altitudeDeg };
    dragCoast.current = true;
    if (now) Object.assign(viewRef.current, dragTarget.current);
  }, []);

  const changeMode = useCallback((m: OrientationMode) => {
    // Entering sensor mode: adopt the current sensor reading immediately rather
    // than easing across from wherever the drag left the view.
    if (m === "sensor" && gravity.current && magnetic.current) {
      const abs = lookDirectionFromSensors(gravity.current, magnetic.current);
      if (abs) {
        look.current = lookVector(abs.relativeAzimuthDeg, abs.altitudeDeg);
        smoothed.current = {
          az: normalizeDeg(abs.relativeAzimuthDeg + declination.current),
          alt: abs.altitudeDeg,
        };
      }
    }
    // Leaving sensor mode: the drag starts from wherever the phone was pointing.
    if (m === "drag") dragTarget.current = { ...viewRef.current };
    setMode(m);
  }, []);

  return {
    /** Live view, read by the renderer's frame loop. Mutated, never replaced. */
    viewRef,
    axesRef,
    /** Throttled copy for text labels. Do NOT render the sky from this. */
    azimuthDeg: label.az,
    altitudeDeg: label.alt,
    mode,
    headingAccuracy,
    motionAvailable,
    headingAvailable,
    canPoint: motionAvailable || headingAvailable,
    compassUnreliable:
      headingAccuracy != null && headingAccuracy < MIN_USABLE_ACCURACY,
    permissionDenied,
    setMode: changeMode,
    detectedGravitySign: GRAVITY_SIGN,
    flipGravity,
    flipHeading,
    toggleFlipGravity: () => setFlipGravity((v) => !v),
    toggleFlipHeading: () => setFlipHeading((v) => !v),
    pan,
    release,
    lookAt,
    debug,
  };
}
