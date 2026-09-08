import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
} from "react-native";
import {
  Canvas,
  Picture,
  Skia,
  BlurStyle,
  BlendMode,
  useFont,
  useImage,
  type SkPicture,
} from "@shopify/react-native-skia";
import { JetBrainsMono_400Regular } from "@expo-google-fonts/jetbrains-mono";
import { useSharedValue } from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
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
import { useMilestonesStore } from "@/store/useMilestonesStore";
import {
  buildSkySphere,
  cameraBasisFromAxes,
  projectSphere,
  projectVector,
  anchorTransform,
  CONSTELLATION_ART_TILE,
} from "@/lib/astronomy/skySphere";
import { toLocalNight } from "@/lib/astronomy/dateUtils";
import { normalizeDeg, rollFromAxes } from "@/lib/astronomy/attitude";
import { useCurrentLocation } from "@/hooks/useCurrentLocation";
import { useSkyOrientation } from "@/hooks/useSkyOrientation";
import { todayDateString } from "@/lib/astronomy/dateUtils";
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
 */
export default function ImmersiveSkyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isTonight = id === "tonight";
  const milestoneFromStore = useMilestonesStore((s) => s.getMilestone(id));
  const { location: currentLocation } = useCurrentLocation();

  const milestone = useMemo<Milestone | null>(() => {
    if (!isTonight) return milestoneFromStore ?? null;
    const todayStr = todayDateString();
    return {
      id: "tonight",
      title: "Tonight's Sky",
      type: "custom",
      date: todayStr,
      location: currentLocation ?? {
        latitude: 51.5074,
        longitude: -0.1278,
        label: "Current Location",
        timezoneOffsetMin: -new Date().getTimezoneOffset(),
      },
      createdAt: new Date().toISOString(),
    };
  }, [isTonight, milestoneFromStore, currentLocation]);

  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const [fov, setFov] = useState(65);
  // FOV feeds the hook so tracking tightens as the view narrows.
  const orientation = useSkyOrientation(180, fov);
  const [showHelp, setShowHelp] = useState(true);
  const [showDebug, setShowDebug] = useState(false);

  const sphere = useMemo(() => {
    if (!milestone?.location) return null;
    const when = toLocalNight(milestone.date, milestone.location.timezoneOffsetMin);
    return buildSkySphere(CATALOG, milestone.location, when, MAG_LIMIT);
  }, [milestone]);


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

  const gesture = useMemo(
    () => Gesture.Simultaneous(panGesture, pinchGesture),
    [panGesture, pinchGesture]
  );

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

    // Paints are built once. Allocating them per frame is pure waste.
    const starPaint = Skia.Paint(); starPaint.setColor(Skia.Color(Colors.moonlight));
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

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const f = fovRef.current;
      const axes = orientationRef.current.axesRef.current;
      const cam = cameraBasisFromAxes(axes, f, width);
      const rollDeg = rollFromAxes(axes);

      // Angular distance threshold for labels (central comfort cone)
      const labelMaxAngleDeg = (f / 2) * 0.75;
      const minLabelCos = Math.cos((labelMaxAngleDeg * Math.PI) / 180);

      const rec = Skia.PictureRecorder();
      const cv = rec.beginRecording();

      const poly = (pts: [number, number, number][], paint: any) => {
        const path = Skia.Path.Make();
        let started = false;
        for (const v of pts) {
          const pt = projectVector(v, cam, width, height);
          if (!pt) { started = false; continue; }
          if (!started) { path.moveTo(pt.x, pt.y); started = true; }
          else path.lineTo(pt.x, pt.y);
        }
        cv.drawPath(path, paint);
      };
      const ring = (altDeg: number): [number, number, number][] => {
        const out: [number, number, number][] = [];
        const ca = Math.cos((altDeg * Math.PI) / 180);
        const sa = Math.sin((altDeg * Math.PI) / 180);
        for (let az = 0; az <= 360; az += 4) {
          const r = (az * Math.PI) / 180;
          out.push([ca * Math.sin(r), ca * Math.cos(r), sa]);
        }
        return out;
      };

      // ---- Sphere scaffolding ----
      for (const alt of [-60, -30, 30, 60]) poly(ring(alt), gridPaint);
      for (let az = 0; az < 360; az += 30) {
        const r = (az * Math.PI) / 180;
        const pts: [number, number, number][] = [];
        for (let alt = -90; alt <= 90; alt += 4) {
          const ar = (alt * Math.PI) / 180;
          pts.push([Math.cos(ar) * Math.sin(r), Math.cos(ar) * Math.cos(r), Math.sin(ar)]);
        }
        poly(pts, gridPaint);
      }

      // ---- Constellation figures, faded by where you are looking ----
      //
      // Figures at the resting alpha all go into ONE path and draw in a single
      // call, which is what the whole set used to do. Only the handful actually
      // fading get their own path and their own alpha, so the common case costs
      // exactly what it did before.
      const focusCos = Math.cos((f / 2) * FIGURE_FOCUS_CONE * DEG);
      const restingFigures = Skia.Path.Make();
      const litFigures: { path: any; alpha: number }[] = [];
      const conNames: { x: number; y: number; text: string; alpha: number }[] = [];

      for (let ci = 0; ci < sphere.figures.length; ci++) {
        const con = sphere.figures[ci];
        const c = con.centroid;
        const dot =
          c[0] * axes.forward.x + c[1] * axes.forward.y + c[2] * axes.forward.z;
        const target = dot >= focusCos ? FIGURE_FOCUS_ALPHA : FIGURE_BASE_ALPHA;
        const alpha =
          figureAlpha[ci] + (target - figureAlpha[ci]) * FIGURE_FADE_RATE;
        figureAlpha[ci] = alpha;

        const lit = alpha > FIGURE_BASE_ALPHA + 0.002;
        const path = lit ? Skia.Path.Make() : restingFigures;
        for (const pts of con.lines) {
          let started = false;
          for (let i = 0; i < pts.length; i += 3) {
            const pt = projectVector(
              [pts[i], pts[i + 1], pts[i + 2]],
              cam,
              width,
              height
            );
            if (!pt) { started = false; continue; }
            if (!started) { path.moveTo(pt.x, pt.y); started = true; }
            else path.lineTo(pt.x, pt.y);
          }
        }
        if (!lit) continue;

        litFigures.push({ path, alpha });
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
            artPaint.setAlphaf(shown * ART_ALPHA);
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

      figurePaint.setAlphaf(FIGURE_BASE_ALPHA);
      cv.drawPath(restingFigures, figurePaint);
      for (const lf of litFigures) {
        figurePaint.setAlphaf(lf.alpha);
        cv.drawPath(lf.path, figurePaint);
      }
      poly(ring(0), horizonPaint);

      // ---- Stars: glow underneath, cores on top ----
      const limit = f > 70 ? 5.4 : f > 40 ? 6.0 : MAG_LIMIT;
      const n = projectSphere(sphere, cam, width, height, buf.current, limit);
      drawnRef.current = n;
      const glow = Skia.Path.Make();
      const cores = Skia.Path.Make();
      const b = buf.current;
      for (let i = 0; i < n; i++) {
        const o = i * 3;
        const x = b[o], y = b[o + 1], r = b[o + 2];
        cores.addCircle(x, y, r);
        if (r > 1.5) glow.addCircle(x, y, r * 2.2);
      }
      cv.drawPath(glow, glowPaint);
      cv.drawPath(cores, starPaint);

      // ---- Deep sky ----
      //
      // No magnitude gate. buildSkySphere already cut the catalogue to the 24
      // objects with names people use, so fame is the filter and a faint famous
      // object (the Little Dumbbell at 11.5) should still be findable. Gating on
      // brightness as well would hide exactly the ones worth going to look for.
      const dsoSeen: { x: number; y: number; name: string }[] = [];
      for (const o of sphere.deepSky) {
        const pt = projectVector(o.vec, cam, width, height);
        if (!pt) continue;

        // Three glyphs for three kinds of object, following chart convention.
        // Cluster glyphs are gone with the clusters themselves.
        const rr = Math.max(3, 260 / f);
        switch (o.kind) {
          case "galaxy": {
            // Dashed oval inclined at 30°, a disc seen at an angle.
            const ov = Skia.Path.Make();
            ov.addOval(Skia.XYWHRect(pt.x - rr * 1.25, pt.y - rr * 0.65, rr * 2.5, rr * 1.3));
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
            const ch = Skia.Path.Make();
            const tick = Math.max(2.5, rr * 0.45);
            ch.moveTo(pt.x - rr - tick, pt.y); ch.lineTo(pt.x - rr, pt.y);
            ch.moveTo(pt.x + rr, pt.y); ch.lineTo(pt.x + rr + tick, pt.y);
            ch.moveTo(pt.x, pt.y - rr - tick); ch.lineTo(pt.x, pt.y - rr);
            ch.moveTo(pt.x, pt.y + rr); ch.lineTo(pt.x, pt.y + rr + tick);
            cv.drawPath(ch, dsoPaint);
            break;
          }
          case "nebula":
          default: {
            // Diffuse nebula: a dashed box framing the cloud.
            const box = Skia.Path.Make();
            box.addRect(Skia.XYWHRect(pt.x - rr, pt.y - rr, rr * 2, rr * 2));
            cv.drawPath(box, dsoDashedPaint);
            break;
          }
        }

        // Cull label by angular distance from view center
        const cosDist = o.vec[0] * axes.forward.x + o.vec[1] * axes.forward.y + o.vec[2] * axes.forward.z;
        if (cosDist >= minLabelCos) {
          dsoSeen.push({ x: pt.x, y: pt.y, name: o.name });
        }
      }

      // ---- Solar system ----
      const bodySeen: { x: number; y: number; text: string; accent: boolean }[] = [];
      for (const body of sphere.bodies) {
        const pt = projectVector(body.vec, cam, width, height);
        if (!pt) continue;
        const isMoon = body.kind === "moon";
        const isSun = body.kind === "sun";
        const rr = isMoon || isSun ? Math.max(9, 420 / f) : Math.max(3.4, 210 / f);
        if (isMoon || isSun) {
          cv.drawCircle(pt.x, pt.y, rr * 1.9, glowPaint);
          cv.drawCircle(pt.x, pt.y, rr, starPaint);
        } else {
          cv.drawCircle(pt.x, pt.y, rr * 2.2, planetGlow);
          cv.drawCircle(pt.x, pt.y, rr, planetPaint);
        }
        bodySeen.push({ x: pt.x, y: pt.y, text: body.label, accent: !isMoon && !isSun });
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
      const placed: number[][] = [];
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
      for (const st of sphere.labels.slice(0, starLimit)) {
        // Cull labels by angular distance from view centre
        const cosDist = st.vec[0] * axes.forward.x + st.vec[1] * axes.forward.y + st.vec[2] * axes.forward.z;
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

        conNamePaint.setAlphaf(c.alpha * 0.75);
        cv.save();
        cv.rotate(rollDeg, c.x, cy);
        cv.drawText(c.text, cx, cy, conNamePaint, labelFont);
        cv.restore();
      }

      picture.value = rec.finishRecordingAsPicture();
      if (++frames % 30 === 0) setDrawn(drawnRef.current);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sphere, labelFont, artSheet, width, height, picture]);

  if (!milestone?.location) {
    return (
      <View style={styles.root}>
        <Text style={styles.missing}>
          This record has no location, so there is no sky to stand under. Add one
          and the view opens.
        </Text>
        <TouchableOpacity onPress={() => router.back()} accessibilityRole="button">
          <Text style={styles.close}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const compassLabel = cardinal(orientation.azimuthDeg);
  const below = orientation.altitudeDeg < -2;

  return (
    <View style={styles.root}>
      <GestureDetector gesture={gesture}>
        <Canvas style={{ width, height, backgroundColor: Colors.space }}>
          <Picture picture={picture} />
        </Canvas>
      </GestureDetector>

      <View style={[styles.caption, { top: insets.top + Spacing.md }]} pointerEvents="none">
        <Text style={styles.captionLabel}>
          {isTonight ? "Tonight overhead" : "The sky as it was"}
        </Text>
        <Text style={styles.captionPlace}>{milestone.location.label}</Text>
        <Text style={styles.captionDate}>
          {isTonight ? "Live celestial sphere" : `Night of ${formatMilestoneDate(milestone.date)}`}
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.closeButton, { top: insets.top + Spacing.md }]}
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Close the sky view"
      >
        <Text style={styles.close}>Close</Text>
      </TouchableOpacity>

      {showHelp && (
        <View style={styles.help} pointerEvents="none">
          <Text style={styles.helpText}>Drag to look · pinch to zoom</Text>
        </View>
      )}

      <View style={[styles.controls, { bottom: insets.bottom + Spacing.md }]}>
        <TouchableOpacity
          onPress={() => setShowDebug((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel="Toggle sensor diagnostics"
        >
          <Text style={styles.facing}>
            {below ? "Below the horizon" : `Facing ${compassLabel}`}
            {"   "}
            {fov.toFixed(0)}°
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.modeButton}
          onPress={() =>
            orientation.setMode(orientation.mode === "sensor" ? "drag" : "sensor")
          }
          accessibilityRole="button"
        >
          <Text style={styles.modeText}>
            {orientation.mode === "sensor"
              ? "Pointing · tap to drag"
              : "Drag · tap to point"}
          </Text>
        </TouchableOpacity>

        {!orientation.canPoint && (
          <Text style={styles.note}>
            No motion or compass readings are arriving. Drag still works.
          </Text>
        )}
        {orientation.permissionDenied && (
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
              {orientation.debug.accuracy ?? "—"}
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
              declination {orientation.debug.northOffset?.toFixed(1) ?? "—"}° ·
              rot {orientation.debug.angularSpeed.toFixed(0)}°/s · perm{" "}
              {orientation.debug.permission ?? "—"}
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
    left: Spacing.page,
    right: Spacing.page,
    gap: Spacing.sm,
  },
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
  missing: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.body,
    lineHeight: 22,
    color: Colors.plateInk,
    padding: Spacing.page,
  },
});
