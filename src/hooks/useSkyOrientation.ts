import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { DeviceMotion } from "expo-sensors";
import * as Location from "expo-location";
import {
  COREMOTION_YAW_TO_ALPHA,
  cameraAxesFromAngles,
  cameraAxesFromEuler,
  lookAngles,
  sensorBlend,
  sensorTimeConstantMs,
  smoothAxes,
  type WorldCameraAxes,
  normalizeDeg,
  angleDelta,
} from "@/lib/astronomy/attitude";
import { GLIDE, glide } from "@/lib/glide";

/**
 * Where the immersive view is pointed. Spec §7.3.
 *
 * THIS IS STELLARIUM'S SENSOR MODE (Stellarium Mobile, SensorsMgr.mm), and it
 * replaced a hand-built complementary filter that jittered with a resting hand:
 *
 * 1. THE OS FUSES THE SENSORS. The attitude is CoreMotion's on iOS and
 *    TYPE_ROTATION_VECTOR on Android, both gyroscope, accelerometer and
 *    magnetometer fused with bias and calibration models this app cannot
 *    match. The previous version integrated the raw gyro itself and pulled it
 *    toward the raw accelerometer and magnetometer, so their noise reached the
 *    view through the drift correction.
 *
 * 2. READ ONCE A FRAME. The sensor callback only keeps the newest reading; the
 *    frame loop reads it, as Stellarium's update() reads manager.deviceMotion.
 *    Readings that reach JS in bunches cost nothing.
 *
 * 3. AN AVERAGE THAT TIGHTENS AS THE VIEW NARROWS. Each frame moves the view
 *    part of the way to the reading, by Stellarium's coefficient for the field
 *    of view (attitude.sensorBlend): a time constant of 234 ms at the eye's
 *    20 degree field, 325 ms at 5 degrees and closer, 93 ms at the widest. The
 *    first reading is taken as it is. The trade is lag, on purpose: turning at
 *    90 degrees a second at the eye's field, the view runs 21 degrees behind
 *    and catches up when the hand stops.
 */

export type OrientationMode = "sensor" | "drag";

export interface SkyOrientationDebug {
  accuracy: number | null;
  /** DeviceMotion readings since the view opened. */
  motionEvents: number;
  headingEvents: number;
  permission: string | null;
  /** Magnetic declination applied, degrees. */
  northOffset: number | null;
  /** Measured render rate, for deciding whether the renderer needs work. */
  fps: number;
  angularSpeed: number;
  /** The sensor average's time constant at the current zoom, ms. */
  smoothingMs: number;
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
  flipHeading: boolean;
  toggleFlipHeading: () => void;
  pan: (dx: number, dy: number, fovDeg: number, viewWidth: number) => void;
  /** The finger lifted at this velocity, points per second: the view coasts on. */
  release: (vx: number, vy: number, fovDeg: number, viewWidth: number) => void;
  /** Turn the dragged view to face a direction, gliding there unless `now`. */
  lookAt: (azimuthDeg: number, altitudeDeg: number, now?: boolean) => void;
  debug: SkyOrientationDebug;
}

export const MIN_USABLE_ACCURACY = 2;

const DEG = Math.PI / 180;

/** iOS sends CoreMotion's yaw, a quarter turn from W3C alpha; Android sends alpha. */
const YAW_TO_ALPHA = Platform.OS === "ios" ? COREMOTION_YAW_TO_ALPHA : 0;

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
  // Throttled copy, for the on-screen labels only. Changes per compass
  // sector unless the debug panel is open.
  const [label, setLabel] = useState({ az: initialAzimuth, alt: 25 });
  const [mode, setMode] = useState<OrientationMode>("drag");

  const [headingAccuracy, setHeadingAccuracy] = useState<number | null>(null);
  const [motionAvailable, setMotionAvailable] = useState(false);
  const [headingAvailable, setHeadingAvailable] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  // A manual escape hatch. A switch someone can flip in two seconds beats a
  // default nobody can correct.
  const [flipHeading, setFlipHeading] = useState(false);
  const [debug, setDebug] = useState<SkyOrientationDebug>({
    accuracy: null, motionEvents: 0, headingEvents: 0, permission: null,
    northOffset: null, fps: 0, angularSpeed: 0, smoothingMs: 0,
  });

  // The sensor callback only ever writes here — never setState, which would
  // queue a React update per sensor sample.
  /** The newest fused attitude, radians, as DeviceMotion sends it. */
  const attitude = useRef<{ alpha: number; beta: number; gamma: number } | null>(null);
  /**
   * Stellarium's firstMeasure: the next reading is shown as it is rather than
   * eased toward. Set on entering pointing, so the view does not swim across
   * from wherever the drag left it.
   */
  const fresh = useRef(true);
  const declination = useRef(0);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const motionCount = useRef(0);
  const headingCount = useRef(0);
  const angularSpeed = useRef(0);
  const flipHeadingRef = useRef(flipHeading);
  flipHeadingRef.current = flipHeading;
  const fovRef = useRef(fovDeg);
  fovRef.current = fovDeg;
  const diagnosticsRef = useRef(diagnostics);
  diagnosticsRef.current = diagnostics;
  const headingAccuracyRef = useRef(headingAccuracy);
  headingAccuracyRef.current = headingAccuracy;

  // Whether the fused sensor exists at all, asked once. Drag mode needs the
  // answer to say so when pointing cannot work, without running the sensors.
  // On Android this is false without a gyroscope, because there is no
  // rotation vector to read.
  useEffect(() => {
    let cancelled = false;
    DeviceMotion.isAvailableAsync()
      .then((available) => { if (!cancelled) setMotionAvailable(available); })
      .catch(() => { if (!cancelled) setMotionAvailable(false); });
    return () => { cancelled = true; };
  }, []);

  // ---- The fused attitude ----
  //
  // ONLY WHILE POINTING. The sensors start when pointing starts and stop when
  // it stops, and the reading is dropped on the way out so a return to
  // pointing cannot snap to where the phone used to be.
  useEffect(() => {
    if (mode !== "sensor") return;
    let cancelled = false;
    let sub: { remove: () => void } | null = null;

    (async () => {
      let available = false;
      try {
        available = await DeviceMotion.isAvailableAsync();
      } catch {
        available = false;
      }
      if (cancelled || !available) return;

      // CoreMotion's device motion tops out at 100 Hz. Android is not asked:
      // DeviceMotionModule.kt sends once per display frame with the newest
      // reading of each sensor, and an interval there only skips frames.
      if (Platform.OS === "ios") DeviceMotion.setUpdateInterval(10);

      sub = DeviceMotion.addListener((m) => {
        // Android sends no rotation until the rotation vector has fired once.
        if (m.rotation) attitude.current = m.rotation;
        const r = m.rotationRate;
        if (r) angularSpeed.current = Math.hypot(r.alpha, r.beta, r.gamma);
        motionCount.current += 1;
      });
    })();

    return () => {
      cancelled = true;
      sub?.remove();
      attitude.current = null;
    };
  }, [mode]);

  // ---- Compass: declination only ----
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
          // device is held, so it cannot form a feedback loop with rotation.
          if (h.trueHeading >= 0 && h.magHeading >= 0) {
            declination.current = angleDelta(h.trueHeading, h.magHeading);
          }
          headingCount.current += 1;
          setHeadingAccuracy(h.accuracy);
          setHeadingAvailable(true);
        });
        // The view closed or went back to dragging while the watch was being
        // set up. Cleanup already ran and found nothing to remove, so the watch
        // would run until the app was killed.
        if (cancelled) { sub.remove(); sub = null; }
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
    let shownFlip = flipHeadingRef.current;
    // What the heading label last showed. It re-renders the screen, so it is
    // published only when the view has turned far enough to change it.
    const shown = { az: NaN, alt: NaN };
    const publishLabel = (az: number, alt: number) => {
      // With the debug panel shut the only text this feeds is "Facing SE" or
      // "Below the horizon", so a 1 degree turn re-rendering the whole screen
      // 8 times a second at 120 Hz bought nothing.
      if (
        !diagnosticsRef.current &&
        Math.round(az / 45) % 8 === Math.round(shown.az / 45) % 8 &&
        alt < -2 === shown.alt < -2
      ) {
        return;
      }
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
      const r = attitude.current;
      if (!r) return;

      // Declination and the manual flip turn the whole frame about the
      // vertical. Alpha runs counterclockwise and a compass clockwise, so true
      // north is magnetic north minus the declination here.
      const flip = flipHeadingRef.current;
      const alpha =
        r.alpha + YAW_TO_ALPHA - declination.current * DEG - (flip ? Math.PI : 0);
      const target = cameraAxesFromEuler(alpha, r.beta, r.gamma);
      // A flip is half a turn, which no average can ease across, so it snaps
      // like a first reading.
      const axes =
        fresh.current || flip !== shownFlip
          ? target
          : smoothAxes(axesRef.current, target, sensorBlend(fovRef.current, dt));
      fresh.current = false;
      shownFlip = flip;
      axesRef.current = axes;

      const look = lookAngles(axes.forward);
      viewRef.current.az = look.relativeAzimuthDeg;
      viewRef.current.alt = look.altitudeDeg;

      // Labels and diagnostics only — never the view itself.
      if (++frames % 15 === 0) publishLabel(look.relativeAzimuthDeg, look.altitudeDeg);
      if (frames % 30 === 0 && diagnosticsRef.current) {
        setDebug((d) => ({
          ...d,
          accuracy: headingAccuracyRef.current,
          motionEvents: motionCount.current,
          headingEvents: headingCount.current,
          northOffset: declination.current,
          fps,
          angularSpeed: angularSpeed.current,
          smoothingMs: sensorTimeConstantMs(fovRef.current),
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
        accuracy: headingAccuracyRef.current,
        motionEvents: motionCount.current,
        headingEvents: headingCount.current,
        northOffset: declination.current,
        angularSpeed: angularSpeed.current,
        smoothingMs: sensorTimeConstantMs(fovRef.current),
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
    // Entering sensor mode: the first reading is adopted as it is rather than
    // eased across from wherever the drag left the view.
    if (m === "sensor") fresh.current = true;
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
    canPoint: motionAvailable,
    compassUnreliable:
      headingAccuracy != null && headingAccuracy < MIN_USABLE_ACCURACY,
    permissionDenied,
    setMode: changeMode,
    flipHeading,
    toggleFlipHeading: () => setFlipHeading((v) => !v),
    pan,
    release,
    lookAt,
    debug,
  };
}
