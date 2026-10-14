import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  useWindowDimensions,
} from "react-native";
import {
  Canvas,
  Picture,
  Skia,
  BlurStyle,
  BlendMode,
  ClipOp,
  Fill,
  Group,
  ImageShader,
  Shader,
  drawAsImage,
  useFont,
  useImage,
  type SkImage,
  type SkPicture,
} from "@shopify/react-native-skia";
import * as Astronomy from "astronomy-engine";
import { JetBrainsMono_400Regular } from "@expo-google-fonts/jetbrains-mono";
import { useSharedValue } from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { X, Compass, Hand } from "lucide-react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Colors,
  Spacing,
  FontFamily,
  FontSize,
  Tracking,
  Radius,
  SkyColors,
} from "@/constants/theme";
import { useMilestone } from "@/store/useMilestonesStore";
import {
  buildSkySphere,
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
import { getBrightLimbAngle, getLunarNorthRotation } from "@/lib/astronomy/brightLimb";
import { formatDuration } from "@/lib/astronomy/nightFacts";
import { useMoonTextures } from "@/components/moon/moonTextures";
import { moonEffect } from "@/components/moon/moonShader";
import { moonUniforms } from "@/components/moon/moonUniforms";
import { TimeScrubber } from "@/components/TimeScrubber";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useCurrentLocation } from "@/hooks/useCurrentLocation";
import { useSkyOrientation } from "@/hooks/useSkyOrientation";
import catalogJson from "@/data/bsc.json";
import type { Star, Milestone } from "@/types";

const CATALOG = catalogJson as Star[];

/**
 * STAR DENSITY: the 75th percentile of the bundled catalogue.
 *
 * The catalogue runs to magnitude 6.5 and 8,404 stars, which is roughly what a
 * perfect eye sees from a perfect site. On a phone that reads as noise: the
 * faintest quarter carries no shape a person can recognise, and it fogs the
 * bright stars that make the sky legible as constellations. Cutting at 6.2
 * keeps 6,331 of them, exactly 75%, and leaves every star anyone has a name
 * for. The catalogue keeps the rest, so raising this line brings them back.
 */
const MAG_LIMIT = 6.2;

const FOV_MIN = 18;
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
/** Per-frame easing. 0.06 at 60fps is about 0.8s to settle. */
const FIGURE_FADE_RATE = 0.06;

/**
 * FIGURE ARTWORK.
 *
 * Fifteen constellations carry a drawn figure (see
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
const ART_SHEET = require("../../../assets/constellations/figures.png");

/** Height kept clear above the bottom edge for the time and mode controls. */
const CONTROLS_CLEARANCE = 330;

/** The moon's offscreen image: its size in pixels, and the disc's radius within it. */
const MOON_IMG = 192;
const MOON_IMG_DISC = 0.36;

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

type Pickable = {
  x: number;
  y: number;
  name: string;
  kind: "Star" | "Planet" | "Moon" | "Sun" | "Deep sky";
  detail?: string;
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
  const { id } = useLocalSearchParams<{ id: string }>();
  const isTonight = id === "tonight";
  const milestoneFromStore = useMilestone(id);
  const {
    location: currentLocation,
    permission,
    locating,
    request: requestLocation,
  } = useCurrentLocation();

  const milestone = useMemo<Milestone | null>(() => {
    if (!isTonight) return milestoneFromStore ?? null;
    return {
      id: "tonight",
      title: "Tonight",
      type: "custom",
      date: todayDateString(),
      location: currentLocation,
      createdAt: new Date().toISOString(),
    };
  }, [isTonight, milestoneFromStore, currentLocation]);

  const insets = useSafeAreaInsets();
  const insetTop = insets.top;
  const { width, height } = useWindowDimensions();

  const [fov, setFov] = useState(65);
  const [showHelp, setShowHelp] = useState(true);
  const [showDebug, setShowDebug] = useState(false);
  const [showPointHint, setShowPointHint] = useState(false);
  const hasSeenPointHint = useSettingsStore((s) => s.hasSeenPointHint);
  const setHasSeenPointHint = useSettingsStore((s) => s.setHasSeenPointHint);
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
  const sphere = useMemo(() => {
    if (!place || !anchor) return null;
    return buildSkySphere(CATALOG, place, anchor, MAG_LIMIT);
  }, [place, anchor]);

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
    const out: { id: string; label: string; vec: [number, number, number]; magnitude: number; kind: "planet" | "moon" | "sun" }[] =
      solar.planets.map((p) => ({ id: p.id, label: p.label, vec: horizonVector(p.altitudeDeg, p.azimuthDeg), magnitude: p.magnitude, kind: "planet" as const }));
    if (solar.moon) out.push({ id: "moon", label: "Moon", vec: horizonVector(solar.moon.altitudeDeg, solar.moon.azimuthDeg), magnitude: solar.moon.magnitude, kind: "moon" });
    if (solar.sun) out.push({ id: "sun", label: "Sun", vec: horizonVector(solar.sun.altitudeDeg, solar.sun.azimuthDeg), magnitude: solar.sun.magnitude, kind: "sun" });
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
  // image is redrawn per twenty minutes of scrubbing, offscreen, once each.
  const moonStep = Math.round(timeMs / 1_200_000);
  const moonLight = useMemo(() => {
    if (!place) return null;
    const at = new Date(moonStep * 1_200_000);
    const phase = getMoonPhase(at);
    return {
      phaseFraction: phase.phaseFraction,
      waxing: phase.waxing,
      brightLimbAngleDeg: getBrightLimbAngle(at, place),
      northAngleDeg: getLunarNorthRotation(at, place),
      label: `${describePhase(phase)}, ${formatIllumination(phase.phaseFraction)} lit`,
    };
  }, [place, moonStep]);
  const moonTextures = useMoonTextures(MOON_IMG / 3);
  const [moonImage, setMoonImage] = useState<SkImage | null>(null);
  useEffect(() => {
    if (!moonLight || !moonTextures || !moonEffect) return;
    let alive = true;
    const c = MOON_IMG / 2;
    const r = MOON_IMG * MOON_IMG_DISC;
    const rect = { x: c - r, y: c - r, width: r * 2, height: r * 2 };
    drawAsImage(
      <Group>
        <Fill>
          <Shader source={moonEffect} uniforms={moonUniforms(moonLight, c, c, r, "tight")}>
            <ImageShader image={moonTextures.albedo} fit="fill" rect={rect} tx="clamp" ty="clamp" />
            <ImageShader image={moonTextures.normal} fit="fill" rect={rect} tx="clamp" ty="clamp" />
          </Shader>
        </Fill>
      </Group>,
      { width: MOON_IMG, height: MOON_IMG }
    ).then((img) => {
      if (alive && img) setMoonImage(img);
    });
    return () => {
      alive = false;
    };
  }, [moonLight, moonTextures]);

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
      delta: anchor ? siderealDelta(anchor, new Date(timeMs)) : 0,
      bodies,
      sunAlt,
      shadow,
      moonImage,
      version: skyRef.current.version + 1,
    };
  }, [place, anchor, timeMs, bodies, sunAlt, shadow, moonImage]);

  // Last frame's named things, for tap-to-identify.
  const pickRef = useRef<Pickable[]>([]);
  const [picked, setPicked] = useState<{ name: string; kind: string; detail: string } | null>(null);


  // Reused across frames; never reallocated.
  const buf = useRef(new Float32Array(CATALOG.length * 3));

  const fovRef = useRef(fov);
  fovRef.current = fov;
  const orientationRef = useRef(orientation);
  orientationRef.current = orientation;
  const fovStart = useRef(fov);
  const lastPan = useRef({ x: 0, y: 0 });

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
            fovRef.current,
            width
          );
          lastPan.current = { x: e.translationX, y: e.translationY };
        })
        .runOnJS(true),
    [width]
  );

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onBegin(() => {
          fovStart.current = fovRef.current;
        })
        .onUpdate((e) => {
          // Pinching out narrows the field of view, i.e. zooms in.
          const next = fovStart.current / e.scale;
          setFov(Math.max(FOV_MIN, Math.min(FOV_MAX, next)));
        })
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
      case "Deep sky":
        detail = `${best.detail ? best.detail[0].toUpperCase() + best.detail.slice(1) : "Object"} in ${constellationOf(best.ra!, best.dec!)}${mag(best.mag)}`;
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

  const tapGesture = Gesture.Tap()
    .maxDistance(12)
    .onEnd((e) => identify(e.x, e.y))
    .runOnJS(true);

  const gesture = Gesture.Race(tapGesture, Gesture.Simultaneous(panGesture, pinchGesture));

  // POINTING BY DEFAULT, once the phone says it can. The view used to open in
  // drag mode with pointing behind a toggle, which hid the best thing it does.
  // The hint shows once per install.
  const autoPointed = useRef(false);
  useEffect(() => {
    if (autoPointed.current || !orientation.canPoint) return;
    autoPointed.current = true;
    orientation.setMode("sensor");
    if (!hasSeenPointHint) setShowPointHint(true);
  }, [orientation.canPoint, orientation, hasSeenPointHint]);

  // A dragged view opens facing the moon when it is up, not due south.
  const facedMoon = useRef(false);
  useEffect(() => {
    if (facedMoon.current || orientation.mode !== "drag") return;
    const moon = bodies.find((b) => b.kind === "moon");
    if (!moon || moon.vec[2] <= 0) return;
    facedMoon.current = true;
    orientation.viewRef.current.az = ((Math.atan2(moon.vec[0], moon.vec[1]) / DEG) + 360) % 360;
    orientation.viewRef.current.alt = Math.min(60, Math.asin(moon.vec[2]) / DEG);
  }, [bodies, orientation]);

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
  const labelFont = useFont(JetBrainsMono_400Regular, 11);
  const artSheet = useImage(ART_SHEET);
  const drawnRef = useRef(0);
  const [drawn, setDrawn] = useState(0);
  const showDebugRef = useRef(showDebug);
  showDebugRef.current = showDebug;

  useEffect(() => {
    if (!sphere || !labelFont) return;
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
    // Stars below the horizon stay visible, because the view passes through
    // the ground, but they are drawn as the ground's and not the sky's.
    const belowPaint = Skia.Paint(); belowPaint.setColor(Skia.Color(Colors.moonlight)); belowPaint.setAlphaf(0.22);
    const moonPaint = Skia.Paint(); moonPaint.setAntiAlias(true);
    const umbraPaint = Skia.Paint(); umbraPaint.setColor(Skia.Color(SkyColors.umbra)); umbraPaint.setBlendMode(BlendMode.Multiply); umbraPaint.setAntiAlias(true);
    const penumbraPaint = Skia.Paint(); penumbraPaint.setColor(Skia.Color(SkyColors.penumbra)); penumbraPaint.setBlendMode(BlendMode.Multiply); penumbraPaint.setAntiAlias(true);
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
    const dsoPaint = mk(SkyColors.deepSky, 0.75, 1);
    const dsoDashedPaint = mk(SkyColors.deepSky, 0.75, 1);
    dsoDashedPaint.setPathEffect(Skia.PathEffect.MakeDash([3.5, 2.5], 0));
    // Plus (additive) blending is what makes the black ground of a greyscale
    // illustration disappear: black adds nothing. Anything else would paste a
    // black square over the star field.
    const artPaint = Skia.Paint();
    artPaint.setBlendMode(BlendMode.Plus);
    const conNamePaint = mk(SkyColors.figure, 1);
    const labelPaint = mk(SkyColors.label, 0.85);
    const labelAccent = mk(SkyColors.planet, 0.95);
    const dsoLabel = mk(SkyColors.deepSky, 0.8);
    const cardinalPaint = mk(Colors.plateInk, 0.9);
    const cardinalMinor = mk(Colors.plateMuted, 0.8);
    const arrowPaint = mk(Colors.plateInk, 0.9);
    const skyPaint = Skia.Paint();
    const up0 = { forward: { x: 0, y: 0, z: 1 }, right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 } };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const f = fovRef.current;
      const axes = orientationRef.current.axesRef.current;
      const sky = skyRef.current;

      const moved =
        f !== lastFov ||
        sky.version !== lastVersion ||
        Math.abs(axes.forward.x - lastAxes[0]) > 1e-6 ||
        Math.abs(axes.forward.y - lastAxes[1]) > 1e-6 ||
        Math.abs(axes.forward.z - lastAxes[2]) > 1e-6 ||
        Math.abs(axes.up.x - lastAxes[3]) > 1e-6 ||
        Math.abs(axes.up.y - lastAxes[4]) > 1e-6 ||
        Math.abs(axes.up.z - lastAxes[5]) > 1e-6;
      if (!moved && !fading) return;
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
      const dark = Math.min(1, Math.max(0, (-sky.sunAlt - 1) / 11));

      // Angular distance threshold for labels (central comfort cone)
      const labelMaxAngleDeg = (f / 2) * 0.75;
      const minLabelCos = Math.cos((labelMaxAngleDeg * Math.PI) / 180);

      const rec = Skia.PictureRecorder();
      const cv = rec.beginRecording();

      // The sky's own colour, from the sun's altitude at the scrubbed instant.
      const g = skyGround(sky.sunAlt);
      skyPaint.setColor(Skia.Color(`rgb(${g[0]},${g[1]},${g[2]})`));
      cv.drawRect(Skia.XYWHRect(0, 0, width, height), skyPaint);

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
      const conNames: { x: number; y: number; text: string; alpha: number }[] = [];
      fading = false;

      for (let ci = 0; ci < sphere.figures.length; ci++) {
        const con = sphere.figures[ci];
        const c = con.centroid;
        const dot =
          c[0] * skyAxes.forward.x + c[1] * skyAxes.forward.y + c[2] * skyAxes.forward.z;
        const target = dot >= focusCos ? FIGURE_FOCUS_ALPHA : FIGURE_BASE_ALPHA;
        let alpha =
          figureAlpha[ci] + (target - figureAlpha[ci]) * FIGURE_FADE_RATE;
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
            });
          }
        }
      }

      figurePaint.setAlphaf(FIGURE_BASE_ALPHA * dark);
      cv.drawPath(restingFigures.detach(), figurePaint);
      for (const lf of litFigures) {
        figurePaint.setAlphaf(lf.alpha * dark);
        cv.drawPath(lf.path, figurePaint);
      }
      const horizon = Skia.PathBuilder.Make();
      addPolyline(horizon, horizonLine, ground);
      cv.drawPath(horizon.detach(), horizonPaint);

      // The four points of the compass sit on the horizon, the four between
      // them smaller. They belong to the ground, so they use its camera.
      for (const [name, az] of [["N", 0], ["NE", 45], ["E", 90], ["SE", 135], ["S", 180], ["SW", 225], ["W", 270], ["NW", 315]] as const) {
        const pt = projectVector(horizonVector(0, az), ground, width, height);
        if (!pt || pt.x < 12 || pt.x > width - 12 || pt.y < 40 || pt.y > height - 40) continue;
        const w = labelFont.measureText(name).width;
        cv.drawText(name, pt.x - w / 2, pt.y + 18, name.length === 1 ? cardinalPaint : cardinalMinor, labelFont);
      }

      // ---- Stars: glow underneath, cores on top ----
      // In twilight the faint stars go first; by sunrise only the brightest are left.
      const baseLimit = f > 70 ? 5.4 : f > 40 ? 6.0 : MAG_LIMIT;
      const limit = Math.min(baseLimit, -1.5 + (baseLimit + 1.5) * dark);
      const n = projectSphere(sphere, cam, width, height, buf.current, limit, zenith);
      drawnRef.current = n;
      const glow = Skia.PathBuilder.Make();
      const cores = Skia.PathBuilder.Make();
      const belowCores = Skia.PathBuilder.Make();
      const b = buf.current;
      for (let i = 0; i < n; i++) {
        const o = i * 3;
        const x = b[o], y = b[o + 1], r = b[o + 2];
        if (r < 0) {
          belowCores.addCircle(x, y, -r);
          continue;
        }
        cores.addCircle(x, y, r);
        if (r > 1.5) glow.addCircle(x, y, r * 2.2);
      }
      cv.drawPath(glow.detach(), glowPaint);
      cv.drawPath(cores.detach(), starPaint);
      cv.drawPath(belowCores.detach(), belowPaint);

      // ---- Deep sky ----
      //
      // No magnitude gate. buildSkySphere already cut the catalogue to the 24
      // objects with names people use, so fame is the filter and a faint famous
      // object (the Little Dumbbell at 11.5) should still be findable. Gating on
      // brightness as well would hide exactly the ones worth going to look for.
      const dsoSeen: { x: number; y: number; name: string }[] = [];
      // Nebulae and galaxies are night objects; in twilight they are not there.
      for (const o of dark < 0.4 ? [] : sphere.deepSky) {
        const pt = projectVector(o.vec, cam, width, height);
        if (!pt) continue;

        // Three glyphs for three kinds of object, following chart convention.
        // Cluster glyphs are gone with the clusters themselves.
        const rr = Math.max(3, 260 / f);
        switch (o.kind) {
          case "galaxy": {
            // Dashed oval inclined at 30°, a disc seen at an angle.
            const ov = Skia.Path.Oval(
              Skia.XYWHRect(pt.x - rr * 1.25, pt.y - rr * 0.65, rr * 2.5, rr * 1.3)
            );
            cv.save();
            cv.rotate(30, pt.x, pt.y);
            cv.drawPath(ov, dsoDashedPaint);
            cv.restore();
            break;
          }
          case "planetary nebula":
          case "supernova remnant": {
            // Ring with external crosshair ticks, the standard planetary glyph.
            cv.drawCircle(pt.x, pt.y, rr, dsoPaint);
            const ch = Skia.PathBuilder.Make();
            const tick = Math.max(2.5, rr * 0.45);
            ch.moveTo(pt.x - rr - tick, pt.y); ch.lineTo(pt.x - rr, pt.y);
            ch.moveTo(pt.x + rr, pt.y); ch.lineTo(pt.x + rr + tick, pt.y);
            ch.moveTo(pt.x, pt.y - rr - tick); ch.lineTo(pt.x, pt.y - rr);
            ch.moveTo(pt.x, pt.y + rr); ch.lineTo(pt.x, pt.y + rr + tick);
            cv.drawPath(ch.detach(), dsoPaint);
            break;
          }
          case "nebula":
          default: {
            // Diffuse nebula: a dashed box framing the cloud.
            const box = Skia.Path.Rect(
              Skia.XYWHRect(pt.x - rr, pt.y - rr, rr * 2, rr * 2)
            );
            cv.drawPath(box, dsoDashedPaint);
            break;
          }
        }

        // Cull label by angular distance from view center
        const cosDist = o.vec[0] * skyAxes.forward.x + o.vec[1] * skyAxes.forward.y + o.vec[2] * skyAxes.forward.z;
        if (cosDist >= minLabelCos) {
          dsoSeen.push({ x: pt.x, y: pt.y, name: o.name });
        }
        picks.push({ x: pt.x, y: pt.y, name: o.name, kind: "Deep sky", detail: o.kind, mag: o.mag, ra: o.ra, dec: o.dec });
      }

      // ---- Solar system, where it stands at the scrubbed instant ----
      const bodySeen: { x: number; y: number; text: string; accent: boolean }[] = [];
      let moonOnScreen = false;
      for (const body of sky.bodies) {
        const pt = projectVector(body.vec, ground, width, height);
        if (!pt) continue;
        const isMoon = body.kind === "moon";
        const isSun = body.kind === "sun";
        const rr = isMoon || isSun ? Math.max(9, 420 / f) : Math.max(3.4, 210 / f);
        if (isMoon && sky.moonImage) {
          // THE MOON AS ITSELF, at its phase and tilt, turned so its top faces
          // the local zenith on screen. Drawn larger than life at wide fields,
          // which the caption says.
          const v = body.vec;
          const len = Math.hypot(v[0], v[1], v[2] + 0.02);
          const toward = projectVector([v[0] / len, v[1] / len, (v[2] + 0.02) / len], ground, width, height);
          const angle = toward ? Math.atan2(toward.x - pt.x, -(toward.y - pt.y)) / DEG : 0;
          const scale = rr / (MOON_IMG * MOON_IMG_DISC);
          cv.save();
          cv.translate(pt.x, pt.y);
          cv.rotate(angle, 0, 0);
          cv.scale(scale, scale);
          cv.drawImage(sky.moonImage, -MOON_IMG / 2, -MOON_IMG / 2, moonPaint);
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
              cv.save();
              // Clipped past the limb so the glow around the disc darkens with it.
              cv.clipPath(Skia.PathBuilder.Make().addCircle(pt.x, pt.y, rr * 1.35).detach(), ClipOp.Intersect, true);
              cv.drawCircle(cx, cy, sh.penumbraRadiusDeg * pxPerDeg * k, penumbraPaint);
              cv.drawCircle(cx, cy, sh.umbraRadiusDeg * pxPerDeg * k, umbraPaint);
              cv.restore();
            }
          }
        } else if (isMoon || isSun) {
          cv.drawCircle(pt.x, pt.y, rr * 1.9, glowPaint);
          cv.drawCircle(pt.x, pt.y, rr, starPaint);
        } else {
          cv.drawCircle(pt.x, pt.y, rr * 2.2, planetGlow);
          cv.drawCircle(pt.x, pt.y, rr, planetPaint);
        }
        if (isMoon) moonOnScreen = pt.x > 0 && pt.x < width && pt.y > 0 && pt.y < height;
        const text = isMoon && sky.shadow ? `Moon, ${sky.shadow.phase} eclipse` : body.label;
        bodySeen.push({ x: pt.x, y: pt.y, text, accent: !isMoon && !isSun });
        picks.push({ x: pt.x, y: pt.y, name: body.label, kind: isMoon ? "Moon" : isSun ? "Sun" : "Planet", mag: body.magnitude });
      }

      // The moon off screen: an arrow at the edge points the way to it. Its
      // word claims its space before any other label, below.
      let arrowLabel: [number, number, number, number] | null = null;
      const moonBody = sky.bodies.find((b) => b.kind === "moon");
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
        const bottom = height - CONTROLS_CLEARANCE;
        const px = width / 2 + ca * (width / 2 - 30);
        const py = (top + bottom) / 2 + sa * ((bottom - top) / 2);
        const arrow = Skia.PathBuilder.Make();
        arrow.moveTo(px + ca * 10, py + sa * 10);
        arrow.lineTo(px - ca * 6 - sa * 7, py - sa * 6 + ca * 7);
        arrow.lineTo(px - ca * 6 + sa * 7, py - sa * 6 - ca * 7);
        arrow.close();
        cv.drawPath(arrow.detach(), arrowPaint);
        const w = labelFont.measureText("Moon").width;
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
      const placed: number[][] = arrowLabel ? [arrowLabel] : [];
      const claim = (x0: number, y0: number, x1: number, y1: number) => {
        for (const r of placed) {
          if (x0 < r[2] && x1 > r[0] && y0 < r[3] && y1 > r[1]) return false;
        }
        placed.push([x0, y0, x1, y1]);
        return true;
      };

      const label = (x: number, y: number, text: string, paint: any) => {
        if (y < 40 || y > height - 40 || x < -20 || x > width + 20) return;
        const w = labelFont.measureText(text).width;
        const left = x + 11 + w > width - 6;
        const lx = left ? x - 11 - w : x + 11;
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
        label(l.x, l.y, l.text, l.accent ? labelAccent : labelPaint);
      }
      const starLimit = f > 70 ? 10 : f > 40 ? 26 : 60;
      // A name without its star is a label on nothing, so names fade out with them.
      for (const st of dark < 0.4 ? [] : sphere.labels.slice(0, starLimit)) {
        // Cull labels by angular distance from view centre
        const cosDist = st.vec[0] * skyAxes.forward.x + st.vec[1] * skyAxes.forward.y + st.vec[2] * skyAxes.forward.z;
        if (cosDist < minLabelCos) continue;
        const pt = projectVector(st.vec, cam, width, height);
        if (pt) label(pt.x, pt.y, st.name, labelPaint);
      }
      for (const d of dsoSeen) label(d.x, d.y, d.name, dsoLabel);

      // Constellation names last, centred on the figure rather than offset from
      // a point, because they name a region and not an object. They ride the
      // same fade as their lines, so a name never appears without its figure,
      // and they yield to every other label because a region can afford to go
      // unnamed for a frame while you are reading a star.
      for (const c of conNames) {
        if (c.y < 40 || c.y > height - 40) continue;
        const w = labelFont.measureText(c.text).width;
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
  }, [sphere, labelFont, artSheet, width, height, insetTop, picture]);

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
          {isTonight ? "Where are you tonight?" : "No place on this record"}
        </Text>
        <Text style={styles.missing}>
          {isTonight
            ? permission === "denied"
              ? "Location is off for TRACE, so there is no way to know which sky is over you. Turn it on in Settings and this view opens."
              : "The sky overhead depends on where you stand. TRACE uses your location for this view and stores it only on this phone."
            : "The stars that night depend on where it happened. Add a place to this record and the view opens."}
        </Text>
        {isTonight && (
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
          onPress={() => router.back()}
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
      <GestureDetector gesture={gesture}>
        <Canvas style={{ width, height, backgroundColor: Colors.space }}>
          <Picture picture={picture} />
        </Canvas>
      </GestureDetector>

      <View style={[styles.caption, { top: insets.top + Spacing.md }]} pointerEvents="none">
        <Text style={styles.captionLabel}>
          {isTonight ? "The sky tonight" : "The sky as it was"}
        </Text>
        <Text style={styles.captionPlace}>{milestone.location.label}</Text>
        <Text style={styles.captionDate}>
          {isTonight ? "" : `Night of ${formatMilestoneDate(milestone.date)}`}
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.closeButton, { top: insets.top + Spacing.md }]}
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Close the sky view"
        hitSlop={10}
      >
        <X size={24} color={Colors.plateInk} strokeWidth={2} />
      </TouchableOpacity>

      {showPointHint && (
        <View style={[styles.card, { top: insets.top + 110 }]}>
          <Text style={styles.cardTitle}>Hold your phone up to the sky.</Text>
          <Text style={styles.cardBody}>
            The view follows where the phone points, so the stars on screen line up
            with the real ones. Tap Drag at the bottom to look around by hand instead.
          </Text>
          <TouchableOpacity
            onPress={() => {
              setShowPointHint(false);
              setHasSeenPointHint(true);
            }}
            accessibilityRole="button"
            style={styles.cardButton}
          >
            <Text style={styles.cardButtonText}>Got it</Text>
          </TouchableOpacity>
        </View>
      )}

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

      {showHelp && orientation.mode === "drag" && !showPointHint && (
        <View style={styles.help} pointerEvents="none">
          <Text style={styles.helpText}>Drag to look · pinch to zoom · tap a star to name it</Text>
        </View>
      )}

      <View style={[styles.controls, { paddingBottom: insets.bottom + Spacing.md }]}>
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
          {scrubMs != null && (
            <TouchableOpacity style={styles.modeButton} onPress={() => setScrubMs(null)} accessibilityRole="button">
              <Text style={styles.modeText}>{isTonight ? "Now" : "Midnight"}</Text>
            </TouchableOpacity>
          )}
          {orientation.mode === "drag" && moonNow && (
            <TouchableOpacity
              style={styles.modeButton}
              onPress={() => {
                const v = moonNow.vec;
                orientation.viewRef.current.az = ((Math.atan2(v[0], v[1]) / DEG) + 360) % 360;
                orientation.viewRef.current.alt = Math.asin(v[2]) / DEG;
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
              <Text style={styles.modeText}>{orientation.mode === "sensor" ? "Drag" : "Point"}</Text>
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
            {"   "}
            {fov.toFixed(0)}° wide{"   "}The moon is drawn larger than life
          </Text>
        </TouchableOpacity>

        {!orientation.canPoint && orientation.mode === "sensor" && (
          <Text style={styles.note}>
            No motion or compass readings are arriving. Drag still works.
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
  caption: { position: "absolute", left: Spacing.page },
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
  help: { position: "absolute", left: 0, right: 0, top: "50%", alignItems: "center" },
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
