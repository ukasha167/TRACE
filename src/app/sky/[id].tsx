import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  StatusBar,
  useWindowDimensions,
} from "react-native";
import {
  Canvas,
  Picture,
  Skia,
  BlurStyle,
  BlendMode,
  FilterMode,
  MipmapMode,
  TileMode,
  type SkImage,
  type SkPicture,
} from "@shopify/react-native-skia";
import * as Astronomy from "astronomy-engine";
import { useReducedMotion, useSharedValue } from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { X, Compass, Hand } from "lucide-react-native";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Colors,
  Blackbody,
  Spacing,
  FontFamily,
  FontSize,
  Tracking,
  Radius,
  SkyColors,
} from "@/constants/theme";
import { useMilestone } from "@/store/useMilestonesStore";
import {
  cameraBasisFromAxes,
  projectSphere,
  projectVector,
  projectInto,
  anchorTransform,
  CONSTELLATION_ART_TILE,
  type CameraBasis,
} from "@/lib/astronomy/skySphere";
import {
  toLocalNight,
  todayDateString,
  formatLocalTime,
} from "@/lib/astronomy/dateUtils";
import { rollFromAxes } from "@/lib/astronomy/attitude";
import {
  siderealCamera,
  siderealDelta,
  nightWindow,
  eclipseShadow,
  horizonVector,
  describeNightMoment,
  type EclipseShadow,
} from "@/lib/astronomy/skyNight";
import { getSolarSystemSky } from "@/lib/astronomy/skyBodies";
import { getMoonPhase, describePhase, formatIllumination } from "@/lib/astronomy/moonPhase";
import { moonLightAt } from "@/lib/astronomy/brightLimb";
import { formatDuration } from "@/lib/astronomy/nightFacts";
import { eyeFieldOfView, groundOpacity, groundRegion, moonSkyLight, airLight } from "@/lib/astronomy/skyView";
import {
  STAR_TINT_KELVIN,
  KS_EXTINCTION,
  DARK_SKY_NL,
  ksAirmass,
  moonIntensity,
  twilightClearance,
  adapt,
} from "@/lib/astronomy/skyLight";
import { angularRadiusDeg } from "@/lib/astronomy/skyBodies";
import { skyEffect, packUniforms, MILKY_WAY_PEAK } from "@/components/sky/skyShader";
import { drawDisc, drawRinged, resolved, screenDirection, type Rgb } from "@/components/sky/drawBodies";
import milkyWayMap from "@/data/milkyWay.json";
import { GLIDE, glide, lenis } from "@/lib/glide";
import { useMoonTextures } from "@/components/moon/moonTextures";
import { moonEffect } from "@/components/moon/moonShader";
import { useSkyAssets } from "@/components/sky/skyAssets";
import { MOON_IMG, MOON_IMG_DISC, cachedSkyMoonImage, drawSkyMoonImage, skyMoonKey } from "@/components/sky/skyMoonImage";
import { MoonPhaseGlyph } from "@/components/MoonPhaseGlyph";
import { TimeScrubber } from "@/components/TimeScrubber";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useCurrentLocation } from "@/hooks/useCurrentLocation";
import { useSkyOrientation } from "@/hooks/useSkyOrientation";
import { CATALOG, MAG_LIMIT, moonStepOf, skySphereFor } from "@/hooks/skyCache";
import type { Milestone, SkyBody } from "@/types";

/**
 * Zoom limits. The view opens at the normal lens (skyView.eyeFieldOfView),
 * about 21 degrees across a portrait phone. A tenth of a degree at the narrow
 * end is a small telescope at about 140x (a phone held at reading distance
 * spans some 14 degrees): enough to resolve Jupiter's flattened disc, Venus's
 * phase and Saturn's rings, which are drawn at their true size. At half a
 * degree Saturn's rings are only four points across.
 */
const FOV_MIN = 0.1;
/** The most one frame advances the entrance or exit: a dropped frame waits, it does not jump. */
const ENTRANCE_STEP_MS = 20;
const FOV_MAX = 100;
const DEG = Math.PI / 180;

/**
 * CONSTELLATION FADE.
 *
 * Every figure used to draw at one fixed alpha, so 89 constellations were
 * always on at once and the sky read as a wireframe. Now a figure sits at a
 * base almost too faint to notice and lifts when you look at it, easing over
 * about half a second rather than switching, and it carries its name while it
 * is up. Look away and it settles back.
 *
 * That is the Stellarium behaviour and it is also the answer to clutter: the
 * structure is there the whole time, but only where you are actually looking.
 */
const FIGURE_BASE_ALPHA = 0.05;
const FIGURE_FOCUS_ALPHA = 0.34;
/** Fraction of the half-field that counts as "looking at it". */
const FIGURE_FOCUS_CONE = 0.6;
/**
 * Fade time constant, in ms. 270 ms is the old 0.06 a frame at 60 Hz, which a
 * 120 Hz screen ran twice as fast.
 */
const FIGURE_FADE_MS = 270;

/**
 * FIGURE ARTWORK.
 *
 * Every constellation the pack illustrates carries its drawn figure (see
 * scripts/build-constellation-art.mjs). It rides the same fade as the lines, so
 * the hunter appears when you look at Orion and is gone by the time you have
 * turned away, and it is drawn UNDER the lines so the schematic stays readable
 * on top of the illustration.
 *
 * Kept very faint on purpose. These are 19th-century figure drawings and the
 * app is not one; at full strength they take the screen away from the sky,
 * which is the thing the user actually came to see.
 */
const ART_ALPHA = 0.22;

/**
 * Height kept clear above the bottom edge for the time and mode controls,
 * until they have been measured. The frame loop uses the measured top of the
 * controls once it has it: the fixed 330 reserved half the screen below the
 * middle, and a lit figure there drew with none of its stars named.
 */
const CONTROLS_CLEARANCE = 330;

/**
 * THE SKY'S OWN GROUND as the sun rises through the scrubber. Night is black;
 * each twilight band lightens it, and stars fade in step. Keyed by the sun's
 * altitude in degrees.
 */
const SKY_STOPS: [number, string][] = [
  [-18, Colors.space],
  [-12, SkyColors.twilightAstro],
  [-6, SkyColors.twilightNautical],
  [-1, SkyColors.twilightCivil],
  [6, SkyColors.daylight],
];
const SKY_RGB = SKY_STOPS.map(([alt, hex]) => ({
  alt,
  rgb: [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)),
}));
function skyGround(sunAlt: number): number[] {
  if (sunAlt <= SKY_RGB[0].alt) return SKY_RGB[0].rgb;
  for (let i = 1; i < SKY_RGB.length; i++) {
    if (sunAlt <= SKY_RGB[i].alt) {
      const a = SKY_RGB[i - 1], b = SKY_RGB[i];
      const k = (sunAlt - a.alt) / (b.alt - a.alt);
      return a.rgb.map((v, c) => Math.round(v + (b.rgb[c] - v) * k));
    }
  }
  return SKY_RGB[SKY_RGB.length - 1].rgb;
}

const rgbOf = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const GROUND_NIGHT = rgbOf(SkyColors.groundNight);
const GROUND_DAY = rgbOf(SkyColors.groundDay);
const unit = (hex: string) => rgbOf(hex).map((v) => v / 255) as unknown as Rgb;

/**
 * STAR COLOUR. A bin's colour is the blackbody at its temperature, read from
 * Mitchell Charity's table in log temperature, then mixed a third of the way
 * back to moonlight. The mix is a print decision: a star is a point, and the
 * eye sees a point's colour less saturated than the same light spread over an
 * area, which is why Betelgeuse reads as orange-white and not as a traffic
 * light.
 */
const STAR_TINT_STRENGTH = 0.67;
function kelvinColour(k: number): Rgb {
  const lk = Math.log(k);
  let i = 1;
  while (i < Blackbody.length - 1 && Blackbody[i][0] < k) i++;
  const [k0, c0] = Blackbody[i - 1];
  const [k1, c1] = Blackbody[i];
  const t = Math.max(0, Math.min(1, (lk - Math.log(k0)) / (Math.log(k1) - Math.log(k0))));
  const a = unit(c0), b = unit(c1), n = unit(Colors.moonlight);
  return [0, 1, 2].map((ch) => {
    const bb = a[ch] + (b[ch] - a[ch]) * t;
    return n[ch] + (bb - n[ch]) * STAR_TINT_STRENGTH;
  }) as unknown as Rgb;
}
const STAR_COLOURS: Rgb[] = [unit(Colors.moonlight), ...STAR_TINT_KELVIN.map(kelvinColour)];

/** The point a planet's brightness makes on the eye, before its disc is resolved. */
function pointRadius(magnitude: number): number {
  const t = Math.max(0, (MAG_LIMIT - magnitude) / (MAG_LIMIT + 1.5));
  return Math.max(1.2, Math.min(4.5, 0.45 + t * t * 4));
}

type Pickable = {
  x: number;
  y: number;
  name: string;
  kind: "Star" | "Planet" | "Moon" | "Sun";
  mag?: number;
  ra?: number;
  dec?: number;
};

/**
 * IMMERSIVE SKY — spec §7.
 *
 * The framing is the point and it is not "look at the sky": pointing a phone at
 * the sky shows you TONIGHT, which is a strictly worse Stellarium. This is the
 * sky **as it was, from there, then** — the same gesture aimed into a night
 * that is years gone and cannot be pointed at any more.
 *
 * Reusing the same pipeline for /sky/tonight synthesizes a pseudo-milestone for
 * tonight over current location without adding it to the persistent store.
 *
 * TONIGHT IS NOW, AND IT IS HERE OR NOWHERE. It used to fall back to London
 * labelled "Current Location" when the phone's place was unknown, and to draw
 * local midnight under the words "Live celestial sphere". Both were claims the
 * data did not support. Without a place it asks for one; with one it draws the
 * moment the view opened.
 */
export default function ImmersiveSkyScreen() {
  const { id, date: selectedDate, focus, x, y, size } = useLocalSearchParams<{ id: string; date?: string; focus?: string; x?: string; y?: string; size?: string }>();
  const previewDate = selectedDate && /^\d{4}-\d{2}-\d{2}$/.test(selectedDate) ? selectedDate : todayDateString();
  const isPreview = id === "preview";
  const reduced = useReducedMotion();
  const [focused, setFocused] = useState(true);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));
  const [entry] = useState(() => {
    const left = Number(x), top = Number(y), diameter = Number(size);
    return focus === "moon" && [left, top, diameter].every(Number.isFinite) && diameter > 0 && diameter < 1000
      ? { x: left + diameter / 2, y: top + diameter / 2, radius: diameter / 2 } : null;
  });
  const [skyReady, setSkyReady] = useState(false);
  // Milliseconds of entrance and exit played so far. Advanced per frame by at
  // most ENTRANCE_STEP_MS, so a slow frame delays the zoom instead of skipping
  // part of it, which is what a wall clock did on a cold first frame.
  const entryMs = useRef<number | null>(null);
  const exitMs = useRef<number | null>(null);
  const entryProgress = useRef(0);
  const exitFrom = useRef(1);
  const closeSky = () => {
    if (!entry || reduced || !skyReady) router.back();
    else if (exitMs.current == null) {
      exitFrom.current = entryProgress.current;
      exitMs.current = 0;
    }
  };
  const isTonight = id === "tonight";
  const milestoneFromStore = useMilestone(id);
  const {
    location: currentLocation,
    permission,
    locating,
    request: requestLocation,
  } = useCurrentLocation();

  const milestone = useMemo<Milestone | null>(() => {
    if (!isTonight && !isPreview) return milestoneFromStore ?? null;
    return {
      id: "tonight",
      title: "Tonight",
      type: "custom",
      date: isPreview ? previewDate : todayDateString(),
      location: currentLocation,
      createdAt: new Date().toISOString(),
    };
  }, [isTonight, isPreview, previewDate, milestoneFromStore, currentLocation]);

  const insets = useSafeAreaInsets();
  const insetTop = insets.top;
  const { width, height } = useWindowDimensions();

  // The lens the view opens with, and the one "Reset zoom" returns to.
  const eyeFov = eyeFieldOfView(width, height);
  // React hears the field of view when a pinch ends, for the reset button and
  // the sensor smoothing. The frame loop reads the refs below, every frame.
  const [fov, setFov] = useState(eyeFov);
  const [showHelp, setShowHelp] = useState(true);
  const [showDebug, setShowDebug] = useState(false);
  // The drag tip shows until the first drag or tap, once per install. Every
  // visit repeated it, which is a sentence nobody needs twice.
  const hasSeenDragHint = useSettingsStore((s) => s.hasSeenDragHint);
  const setHasSeenDragHint = useSettingsStore((s) => s.setHasSeenDragHint);
  useEffect(() => {
    if (!showHelp && !hasSeenDragHint) setHasSeenDragHint(true);
  }, [showHelp, hasSeenDragHint, setHasSeenDragHint]);
  // "Find the moon" is offered only while the moon is off screen. The frame
  // loop owns that fact, so it publishes it only when it flips, never per frame.
  const [moonOff, setMoonOff] = useState(false);
  const moonOffRef = useRef(false);
  // FOV feeds the hook so tracking tightens as the view narrows. Diagnostics
  // only publish while their panel is open, so a closed panel costs nothing.
  const orientation = useSkyOrientation(180, fov, showDebug);

  // The instant the sky opens on. Tonight is the moment the view opened; a
  // record is local midnight ending its date, in its own place's time.
  const [openedAt] = useState(() => new Date());
  const place = milestone?.location ?? null;
  const anchor = useMemo(() => {
    if (!milestone?.location) return null;
    return isTonight
      ? openedAt
      : toLocalNight(milestone.date, milestone.location.timezoneOffsetMin);
  }, [milestone, isTonight, openedAt]);

  // The stars are computed ONCE, for the anchor. Scrubbing turns the camera
  // about the pole instead of moving six thousand vectors (skyNight.siderealCamera).
  // Tonight's sphere is built for the twenty-minute step around the opening
  // moment, so the one Home built ahead of time is the one used here; the
  // sidereal delta below is taken from that step and is exact (skyCache.ts).
  const sphereAnchorMs = anchor ? (isTonight ? moonStepOf(anchor.getTime()) : anchor.getTime()) : null;
  const sphere = useMemo(
    () => (place && sphereAnchorMs != null ? skySphereFor(place, sphereAnchorMs) : null),
    [place, sphereAnchorMs]
  );

  const night = useMemo(
    () => (place && anchor ? nightWindow(anchor, place) : null),
    [place, anchor]
  );
  const [scrubMs, setScrubMs] = useState<number | null>(null);
  const timeMs = scrubMs ?? anchor?.getTime() ?? openedAt.getTime();

  // What moves against the stars, at the scrubbed instant. Recomputed per
  // ten-minute step of the scrubber, never per frame.
  const bodies = useMemo(() => {
    if (!place) return [];
    const solar = getSolarSystemSky(new Date(timeMs), place);
    const shape = (b: SkyBody, kind: "planet" | "moon" | "sun") => ({
      id: b.id,
      label: b.label,
      vec: horizonVector(b.altitudeDeg, b.azimuthDeg),
      magnitude: b.magnitude,
      kind,
      // Everything the view needs to draw it at its true size.
      radiusDeg: angularRadiusDeg(b.radiusKm, b.distanceAu),
      flattening: b.flattening,
      phaseAngleDeg: b.phaseAngleDeg,
      poleVec: b.pole ? horizonVector(b.pole.altitudeDeg, b.pole.azimuthDeg) : null,
      ringTiltDeg: b.ringTiltDeg,
    });
    const out = solar.planets.map((p) => shape(p, "planet"));
    if (solar.moon) out.push(shape(solar.moon, "moon"));
    if (solar.sun) out.push(shape(solar.sun, "sun"));
    return out;
  }, [place, timeMs]);
  const sunAlt = useMemo(() => {
    const sun = bodies.find((b) => b.kind === "sun");
    return sun ? Math.asin(sun.vec[2]) / DEG : -90;
  }, [bodies]);
  const shadow = useMemo(
    () => (place ? eclipseShadow(new Date(timeMs), place) : null),
    [place, timeMs]
  );

  // The moon as itself. Its phase and tilt drift slowly through a night, so the
  // image is redrawn per twenty minutes of scrubbing, offscreen, once each, and
  // not until the finger rests: each redraw shades 2048 px on this thread and
  // copies 16 MB off the GPU, and one drag across a night made 42 of them.
  // Tonight's image is drawn for the step around the opening moment too, so
  // Home's prewarmed image is a cache hit. That is at most ten minutes of
  // terminator drift on a disc 25 px across at the eye's field of view; the
  // label below stays exact.
  const moonTime = scrubMs != null || isTonight ? moonStepOf(timeMs) : timeMs;
  const moonLight = useMemo(() => {
    if (!place) return null;
    const phase = getMoonPhase(new Date(timeMs));
    return {
      ...moonLightAt(new Date(moonTime), place),
      label: `${describePhase(phase)}, ${formatIllumination(phase.phaseFraction)} lit`,
    };
  }, [place, moonTime, timeMs]);
  const moonKey = place ? skyMoonKey(place, moonTime) : null;
  const moonTextures = useMoonTextures(MOON_IMG);
  const [moonImage, setMoonImage] = useState<SkImage | null>(() => (moonKey ? cachedSkyMoonImage(moonKey) : null));
  useEffect(() => {
    if (!moonKey || !moonLight || !moonTextures) return;
    const hit = cachedSkyMoonImage(moonKey);
    if (hit) {
      setMoonImage(hit);
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      drawSkyMoonImage(moonKey, moonLight, moonTextures).then((img) => {
        if (alive && img) setMoonImage(img);
      });
    }, scrubMs == null ? 0 : 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [moonKey, moonTextures]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Everything the frame loop needs that changes with the scrubber, in one ref.
   * `version` bumps on every change so a still camera still redraws once.
   */
  const skyRef = useRef({
    lat: 0,
    delta: 0,
    bodies: [] as typeof bodies,
    sunAlt: -90,
    shadow: null as EclipseShadow | null,
    moonImage: null as SkImage | null,
    version: 0,
  });
  useEffect(() => {
    skyRef.current = {
      lat: place?.latitude ?? 0,
      delta: sphereAnchorMs != null ? siderealDelta(new Date(sphereAnchorMs), new Date(timeMs)) : 0,
      bodies,
      sunAlt,
      shadow,
      moonImage,
      version: skyRef.current.version + 1,
    };
  }, [place, sphereAnchorMs, timeMs, bodies, sunAlt, shadow, moonImage]);

  // Last frame's named things, for tap-to-identify.
  const pickRef = useRef<Pickable[]>([]);
  // Where the controls start, measured, so labels can use the sky down to them.
  const controlsTop = useRef<number | null>(null);
  const [picked, setPicked] = useState<{ name: string; kind: string; detail: string } | null>(null);


  // Reused across frames; never reallocated.
  const buf = useRef(new Float32Array(CATALOG.length * 3));

  /**
   * Where the pinch has put the field of view, and what the frame loop is
   * showing. The shown value glides toward the target (lib/glide.ts), so a
   * pinch is smooth however unevenly its events arrive, and a reset coasts
   * back rather than jumping. A pinch used to call setFov on every event,
   * re-rendering this whole screen sixty times a second while the fingers moved.
   */
  const fovTarget = useRef(eyeFov);
  const fovShown = useRef(eyeFov);
  const fovCoast = useRef(false);
  const orientationRef = useRef(orientation);
  orientationRef.current = orientation;
  const fovStart = useRef(eyeFov);
  const lastPan = useRef({ x: 0, y: 0 });
  const resetZoom = () => {
    fovTarget.current = eyeFov;
    fovCoast.current = true;
    setFov(eyeFov);
  };

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => {
          lastPan.current = { x: 0, y: 0 };
          setShowHelp(false);
        })
        .onUpdate((e) => {
          orientationRef.current.pan(
            e.translationX - lastPan.current.x,
            e.translationY - lastPan.current.y,
            fovShown.current,
            width
          );
          lastPan.current = { x: e.translationX, y: e.translationY };
        })
        // A flick keeps the sky turning for a moment, the way a page keeps
        // scrolling after the finger leaves it.
        .onEnd((e) => orientationRef.current.release(e.velocityX, e.velocityY, fovShown.current, width))
        .runOnJS(true),
    [width]
  );

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onBegin(() => {
          fovStart.current = fovTarget.current;
          fovCoast.current = false;
        })
        .onUpdate((e) => {
          // Pinching out narrows the field of view, i.e. zooms in.
          const next = fovStart.current / e.scale;
          fovTarget.current = Math.max(FOV_MIN, Math.min(FOV_MAX, next));
        })
        .onEnd(() => setFov(fovTarget.current))
        .runOnJS(true),
    []
  );

  // TAP TO NAME. The nearest named thing within a fingertip of the tap, from
  // the positions the last frame drew, so what is named is what was under it.
  const identify = (x: number, y: number) => {
    let best: Pickable | null = null;
    let bestD = 30;
    for (const p of pickRef.current) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    setShowHelp(false);
    if (!best || !place) {
      setPicked(null);
      return;
    }
    const at = new Date(timeMs);
    const constellationOf = (raDeg: number, dec: number) =>
      Astronomy.Constellation(raDeg / 15, dec).name;
    const bodyConstellation = (name: string) => {
      const body = Astronomy.Body[name as keyof typeof Astronomy.Body];
      const observer = new Astronomy.Observer(place.latitude, place.longitude, 0);
      const eq = Astronomy.Equator(body, at, observer, false, true);
      return Astronomy.Constellation(eq.ra, eq.dec).name;
    };
    const mag = (m?: number) => (m == null ? "" : `, magnitude ${m.toFixed(1)}`);
    let detail = "";
    switch (best.kind) {
      case "Star":
        detail = `In ${constellationOf(best.ra!, best.dec!)}${mag(best.mag)}`;
        break;
      case "Planet":
        detail = `In ${bodyConstellation(best.name)}${mag(best.mag)}`;
        break;
      case "Moon":
        detail = `${moonLight?.label ?? ""}, in ${bodyConstellation("Moon")}${shadow ? `. A ${shadow.phase} lunar eclipse is under way.` : ""}`;
        break;
      case "Sun":
        detail = sunAlt > 0 ? "Above the horizon, so the stars around it would not have been visible." : "Below the horizon.";
        break;
    }
    setPicked({ name: best.kind === "Moon" ? "The Moon" : best.name, kind: best.kind, detail });
  };

  const identifyRef = useRef(identify);
  identifyRef.current = identify;
  // Memoised so a render does not hand Gesture Handler a new gesture to
  // re-register, which the label and scrubber renders did mid-drag.
  const gesture = useMemo(
    () =>
      Gesture.Race(
        Gesture.Tap()
          .maxDistance(12)
          .onEnd((e) => identifyRef.current(e.x, e.y))
          .runOnJS(true),
        Gesture.Simultaneous(panGesture, pinchGesture)
      ),
    [panGesture, pinchGesture]
  );

  // A dragged view opens facing the moon when it is up, not due south.
  const facedMoon = useRef(false);
  useEffect(() => {
    if (facedMoon.current || orientation.mode !== "drag") return;
    const moon = bodies.find((b) => b.kind === "moon");
    if (!moon || (focus !== "moon" && moon.vec[2] <= 0)) return;
    facedMoon.current = true;
    orientation.lookAt(Math.atan2(moon.vec[0], moon.vec[1]) / DEG, Math.asin(moon.vec[2]) / DEG, true);
  }, [bodies, orientation, focus]);

  /**
   * FRAME LOOP.
   *
   * Everything below runs outside React. The paths live in Reanimated shared
   * values, so Skia redraws when they change without a render pass, a
   * reconciliation, or a tree diff. React only re-renders when something a
   * person changed — the field of view, the mode — not when the sky moves.
   *
   * This is the fix for "30-50fps rendered but the data updating at 10-20Hz":
   * the frames were never the problem, the update path was.
   */
  /**
   * ONE PICTURE PER FRAME.
   *
   * Geometry and text are recorded together into a single SkPicture and handed
   * to Skia through a shared value. Nothing here is a React element, so nothing
   * can run on a different clock from anything else — which is what made the
   * labels chase the stars they name. Previously the sky drew from shared
   * values at 60fps while labels came from React state at 10Hz; now a star and
   * its name are literally drawn by the same instruction stream.
   */
  // Seeded with an empty picture rather than null: <Picture> wants a real
  // SkPicture every render, and an empty one draws nothing on the first frame.
  const picture = useSharedValue<SkPicture>(
    (() => {
      const r = Skia.PictureRecorder();
      r.beginRecording();
      return r.finishRecordingAsPicture();
    })()
  );
  // All three or none, decoded once per run, so the frame loop below starts once
  // rather than once per asset as each arrived (skyAssets.ts).
  const assets = useSkyAssets();
  const drawnRef = useRef(0);
  const [drawn, setDrawn] = useState(0);
  const showDebugRef = useRef(showDebug);
  showDebugRef.current = showDebug;

  useEffect(() => {
    if (!focused || !sphere || !assets) return;
    const { labelFont, artSheet, milkyWay } = assets;
    let raf = 0;
    let frames = 0;

    // Per-constellation alpha, carried across frames so the fade has somewhere
    // to live. Reallocated with the sphere, which is correct: a new date or
    // place is a new sky and nothing should still be lit from the old one.
    const figureAlpha = new Float32Array(sphere.figures.length).fill(
      FIGURE_BASE_ALPHA
    );

    // The alt/az grid and the horizon never change for a given sky, so their
    // vertices are built here once. They used to be rebuilt inside the frame,
    // about a thousand small arrays every sixtieth of a second.
    const ring = (altDeg: number): Float32Array => {
      const out = new Float32Array(91 * 3);
      const ca = Math.cos(altDeg * DEG);
      const sa = Math.sin(altDeg * DEG);
      for (let k = 0, az = 0; az <= 360; az += 4, k += 3) {
        out[k] = ca * Math.sin(az * DEG);
        out[k + 1] = ca * Math.cos(az * DEG);
        out[k + 2] = sa;
      }
      return out;
    };
    const gridLines: Float32Array[] = [-60, -30, 30, 60].map(ring);
    for (let az = 0; az < 360; az += 30) {
      const pts = new Float32Array(46 * 3);
      for (let k = 0, alt = -90; alt <= 90; alt += 4, k += 3) {
        pts[k] = Math.cos(alt * DEG) * Math.sin(az * DEG);
        pts[k + 1] = Math.cos(alt * DEG) * Math.cos(az * DEG);
        pts[k + 2] = Math.sin(alt * DEG);
      }
      gridLines.push(pts);
    }
    const horizonLine = ring(0);

    // One scratch point for every projected vertex in the frame.
    const scratch = { x: 0, y: 0 };
    const addPolyline = (
      path: ReturnType<typeof Skia.PathBuilder.Make>,
      pts: Float32Array,
      cam: CameraBasis
    ) => {
      let started = false;
      for (let i = 0; i < pts.length; i += 3) {
        if (!projectInto(pts[i], pts[i + 1], pts[i + 2], cam, width, height, scratch)) {
          started = false;
          continue;
        }
        if (!started) { path.moveTo(scratch.x, scratch.y); started = true; }
        else path.lineTo(scratch.x, scratch.y);
      }
    };

    // WHAT THE LAST PICTURE WAS DRAWN FOR. A still sky used to be recorded again
    // sixty times a second. Now a frame records only when the camera or the
    // field of view has moved, or while a figure is still fading.
    let lastFov = NaN;
    const lastAxes = new Float32Array(6).fill(NaN);
    let lastVersion = -1;
    let fading = false;

    // Paints are built once. Allocating them per frame is pure waste.
    const starPaint = Skia.Paint(); starPaint.setColor(Skia.Color(Colors.moonlight));
    // One paint and one path per colour bin (skyLight.starTint): colour costs
    // ten fills a frame, and nothing else. The glow underneath stays one
    // neutral path, because the halo is the air's and the eye's, not the star's.
    const tintPaints = STAR_COLOURS.map((c) => { const p = Skia.Paint(); p.setColor(Skia.Color([c[0], c[1], c[2], 1])); p.setAntiAlias(true); return p; });
    const tintBuf = new Uint8Array(sphere.count);
    // The Milky Way's map as a shader, wrapping in right ascension.
    const mapShader = milkyWay ? milkyWay.makeShaderOptions(TileMode.Repeat, TileMode.Clamp, FilterMode.Linear, MipmapMode.None) : null;
    const skyLightPaint = Skia.Paint(); skyLightPaint.setBlendMode(BlendMode.Plus);
    const bodyPaint = Skia.Paint(); bodyPaint.setAntiAlias(true);
    const glarePaint = Skia.Paint(); glarePaint.setBlendMode(BlendMode.Plus);
    const MW_TINT = unit(SkyColors.milkyWay);
    const MOONLIT = unit(SkyColors.moonlitSky);
    const SUN = unit(SkyColors.sun);
    const DISC = SkyColors.planetDisc as Record<string, string>;
    // The eye's adaptation to the dark, from 0 when the view opens.
    let adaptation = reduced ? 1 : 0;
    // Stars below the horizon stay visible, because the view passes through
    // the ground, but they are drawn as the ground's and not the sky's.
    const belowPaint = Skia.Paint(); belowPaint.setColor(Skia.Color(Colors.moonlight)); belowPaint.setAlphaf(0.22);
    const moonPaint = Skia.Paint(); moonPaint.setAntiAlias(true);
    /**
     * THE MOON IS ADDED TO THE SKY, NOT PAINTED OVER IT.
     *
     * Its offscreen image is opaque across the whole disc, night side included,
     * which is right on black and wrong on anything else: in twilight or by day
     * the night side drew as a dark coin on a blue sky. The real night side is
     * the colour of the sky in front of it, because what you see there is the
     * air's own light. So the disc first covers whatever is behind it with the
     * sky's colour (the stars it hides), and the moon is then ADDED on top. At
     * night that is exactly the old picture; by day the dark side vanishes and
     * the lit side reads as pale. The layer's colour filter is the air
     * (skyView.moonSkyLight), set per frame.
     */
    const moonLayer = Skia.Paint(); moonLayer.setBlendMode(BlendMode.Plus);
    // The Earth's shadow multiplies the moon INSIDE the moon's own layer.
    // Multiplying it onto the screen, as before, also darkened a circle of sky
    // round the disc, invisible on black and a dark ring in a twilight eclipse.
    // Modulate, unlike Multiply, leaves transparent pixels transparent.
    //
    // One radial gradient, not two flat discs. The penumbra is where the Earth
    // covers part of the sun, so it darkens steadily from nothing at its outer
    // edge to its deepest at the umbra; drawn as a flat disc, its edge cut a
    // hard straight line across the moon. The umbra's own edge is softened by
    // a few percent, as the atmosphere's refraction softens the real one.
    const shadowPaint = Skia.Paint(); shadowPaint.setBlendMode(BlendMode.Modulate); shadowPaint.setAntiAlias(true);
    const umbraColor = Skia.Color(SkyColors.umbra);
    const penumbraColor = Skia.Color(SkyColors.penumbra);
    // Modulate by one is no change: the arithmetic identity, not a colour.
    const noShadow = Skia.Color([1, 1, 1, 1]);
    const glowPaint = Skia.Paint();
    glowPaint.setColor(Skia.Color(Colors.moonlight));
    glowPaint.setAlphaf(0.42);
    glowPaint.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 3.5, true));

    const mk = (color: string, alpha: number, width_?: number) => {
      const p = Skia.Paint();
      p.setColor(Skia.Color(color));
      p.setAlphaf(alpha);
      if (width_ !== undefined) { p.setStyle(1); p.setStrokeWidth(width_); }
      return p;
    };
    // Dimmed hard: this is scaffolding you should feel rather than read.
    const gridPaint = mk(SkyColors.grid, 0.07, 0.5);
    // Alpha is set per draw by the fade; the value here is only a seed.
    const figurePaint = mk(SkyColors.figure, FIGURE_BASE_ALPHA, 0.6);
    const horizonPaint = mk(SkyColors.horizon, 0.32, 1.0);
    // SkyColors.planet, not the app accent: under Atlas the accent is the same
    // blue as the grid, so a planet would be indistinguishable from a meridian.
    const planetPaint = mk(SkyColors.planet, 1);
    const planetGlow = Skia.Paint();
    planetGlow.setColor(Skia.Color(SkyColors.planet));
    planetGlow.setAlphaf(0.4);
    planetGlow.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 5, true));
    // Plus (additive) blending is what makes the black ground of a greyscale
    // illustration disappear: black adds nothing. Anything else would paste a
    // black square over the star field.
    const artPaint = Skia.Paint();
    artPaint.setBlendMode(BlendMode.Plus);
    const conNamePaint = mk(SkyColors.figure, 1);
    const labelPaint = mk(SkyColors.label, 0.85);
    const labelAccent = mk(SkyColors.planet, 0.95);
    // Bayer letters and numbers on a lit figure's stars. Alpha follows the figure.
    const figureStarPaint = mk(SkyColors.label, 0.8);
    const cardinalPaint = mk(Colors.plateInk, 0.9);
    const cardinalMinor = mk(Colors.plateMuted, 0.8);
    const arrowPaint = mk(Colors.plateInk, 0.9);
    const skyPaint = Skia.Paint(); skyPaint.setAntiAlias(true);
    const groundPaint = Skia.Paint(); groundPaint.setAntiAlias(true);
    // The same few dozen names are measured every frame, and each measure is a
    // native call. The effect re-runs when the font changes, so the cache does too.
    const widths = new Map<string, number>();
    const textWidth = (text: string) => {
      let w = widths.get(text);
      if (w === undefined) widths.set(text, (w = labelFont.measureText(text).width));
      return w;
    };
    const up0 = { forward: { x: 0, y: 0, z: 1 }, right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 } };

    let ready = false;
    let displayedDelta = skyRef.current.delta;
    let displayedBodies = skyRef.current.bodies.map((body) => ({ ...body, vec: [...body.vec] as [number, number, number] }));
    let lastTick = performance.now();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      const targetSky = skyRef.current;
      if (entry && moonEffect && !targetSky.moonImage) return;
      const firstFrame = !ready;
      if (!ready) {
        ready = true;
        entryMs.current ??= 0;
        setSkyReady(true);
      }
      const leaving = exitMs.current != null;
      const step = firstFrame ? 0 : Math.min(now - lastTick, ENTRANCE_STEP_MS);
      if (leaving) exitMs.current! += step;
      else entryMs.current! += step;
      const elapsed = leaving ? exitMs.current! / 520 : entryMs.current! / 720;
      const raw = reduced || !entry ? 1 : Math.min(1, elapsed);
      const eased = lenis(raw);
      const progress = leaving ? exitFrom.current * (1 - eased) : eased;
      entryProgress.current = progress;
      if (leaving && raw >= 1) {
        cancelAnimationFrame(raf);
        router.back();
        return;
      }
      // The scrubber moves in ten-minute steps; the sky glides between them.
      const dt = reduced ? 1e6 : now - lastTick;
      lastTick = now;
      displayedDelta = glide(displayedDelta, targetSky.delta, dt, 80);
      if (displayedBodies.length !== targetSky.bodies.length) displayedBodies = targetSky.bodies.map((body) => ({ ...body, vec: [...body.vec] as [number, number, number] }));
      let drifting = Math.abs(targetSky.delta - displayedDelta) > 1e-7;
      for (let i = 0; i < displayedBodies.length; i++) {
        for (let axis = 0; axis < 3; axis++) {
          const goal = targetSky.bodies[i].vec[axis];
          if (Math.abs(goal - displayedBodies[i].vec[axis]) > 1e-7) drifting = true;
          displayedBodies[i].vec[axis] = glide(displayedBodies[i].vec[axis], goal, dt, 80);
        }
      }
      const sky = { ...targetSky, delta: displayedDelta, bodies: displayedBodies };
      fovShown.current = glide(fovShown.current, fovTarget.current, dt, fovCoast.current ? GLIDE.coast : GLIDE.follow);
      if (Math.abs(fovShown.current - fovTarget.current) < 1e-3) fovShown.current = fovTarget.current;
      // THE ENTRANCE IS A ZOOM OUT. The view opens at the field of view in
      // which the moon's true size matches the moon it was tapped on, then
      // widens to the eye's, geometrically so each frame zooms by the same
      // factor. Nothing is scaled: the moon shrinks because the field grows.
      const moonNow = sky.bodies.find((b) => b.kind === "moon");
      const fromFov = entry && moonNow
        ? Math.min(FOV_MAX, Math.max(FOV_MIN * 0.25, (2 * Math.atan(((width / 2) * Math.tan(moonNow.radiusDeg * DEG)) / entry.radius)) / DEG))
        : fovShown.current;
      const f = entry ? Math.exp(Math.log(fromFov) + (Math.log(fovShown.current) - Math.log(fromFov)) * progress) : fovShown.current;
      const darkTarget = twilightClearance(sky.sunAlt);
      adaptation = adapt(adaptation, darkTarget, reduced ? 1e6 : dt);
      if (Math.abs(adaptation - darkTarget) > 0.002) drifting = true;
      const axes = orientationRef.current.axesRef.current;

      const moved =
        f !== lastFov ||
        sky.version !== lastVersion ||
        Math.abs(axes.forward.x - lastAxes[0]) > 1e-6 ||
        Math.abs(axes.forward.y - lastAxes[1]) > 1e-6 ||
        Math.abs(axes.forward.z - lastAxes[2]) > 1e-6 ||
        Math.abs(axes.up.x - lastAxes[3]) > 1e-6 ||
        Math.abs(axes.up.y - lastAxes[4]) > 1e-6 ||
        Math.abs(axes.up.z - lastAxes[5]) > 1e-6;
      if (!moved && !fading && !drifting && raw >= 1 && !leaving) return;
      lastFov = f;
      lastVersion = sky.version;
      lastAxes[0] = axes.forward.x;
      lastAxes[1] = axes.forward.y;
      lastAxes[2] = axes.forward.z;
      lastAxes[3] = axes.up.x;
      lastAxes[4] = axes.up.y;
      lastAxes[5] = axes.up.z;

      // TWO CAMERAS. The stars were computed for the anchor instant; the sky
      // has turned about the pole since, so they are seen through a camera
      // turned the other way (skyNight.siderealCamera). The ground, the
      // horizon, the compass points and the bodies of the solar system are
      // already where they are now, and use the camera as it is.
      const skyAxes = siderealCamera(axes, sky.lat, sky.delta);
      const cam = cameraBasisFromAxes(skyAxes, f, width);
      const ground = cameraBasisFromAxes(axes, f, width);
      const zenith = siderealCamera(up0, sky.lat, sky.delta).forward;
      const rollDeg = rollFromAxes(axes);
      const picks: Pickable[] = [];

      // How dark the sky is, 1 at night and 0 once the sun is up. Stars and
      // figures fade with it, so a scrub into dawn reads as dawn.
      const dark = Math.min(1, Math.max(0, (-sky.sunAlt - 1) / 11)) * progress;

      // Angular distance threshold for labels (central comfort cone)
      const labelMaxAngleDeg = (f / 2) * 0.75;
      const minLabelCos = Math.cos((labelMaxAngleDeg * Math.PI) / 180);

      const rec = Skia.PictureRecorder();
      const cv = rec.beginRecording();

      // The sky's own colour, from the sun's altitude at the scrubbed instant.
      const g = skyGround(sky.sunAlt);
      skyPaint.setColor(Skia.Color(`rgb(${g[0]},${g[1]},${g[2]})`));
      cv.drawRect(Skia.XYWHRect(0, 0, width, height), skyPaint);

      // ---- The Milky Way, and the sky the moon lights (components/sky/skyShader.ts) ----
      const glowOn = Math.min(1, Math.max(0, (-sky.sunAlt - 6) / 6)) * progress;
      const mwExposure = Math.pow(MILKY_WAY_PEAK, 2.2) * adaptation * progress;
      if (skyEffect && mapShader && (mwExposure > 1e-5 || glowOn > 0.01)) {
        const moonB = sky.bodies.find((b) => b.kind === "moon");
        // The moon is placed in the current horizon frame; the shader works in
        // the sphere's, so it is turned back by the same sidereal rotation.
        const moonSky = moonB
          ? siderealCamera({ forward: { x: moonB.vec[0], y: moonB.vec[1], z: moonB.vec[2] }, right: up0.right, up: up0.up }, sky.lat, sky.delta).forward
          : { x: 0, y: 0, z: -1 };
        const moonZenith = moonB ? 90 - Math.asin(Math.max(-1, Math.min(1, moonB.vec[2]))) / DEG : 180;
        const moonTerm = moonB && moonZenith < 90
          ? moonIntensity(moonB.phaseAngleDeg) * Math.pow(10, -0.4 * KS_EXTINCTION * ksAirmass(moonZenith))
          : 0;
        const M = sphere.toEquatorial;
        skyLightPaint.setShader(skyEffect.makeShaderWithChildren(packUniforms({
          uSize: [width, height],
          uFocal: cam.focal,
          uF: [cam.fx, cam.fy, cam.fz],
          uR: [cam.rx, cam.ry, cam.rz],
          uU: [cam.ux, cam.uy, cam.uz],
          uZenith: [zenith.x, zenith.y, zenith.z],
          uEq0: [M[0], M[1], M[2]],
          uEq1: [M[3], M[4], M[5]],
          uEq2: [M[6], M[7], M[8]],
          uMapSize: [milkyWayMap.width, milkyWayMap.height],
          uGamma: milkyWayMap.gamma,
          uExposure: mwExposure,
          uTint: MW_TINT,
          uMoonDir: [moonSky.x, moonSky.y, moonSky.z],
          uMoonTerm: moonTerm,
          uK: KS_EXTINCTION,
          uDarkNl: DARK_SKY_NL,
          uGlow: MOONLIT,
          uGlowOn: glowOn,
          uBelow: 0.22,
        }), [mapShader]));
        cv.drawRect(Skia.XYWHRect(0, 0, width, height), skyLightPaint);
      }

      // ---- Sphere scaffolding ----
      const grid = Skia.PathBuilder.Make();
      for (const line of gridLines) addPolyline(grid, line, ground);
      cv.drawPath(grid.detach(), gridPaint);

      // ---- Constellation figures, faded by where you are looking ----
      //
      // Figures at the resting alpha all go into ONE path and draw in a single
      // call, which is what the whole set used to do. Only the handful actually
      // fading get their own path and their own alpha, so the common case costs
      // exactly what it did before.
      const focusCos = Math.cos((f / 2) * FIGURE_FOCUS_CONE * DEG);
      const restingFigures = Skia.PathBuilder.Make();
      const litFigures: { path: any; alpha: number }[] = [];
      const conNames: { x: number; y: number; text: string; alpha: number; below: boolean }[] = [];
      const figureStars: { x: number; y: number; text: string; alpha: number; below: boolean }[] = [];
      // The sky's zenith in the sphere's own frame, for "is this star under the ground".
      const underfoot = (v: [number, number, number]) => v[0] * zenith.x + v[1] * zenith.y + v[2] * zenith.z < 0;
      fading = false;

      for (let ci = 0; ci < sphere.figures.length; ci++) {
        const con = sphere.figures[ci];
        const c = con.centroid;
        const dot =
          c[0] * skyAxes.forward.x + c[1] * skyAxes.forward.y + c[2] * skyAxes.forward.z;
        const target = dot >= focusCos ? FIGURE_FOCUS_ALPHA : FIGURE_BASE_ALPHA;
        let alpha = glide(figureAlpha[ci], target, dt, FIGURE_FADE_MS);
        // Land exactly on the target once the step is too small to see. An
        // exponential ease never arrives on its own, and a fade that never
        // finishes would keep a still sky redrawing forever.
        if (Math.abs(target - alpha) < 0.0005) alpha = target;
        else fading = true;
        figureAlpha[ci] = alpha;

        const lit = alpha > FIGURE_BASE_ALPHA + 0.002;
        const path = lit ? Skia.PathBuilder.Make() : restingFigures;
        for (const pts of con.lines) addPolyline(path, pts, cam);
        if (!lit) continue;

        litFigures.push({ path: path.detach(), alpha });
        const shown =
          (alpha - FIGURE_BASE_ALPHA) / (FIGURE_FOCUS_ALPHA - FIGURE_BASE_ALPHA);

        // Artwork goes down here, inside the loop, so it lands beneath every
        // line: the lit paths are all drawn after this loop ends.
        if (artSheet && con.art && shown > 0.02) {
          const m = anchorTransform(
            con.art,
            cam,
            width,
            height,
            CONSTELLATION_ART_TILE
          );
          if (m) {
            const [col, row] = con.art.tile;
            artPaint.setAlphaf(shown * ART_ALPHA * dark);
            cv.save();
            cv.concat(m);
            cv.drawImageRect(
              artSheet,
              Skia.XYWHRect(
                col * CONSTELLATION_ART_TILE,
                row * CONSTELLATION_ART_TILE,
                CONSTELLATION_ART_TILE,
                CONSTELLATION_ART_TILE
              ),
              Skia.XYWHRect(0, 0, CONSTELLATION_ART_TILE, CONSTELLATION_ART_TILE),
              artPaint
            );
            cv.restore();
          }
        }

        if (shown > 0.04) {
          const pt = projectVector(c, cam, width, height);
          if (pt) {
            conNames.push({
              x: pt.x,
              y: pt.y,
              text: con.name.toUpperCase(),
              alpha: shown,
              below: underfoot(c),
            });
          }
        }

        // EVERY STAR OF A LIT FIGURE IS NAMED, the way a chart names it:
        // Betelgeuse, then α, then 47 (scripts/build-constellation-stars.mjs).
        // Only while the figure is up, or the whole sky would be lettered.
        if (shown > 0.25) {
          for (const st of con.stars) {
            const pt = projectVector(st.vec, cam, width, height);
            if (pt) figureStars.push({ x: pt.x, y: pt.y, text: st.label, alpha: shown, below: underfoot(st.vec) });
          }
        }
      }

      figurePaint.setAlphaf(FIGURE_BASE_ALPHA * dark);
      cv.drawPath(restingFigures.detach(), figurePaint);
      for (const lf of litFigures) {
        figurePaint.setAlphaf(lf.alpha * dark);
        cv.drawPath(lf.path, figurePaint);
      }

      // ---- Stars: glow underneath, cores on top ----
      // In twilight the faint stars go first; by sunrise only the brightest are left.
      const baseLimit = f > 70 ? 5.4 : f > 40 ? 6.0 : MAG_LIMIT;
      const limit = Math.min(baseLimit, -1.5 + (baseLimit + 1.5) * dark);
      // The air dims each star by the airmass it is seen through, so the
      // horizon thins out the way it does outside.
      const n = projectSphere(sphere, cam, width, height, buf.current, limit, zenith, tintBuf, KS_EXTINCTION);
      drawnRef.current = n;
      const glow = Skia.PathBuilder.Make();
      const cores = STAR_COLOURS.map(() => Skia.PathBuilder.Make());
      const belowCores = Skia.PathBuilder.Make();
      const b = buf.current;
      for (let i = 0; i < n; i++) {
        const o = i * 3;
        const x = b[o], y = b[o + 1], r = b[o + 2];
        if (r < 0) {
          belowCores.addCircle(x, y, -r);
          continue;
        }
        cores[tintBuf[i]].addCircle(x, y, r);
        if (r > 1.5) glow.addCircle(x, y, r * 2.2);
      }
      cv.drawPath(glow.detach(), glowPaint);
      for (let t = 0; t < cores.length; t++) cv.drawPath(cores[t].detach(), tintPaints[t]);
      cv.drawPath(belowCores.detach(), belowPaint);

      // ---- Solar system, where it stands at the scrubbed instant ----
      const bodySeen: { x: number; y: number; r: number; text: string; accent: boolean; below: boolean }[] = [];
      let moonOnScreen = false;
      for (const body of sky.bodies) {
        const projected = projectVector(body.vec, ground, width, height);
        const isMoon = body.kind === "moon";
        if (!projected && !(isMoon && entry && progress < 1)) continue;
        const destination = projected ?? { x: width / 2, y: height / 2 };
        const pt = isMoon && entry ? {
          x: entry.x + (destination.x - entry.x) * progress,
          y: entry.y + (destination.y - entry.y) * progress,
        } : destination;
        const isSun = body.kind === "sun";
        // TRUE SIZE: the angle the body subtends, through this frame's focal
        // length, stretched by the projection off the centre of the view.
        const zc = Math.max(0.05, body.vec[0] * ground.fx + body.vec[1] * ground.fy + body.vec[2] * ground.fz);
        const trueR = (ground.focal * Math.tan(body.radiusDeg * DEG)) / zc;
        const rr = isMoon ? Math.max(1.2, trueR) : trueR;
        const air = airLight(Math.asin(Math.max(-1, Math.min(1, body.vec[2]))) / DEG);
        const lit = (c: Rgb): Rgb => [c[0] * air.r, c[1] * air.g, c[2] * air.b];
        let labelGap = rr;
        if (isMoon && sky.moonImage) {
          // THE MOON AS ITSELF, at its phase and tilt, turned so its top faces
          // the local zenith on screen, at its true size.
          const v = body.vec;
          const len = Math.hypot(v[0], v[1], v[2] + 0.02);
          const toward = projectVector([v[0] / len, v[1] / len, (v[2] + 0.02) / len], ground, width, height);
          const angle = toward ? Math.atan2(toward.x - pt.x, -(toward.y - pt.y)) / DEG : 0;
          const scale = rr / (MOON_IMG * MOON_IMG_DISC);
          const moonAir = moonSkyLight(Math.asin(Math.max(-1, Math.min(1, v[2]))) / DEG, sky.sunAlt);
          moonLayer.setColorFilter(Skia.ColorFilter.MakeMatrix([
            moonAir.r, 0, 0, 0, 0,
            0, moonAir.g, 0, 0, 0,
            0, 0, moonAir.b, 0, 0,
            0, 0, 0, 1, 0,
          ]));
          // Hide what is behind the disc, in the sky's own colour.
          cv.drawCircle(pt.x, pt.y, rr, skyPaint);
          const reach = rr * (0.5 / MOON_IMG_DISC) * 1.05;
          cv.saveLayer(moonLayer, Skia.XYWHRect(pt.x - reach, pt.y - reach, reach * 2, reach * 2));
          cv.save();
          cv.translate(pt.x, pt.y);
          cv.rotate(angle * progress, 0, 0);
          cv.scale(scale, scale);
          // Mipmapped, because the image is drawn at a fraction of its size and
          // plain linear sampling would read one texel in ten and shimmer.
          cv.drawImageRectOptions(
            sky.moonImage,
            Skia.XYWHRect(0, 0, MOON_IMG, MOON_IMG),
            Skia.XYWHRect(-MOON_IMG / 2, -MOON_IMG / 2, MOON_IMG, MOON_IMG),
            FilterMode.Linear,
            MipmapMode.Linear,
            moonPaint
          );
          cv.restore();

          // THE EARTH'S SHADOW, when it is on the moon. Placed from the real
          // geometry and blown up by the same factor as the disc, so a partial
          // eclipse shows its bite on the correct side and totality goes copper.
          const sh = sky.shadow;
          if (sh) {
            const mp = projectVector(sh.moon, ground, width, height);
            const sp = projectVector(sh.shadow, ground, width, height);
            const z = sh.moon[0] * ground.fx + sh.moon[1] * ground.fy + sh.moon[2] * ground.fz;
            if (mp && sp && z > 0) {
              const pxPerDeg = (ground.focal * DEG) / z;
              const k = rr / (sh.moonRadiusDeg * pxPerDeg);
              const cx = pt.x + (sp.x - mp.x) * k;
              const cy = pt.y + (sp.y - mp.y) * k;
              // No clip: inside the layer only the moon and its glow have
              // anything to darken.
              const outer = sh.penumbraRadiusDeg * pxPerDeg * k;
              const inner = Math.min(0.999, sh.umbraRadiusDeg / sh.penumbraRadiusDeg);
              shadowPaint.setShader(Skia.Shader.MakeRadialGradient(
                { x: cx, y: cy },
                outer,
                [umbraColor, umbraColor, penumbraColor, noShadow],
                [0, inner * 0.97, Math.min(0.999, inner * 1.03), 1],
                TileMode.Clamp
              ));
              cv.drawCircle(cx, cy, outer, shadowPaint);
            }
          }
          cv.restore();
        } else if (isSun) {
          // The sun: its glare first, a light the eye adds round anything that
          // bright, then the disc, limb-darkened to 0.4 at the edge as the real
          // photosphere is. The air reddens both toward the horizon.
          const c = lit(SUN);
          const glareR = Math.max(28, rr * 5);
          glarePaint.setShader(Skia.Shader.MakeRadialGradient(pt, glareR,
            [Skia.Color([c[0], c[1], c[2], 0.55]), Skia.Color([c[0], c[1], c[2], 0.12]), Skia.Color([c[0], c[1], c[2], 0])],
            [0, 0.25, 1], TileMode.Clamp));
          cv.drawCircle(pt.x, pt.y, glareR, glarePaint);
          drawDisc(cv, { x: pt.x, y: pt.y, r: Math.max(1.5, rr), pole: null, poleAcross: 0, flattening: 0, sun: { x: 1, y: 0 }, phaseAngleDeg: 0 }, c, 1, bodyPaint, 0.4);
        } else {
          // A planet: a point of light until the zoom resolves its disc.
          const c = lit(unit(DISC[body.id] ?? SkyColors.planet));
          const pr = pointRadius(body.magnitude);
          const disc = resolved(rr, pr);
          labelGap = Math.max(pr, rr);
          if (disc < 1) {
            planetGlow.setAlphaf(0.4 * (1 - disc));
            planetPaint.setColor(Skia.Color([c[0], c[1], c[2], 1 - disc]));
            cv.drawCircle(pt.x, pt.y, pr * 2.2, planetGlow);
            cv.drawCircle(pt.x, pt.y, pr, planetPaint);
          }
          if (disc > 0) {
            const sunB = sky.bodies.find((s) => s.kind === "sun");
            const toSun = sunB
              ? screenDirection([sunB.vec[0] - body.vec[0], sunB.vec[1] - body.vec[1], sunB.vec[2] - body.vec[2]], ground)
              : { x: 1, y: 0 };
            const pole = body.poleVec ? screenDirection(body.poleVec, ground) : null;
            const along = body.poleVec ? body.poleVec[0] * body.vec[0] + body.poleVec[1] * body.vec[1] + body.poleVec[2] * body.vec[2] : 0;
            const g = { x: pt.x, y: pt.y, r: rr, pole, poleAcross: Math.sqrt(Math.max(0, 1 - along * along)), flattening: body.flattening, sun: toSun, phaseAngleDeg: body.phaseAngleDeg };
            if (body.id === "saturn" && pole) {
              drawRinged(cv, g, c, lit(unit(SkyColors.planetDisc.saturn)), disc, bodyPaint, { x: along * pole.x, y: along * pole.y });
              labelGap = Math.max(labelGap, rr * 2.3);
            } else {
              drawDisc(cv, g, c, disc, bodyPaint);
            }
          }
        }
        if (isMoon) moonOnScreen = pt.x > 0 && pt.x < width && pt.y > 0 && pt.y < height;
        const text = isMoon && sky.shadow ? `Moon, ${sky.shadow.phase} eclipse` : body.label;
        bodySeen.push({ x: pt.x, y: pt.y, r: labelGap, text, accent: !isMoon && !isSun, below: body.vec[2] < 0 });
        picks.push({ x: pt.x, y: pt.y, name: body.label, kind: isMoon ? "Moon" : isSun ? "Sun" : "Planet", mag: body.magnitude });
      }

      // ---- The ground ----
      //
      // Like Stellarium's: solid while the view looks up, so the sky has a
      // floor, and dissolving as the view tips to the horizon so what is under
      // your feet can still be looked at (skyView.groundOpacity). It covers the
      // stars, lines and bodies below the horizon, which is why it is drawn
      // after them and before every label.
      const viewAlt = Math.asin(Math.max(-1, Math.min(1, axes.forward.z))) / DEG;
      const groundAlpha = groundOpacity(viewAlt) * progress;
      if (groundAlpha > 0.003) {
        const region = groundRegion(ground, width, height);
        if (region) {
          const day = 1 - Math.min(1, Math.max(0, (-sky.sunAlt - 1) / 11));
          const gc = GROUND_NIGHT.map((v, c) => Math.round(v + (GROUND_DAY[c] - v) * day));
          const groundColor = Skia.Color(`rgb(${gc[0]},${gc[1]},${gc[2]})`);
          const outline = Skia.PathBuilder.Make();
          outline.moveTo(region.points[0], region.points[1]);
          for (let i = 2; i < region.points.length; i += 2) outline.lineTo(region.points[i], region.points[i + 1]);
          outline.close();
          // The last stretch of ground before the horizon takes the sky's
          // colour, the haze that keeps the edge from reading as a cut-out.
          const e = region.edge;
          const haze = height * 0.06;
          groundPaint.setShader(e
            ? Skia.Shader.MakeLinearGradient({ x: e.x, y: e.y }, { x: e.x + e.nx * haze, y: e.y + e.ny * haze }, [Skia.Color(`rgb(${g[0]},${g[1]},${g[2]})`), groundColor], null, TileMode.Clamp)
            : null);
          groundPaint.setColor(groundColor);
          groundPaint.setAlphaf(groundAlpha);
          cv.drawPath(outline.detach(), groundPaint);
        }
      }
      // Below this, a thing under the horizon is hidden while the ground is.
      const hidden = (below: boolean) => below && groundAlpha > 0.5;

      // The horizon and the compass belong to the ground, so they use its camera.
      const horizon = Skia.PathBuilder.Make();
      addPolyline(horizon, horizonLine, ground);
      cv.drawPath(horizon.detach(), horizonPaint);
      for (const [name, az] of [["N", 0], ["NE", 45], ["E", 90], ["SE", 135], ["S", 180], ["SW", 225], ["W", 270], ["NW", 315]] as const) {
        const pt = projectVector(horizonVector(0, az), ground, width, height);
        const floor = (controlsTop.current ?? height - CONTROLS_CLEARANCE) - 26;
        if (!pt || pt.x < 12 || pt.x > width - 12 || pt.y < 40 || pt.y > floor) continue;
        const w = textWidth(name);
        cv.drawText(name, pt.x - w / 2, pt.y + 18, name.length === 1 ? cardinalPaint : cardinalMinor, labelFont);
      }

      // The moon off screen: an arrow at the edge points the way to it. Its
      // word claims its space before any other label, below.
      let arrowLabel: [number, number, number, number] | null = null;
      const moonBody = sky.bodies.find((b) => b.kind === "moon");
      const off = !!moonBody && !moonOnScreen;
      if (off !== moonOffRef.current) {
        moonOffRef.current = off;
        setMoonOff(off);
      }
      if (moonBody && !moonOnScreen) {
        const v = moonBody.vec;
        const x = v[0] * ground.rx + v[1] * ground.ry + v[2] * ground.rz;
        const y = v[0] * ground.ux + v[1] * ground.uy + v[2] * ground.uz;
        const a = Math.atan2(-y, x);
        const ca = Math.cos(a), sa = Math.sin(a);
        // Kept inside the band between the caption and the controls. Run to
        // the screen edge, a moon below the horizon put its arrow on the
        // scrubber.
        const top = insetTop + 130;
        const bottom = (controlsTop.current ?? height - CONTROLS_CLEARANCE) - 24;
        const px = width / 2 + ca * (width / 2 - 30);
        const py = (top + bottom) / 2 + sa * ((bottom - top) / 2);
        const arrow = Skia.PathBuilder.Make();
        arrow.moveTo(px + ca * 10, py + sa * 10);
        arrow.lineTo(px - ca * 6 - sa * 7, py - sa * 6 + ca * 7);
        arrow.lineTo(px - ca * 6 + sa * 7, py - sa * 6 - ca * 7);
        arrow.close();
        cv.drawPath(arrow.detach(), arrowPaint);
        const w = textWidth("Moon");
        const lx = px - ca * 20 - w / 2;
        const ly = py - sa * 20 + 4;
        cv.drawText("Moon", lx, ly, arrowPaint, labelFont);
        arrowLabel = [lx - 3, ly - 11, lx + w + 3, ly + 3];
      }

      // ---- Labels, in the SAME pass as the things they name ----
      //
      // Near the right edge the label flips to the left of its object rather
      // than being suppressed.
      //
      // NOTHING OVERLAPS. Every label that gets drawn claims a rectangle, and a
      // later one that would land on top is dropped rather than stacked. Order
      // is the priority: solar system, then named stars, then deep sky, then
      // constellation names, because "ORIONBellatrix" is what you get when a
      // region name and a star name are both allowed to print at the same spot.
      //
      // ROLL: the rotation is +rollDeg, NOT -rollDeg.
      //
      // Text drawn with no transform is already level with the SCREEN, so it
      // needs no correction to stay that way. What it should stay level with is
      // the HORIZON, and the horizon rotates clockwise on screen by exactly
      // rollDeg (see cameraAxesFromAngles: positive roll turns `up` toward
      // `-right`, which reads as a clockwise turn of the sky in y-down screen
      // space). Rotating by -rollDeg therefore drove the text away from the
      // horizon at double rate, so labels visibly swung the wrong way.
      const placed: number[][] = [[0, 0, width, insetTop + 110], [0, (controlsTop.current ?? height - CONTROLS_CLEARANCE) - 8, width, height], ...(arrowLabel ? [arrowLabel] : [])];
      const claim = (x0: number, y0: number, x1: number, y1: number) => {
        for (const r of placed) {
          if (x0 < r[2] && x1 > r[0] && y0 < r[3] && y1 > r[1]) return false;
        }
        placed.push([x0, y0, x1, y1]);
        return true;
      };

      // `gap` clears the thing being named: a star is a dot, but the moon is
      // drawn tens of points across and its name used to print on its face.
      const label = (x: number, y: number, text: string, paint: any, gap = 11) => {
        if (y < 40 || y > height - 40 || x < -20 || x > width + 20) return;
        const w = textWidth(text);
        const left = x + gap + w > width - 6;
        const lx = left ? x - gap - w : x + gap;
        const ly = y + 4;
        // Padded by 2pt so neighbours never touch, which reads as one word.
        if (!claim(lx - 2, ly - 11, lx + w + 2, ly + 3)) return;

        if (Math.abs(rollDeg) > 0.1) {
          cv.save();
          cv.rotate(rollDeg, x, y);
          cv.drawText(text, lx, ly, paint, labelFont);
          cv.restore();
        } else {
          cv.drawText(text, lx, ly, paint, labelFont);
        }
      };

      for (const l of bodySeen) {
        if (!hidden(l.below)) label(l.x, l.y, l.text, l.accent ? labelAccent : labelPaint, Math.max(11, l.r + 6));
      }
      const starLimit = f > 70 ? 10 : f > 40 ? 26 : 60;
      // A name without its star is a label on nothing, so names fade out with them.
      for (const st of dark < 0.4 ? [] : sphere.labels.slice(0, starLimit)) {
        // Cull labels by angular distance from view centre
        const cosDist = st.vec[0] * skyAxes.forward.x + st.vec[1] * skyAxes.forward.y + st.vec[2] * skyAxes.forward.z;
        if (cosDist < minLabelCos || hidden(underfoot(st.vec))) continue;
        const pt = projectVector(st.vec, cam, width, height);
        if (pt) label(pt.x, pt.y, st.name, labelPaint);
      }
      // A lit figure's stars, brightest first, after the proper names so a
      // named star keeps its name rather than its letter.
      for (const fs of dark < 0.4 ? [] : figureStars) {
        if (hidden(fs.below)) continue;
        figureStarPaint.setAlphaf(fs.alpha * 0.8 * dark);
        label(fs.x, fs.y, fs.text, figureStarPaint);
      }

      // Constellation names last, centred on the figure rather than offset from
      // a point, because they name a region and not an object. They ride the
      // same fade as their lines, so a name never appears without its figure,
      // and they yield to every other label because a region can afford to go
      // unnamed for a frame while you are reading a star.
      for (const c of conNames) {
        if (c.y < 40 || c.y > height - 40 || hidden(c.below)) continue;
        const w = textWidth(c.text);
        const cx = c.x - w / 2;
        if (cx < 8 || cx + w > width - 8) continue;
        // Sat 14pt below the centroid: the centre of a figure is exactly where
        // its brightest star, and so its star label, tends to be.
        const cy = c.y + 18;
        if (cy > height - 40) continue;
        if (!claim(cx - 3, cy - 11, cx + w + 3, cy + 3)) continue;

        conNamePaint.setAlphaf(c.alpha * 0.75 * dark);
        cv.save();
        cv.rotate(rollDeg, c.x, cy);
        cv.drawText(c.text, cx, cy, conNamePaint, labelFont);
        cv.restore();
      }

      // Every named star on screen is tappable, labelled or not.
      for (const st of sphere.labels) {
        if (hidden(underfoot(st.vec))) continue;
        const pt = projectVector(st.vec, cam, width, height);
        if (pt && pt.x > 0 && pt.x < width && pt.y > 0 && pt.y < height) {
          picks.push({ x: pt.x, y: pt.y, name: st.name, kind: "Star", mag: st.mag, ra: st.ra, dec: st.dec });
        }
      }
      pickRef.current = picks;

      picture.value = rec.finishRecordingAsPicture();
      // The star count is a diagnostic. Publishing it with the panel shut
      // re-rendered the whole screen twice a second for nobody.
      if (++frames % 30 === 0 && showDebugRef.current) setDrawn(drawnRef.current);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sphere, assets, width, height, insetTop, picture, focused, entry, reduced]);

  if (!milestone?.location) {
    return (
      <View
        style={[
          styles.root,
          styles.missingRoot,
          { paddingTop: insets.top + Spacing.xl, paddingBottom: insets.bottom + Spacing.lg },
        ]}
      >
        <Text style={styles.missingTitle}>
          {isTonight || isPreview ? "Where are you?" : "Add a place to see this sky"}
        </Text>
        <Text style={styles.missing}>
          {isTonight || isPreview
            ? permission === "denied"
              ? "Location is off for TRACE, so there is no way to know which sky is over you. Turn it on in Settings and this view opens."
              : "The sky overhead depends on where you stand. TRACE uses your location for this view and stores it only on this phone."
            : "The stars that night depend on where it happened. Add a place to this date and the view opens."}
        </Text>
        {(isTonight || isPreview) && (
          <TouchableOpacity
            style={styles.missingButton}
            onPress={permission === "denied" ? () => Linking.openSettings() : requestLocation}
            disabled={locating}
            accessibilityRole="button"
          >
            <Text style={styles.missingButtonText}>
              {locating
                ? "Finding you"
                : permission === "denied"
                ? "Open Settings"
                : "Use my location"}
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.missingClose}
          onPress={closeSky}
          accessibilityRole="button"
        >
          <Text style={styles.close}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const compassLabel = cardinal(orientation.azimuthDeg);
  const below = orientation.altitudeDeg < -2;
  const at = new Date(timeMs);
  const moment = anchor
    ? describeNightMoment(at, isTonight ? toLocalNight(todayDateString()) : anchor, night?.sunset ?? null, night?.sunrise ?? null, formatDuration)
    : "";
  const skyState = sunAlt > -0.8 ? "Daylight" : sunAlt > -18 ? "Twilight" : "Night";
  const moonNow = bodies.find((b) => b.kind === "moon");

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <GestureDetector gesture={gesture}>
        <Canvas style={{ width, height, backgroundColor: Colors.space }}>
          <Picture picture={picture} />
        </Canvas>
      </GestureDetector>

      {entry && !skyReady && moonLight && <View pointerEvents="none" style={{ position: "absolute", left: entry.x - entry.radius, top: entry.y - entry.radius, width: entry.radius * 2, height: entry.radius * 2, alignItems: "center", justifyContent: "center" }}>
        <MoonPhaseGlyph {...moonLight} size={entry.radius * 2} variant="bare" glow="hero" />
      </View>}
      <View style={[styles.caption, { top: insets.top + Spacing.md }]} pointerEvents="none">
        <Text style={styles.captionLabel}>
          {isTonight ? "The sky tonight" : "The sky that night"}
        </Text>
        <Text style={styles.captionPlace}>{milestone.location.label}</Text>
        <Text style={styles.captionDate}>
          {isTonight ? "" : `Evening of ${formatMilestoneDate(milestone.date)}`}
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.closeButton, { top: insets.top + Spacing.md }]}
        onPress={closeSky}
        accessibilityRole="button"
        accessibilityLabel="Close the sky view"
        hitSlop={10}
      >
        <X size={24} color={Colors.plateInk} strokeWidth={2} />
      </TouchableOpacity>

      {picked && (
        <TouchableOpacity
          style={[styles.card, { top: insets.top + 110 }]}
          onPress={() => setPicked(null)}
          accessibilityRole="button"
          accessibilityLabel={`${picked.name}. ${picked.detail}. Tap to close.`}
        >
          <Text style={styles.cardKind}>{picked.kind}</Text>
          <Text style={styles.cardTitle}>{picked.name}</Text>
          {picked.detail ? <Text style={styles.cardBody}>{picked.detail}</Text> : null}
        </TouchableOpacity>
      )}

      {showHelp && !hasSeenDragHint && orientation.mode === "drag" && (
        <View style={styles.help} pointerEvents="none">
          <Text style={styles.helpText}>Drag to look around. Pinch to zoom.</Text>
        </View>
      )}

      <View
        style={[styles.controls, { paddingBottom: insets.bottom + Spacing.md }]}
        onLayout={(e) => {
          controlsTop.current = e.nativeEvent.layout.y;
          // A still sky is not redrawn, so tell the frame loop the band moved.
          skyRef.current.version += 1;
        }}
      >
        {night && (
          <>
            <View style={styles.timeRow}>
              <View style={{ flexShrink: 1 }}>
                <Text style={styles.timeBig}>
                  {/* The phone's own clock is exact for here and now. A record's
                      clock time is never printed: its offset is an estimate. */}
                  {isTonight ? formatLocalTime(at) : moment}
                </Text>
                {isTonight ? <Text style={styles.timeSmall}>{moment}</Text> : null}
              </View>
              <View style={styles.timeRight}>
                <Text style={styles.skyState}>{skyState}</Text>
                {moonNow && (
                  <Text style={styles.timeSmall}>
                    {moonNow.vec[2] > 0
                      ? `Moon ${Math.round(Math.asin(moonNow.vec[2]) / DEG)}° up`
                      : "Moon below the horizon"}
                  </Text>
                )}
              </View>
            </View>
            <TimeScrubber
              min={night.start.getTime()}
              max={night.end.getTime()}
              value={timeMs}
              onChange={(v) => {
                setScrubMs(v);
                setPicked(null);
              }}
              marks={[night.sunset?.getTime(), night.sunrise?.getTime()].filter((m): m is number => m != null)}
              accessibilityLabel="Time of night"
              accessibilityValue={isTonight ? `${formatLocalTime(at)}, ${moment}` : moment}
            />
          </>
        )}

        <View style={styles.buttonRow}>
          {Math.abs(fov - eyeFov) > 0.5 && (
            <TouchableOpacity
              style={styles.modeButton}
              onPress={resetZoom}
              accessibilityRole="button"
              accessibilityHint="Returns to the field of view of the naked eye."
            >
              <Text style={styles.modeText}>Reset zoom</Text>
            </TouchableOpacity>
          )}
          {scrubMs != null && (
            <TouchableOpacity style={styles.modeButton} onPress={() => setScrubMs(null)} accessibilityRole="button">
              <Text style={styles.modeText}>{isTonight ? "Now" : "Midnight"}</Text>
            </TouchableOpacity>
          )}
          {orientation.mode === "drag" && moonNow && moonOff && (
            <TouchableOpacity
              style={styles.modeButton}
              onPress={() => {
                const v = moonNow.vec;
                orientation.lookAt(Math.atan2(v[0], v[1]) / DEG, Math.asin(v[2]) / DEG);
              }}
              accessibilityRole="button"
            >
              <Text style={styles.modeText}>Find the moon</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.modeButton}
            onPress={() => orientation.setMode(orientation.mode === "sensor" ? "drag" : "sensor")}
            accessibilityRole="button"
          >
            <View style={styles.modeRow}>
              {orientation.mode === "sensor" ? (
                <Hand size={15} color={Colors.plateInk} strokeWidth={2} />
              ) : (
                <Compass size={15} color={Colors.plateInk} strokeWidth={2} />
              )}
              <Text style={styles.modeText}>{orientation.mode === "sensor" ? "Use my finger" : "Move my phone"}</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Diagnostics live behind a long press: fps counters and flip switches
            are for whoever is debugging a sensor, not for someone looking up. */}
        <TouchableOpacity
          onLongPress={() => setShowDebug((v) => !v)}
          delayLongPress={600}
          accessibilityRole="text"
        >
          <Text style={styles.facing}>
            {below ? "Below the horizon" : `Facing ${compassLabel}`}
          </Text>
        </TouchableOpacity>

        {!orientation.canPoint && orientation.mode === "sensor" && (
          <Text style={styles.note}>
            Your phone cannot find its direction. Use your finger to look around.
          </Text>
        )}
        {orientation.permissionDenied && orientation.mode === "sensor" && (
          <Text style={styles.note}>
            Location permission is off, so the compass can&apos;t find north.
            Pointing will tilt correctly but may not face the right way.
          </Text>
        )}

        {showDebug && (
          <View style={styles.debug}>
            <Text style={styles.debugText}>
              {orientation.debug.fps.toFixed(0)} fps · drawn {drawn}/
              {sphere?.count ?? 0} · fov {fov.toFixed(0)} · az{" "}
              {orientation.azimuthDeg.toFixed(0)} alt{" "}
              {orientation.altitudeDeg.toFixed(0)}
            </Text>
            <Text style={styles.debugText}>
              accel {orientation.debug.motionEvents} · mag{" "}
              {orientation.debug.magEvents} · gyro{" "}
              {orientation.debug.gyroEvents} · compass{" "}
              {orientation.debug.headingEvents} · acc{" "}
              {orientation.debug.accuracy ?? "none"}
            </Text>
            <View style={styles.flipRow}>
              <TouchableOpacity
                style={[styles.flipButton, orientation.flipGravity && styles.flipOn]}
                onPress={orientation.toggleFlipGravity}
                accessibilityRole="button"
              >
                <Text style={styles.flipText}>Flip up/down</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.flipButton, orientation.flipHeading && styles.flipOn]}
                onPress={orientation.toggleFlipHeading}
                accessibilityRole="button"
              >
                <Text style={styles.flipText}>Flip N/S</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.debugText}>
              gravity sign {orientation.detectedGravitySign > 0 ? "+" : "−"}
              {orientation.flipGravity ? " (overridden)" : " (auto)"}
            </Text>
            <Text style={styles.debugText}>
              declination {orientation.debug.northOffset?.toFixed(1) ?? "none"}° ·
              rot {orientation.debug.angularSpeed.toFixed(0)}°/s · perm{" "}
              {orientation.debug.permission ?? "none"}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function formatMilestoneDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function cardinal(az: number): string {
  const names = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return names[Math.round(az / 45) % 8];
}

const styles = StyleSheet.create({
  // Pitch black, not the warm plate ink: this surface exists so faint things
  // pop off it, and any lift in the ground steals that contrast.
  root: { flex: 1, backgroundColor: Colors.space },
  caption: { position: "absolute", left: Spacing.page, right: Spacing.page + 44 },
  captionLabel: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.label,
    letterSpacing: Tracking.label,
    textTransform: "uppercase",
    color: Colors.signalOnPlate,
  },
  captionPlace: {
    fontFamily: FontFamily.serifMedium,
    fontSize: FontSize.heading,
    color: Colors.plateInk,
    marginTop: 3,
  },
  captionDate: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.label,
    color: Colors.plateMuted,
    marginTop: 2,
  },
  closeButton: { position: "absolute", right: Spacing.page },
  close: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.small,
    color: Colors.plateInk,
  },
  help: { position: "absolute", left: Spacing.page, right: Spacing.page, bottom: CONTROLS_CLEARANCE, alignItems: "center" },
  helpText: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.small,
    color: Colors.plateMuted,
  },
  controls: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.page,
    paddingTop: Spacing.lg,
    gap: Spacing.sm,
    // A scrim, so the controls read over any sky the scrubber turns up.
  },
  timeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: Spacing.md },
  timeBig: { fontFamily: FontFamily.monoMedium, fontSize: FontSize.lead, color: Colors.plateInk },
  timeSmall: { fontFamily: FontFamily.regular, fontSize: FontSize.small, color: Colors.plateMuted },
  timeRight: { alignItems: "flex-end" },
  skyState: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.label,
    letterSpacing: Tracking.label,
    textTransform: "uppercase",
    color: Colors.signalOnPlate,
  },
  buttonRow: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm },
  modeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  card: {
    position: "absolute",
    left: Spacing.page,
    right: Spacing.page,
    padding: Spacing.md,
    gap: Spacing.xs,
    borderRadius: Radius.plate,
    borderWidth: 1,
    borderColor: Colors.plateRule,
    backgroundColor: Colors.plate,
  },
  cardKind: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.label,
    letterSpacing: Tracking.label,
    textTransform: "uppercase",
    color: Colors.plateMuted,
  },
  cardTitle: { fontFamily: FontFamily.serif, fontSize: FontSize.heading, lineHeight: 28, color: Colors.plateInk },
  cardBody: { fontFamily: FontFamily.regular, fontSize: FontSize.small, lineHeight: 20, color: Colors.plateMuted },
  cardButton: {
    alignSelf: "flex-start",
    marginTop: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.plateRule,
  },
  cardButtonText: { fontFamily: FontFamily.medium, fontSize: FontSize.small, color: Colors.plateInk },
  facing: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.label,
    letterSpacing: 0.4,
    color: Colors.plateMuted,
  },
  modeButton: {
    alignSelf: "flex-start",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.plateRule,
  },
  modeText: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.small,
    color: Colors.plateInk,
  },
  debug: {
    marginTop: Spacing.xs,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.plateRule,
    gap: 2,
  },
  flipRow: { flexDirection: "row", gap: Spacing.sm, marginBottom: Spacing.xs },
  flipButton: {
    paddingVertical: 6,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.plateRule,
  },
  flipOn: {
    backgroundColor: Colors.signalOnPlate,
    borderColor: Colors.signalOnPlate,
  },
  flipText: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.micro,
    color: Colors.plateInk,
  },
  debugText: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.micro,
    color: Colors.plateMuted,
  },
  note: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.small,
    lineHeight: 18,
    color: Colors.plateMuted,
  },
  missingRoot: {
    paddingHorizontal: Spacing.page,
    justifyContent: "center",
  },
  missingTitle: {
    fontFamily: FontFamily.serif,
    fontSize: FontSize.title,
    lineHeight: 36,
    color: Colors.plateInk,
  },
  missing: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.body,
    lineHeight: 22,
    color: Colors.plateMuted,
    marginTop: Spacing.md,
  },
  missingButton: {
    alignSelf: "flex-start",
    marginTop: Spacing.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.pill,
    backgroundColor: Colors.plateInk,
  },
  missingButtonText: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSize.body,
    color: Colors.space,
  },
  missingClose: {
    alignSelf: "flex-start",
    marginTop: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
});
