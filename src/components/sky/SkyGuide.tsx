import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from "react-native";
import { Canvas, DashPathEffect, Group, Path, Skia, type SkPath } from "@shopify/react-native-skia";
import Animated, {
  Easing,
  Extrapolation,
  FadeIn,
  ReduceMotion,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { lenis } from "@/lib/glide";
import { Colors, FontFamily, FontSize, Spacing, Tracking } from "@/constants/theme";

/** A control on screen, in the overlay's own coordinates. */
export interface GuideRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The arrow's stroke, hand-drawn in four kinds so no two steps look alike. */
export type ArrowKind = "loop" | "dashed" | "squiggle" | "swerve";
const KINDS: ArrowKind[] = ["loop", "dashed", "squiggle", "swerve"];

export interface GuideStep {
  key: string;
  text: string;
  /**
   * Where the control is, in the overlay's coordinates, read when the step
   * begins. Not before: buttons beside it come and go while the guide runs
   * ("Find the moon" leaves once the moon is on screen), and a rect taken at
   * the start put the ring beside the button. Null skips the step.
   */
  measure: () => Promise<GuideRect | null>;
  /** A gesture on the sky itself rather than a control: ringed as a circle. */
  round?: boolean;
  /** Defaults to the step's place in KINDS. */
  arrow?: ArrowKind;
}

type Point = { x: number; y: number };

/**
 * One arrow's stroke from `from` to `to`, laid out along the line between
 * them: `at(t, o)` is the point a fraction t of the way along, pushed o
 * points off the line to one side. Every kind arrives along the last part of
 * its own curve, and the head is set from the curve's tangent there, so the
 * shapes can differ without any of them pointing past the target.
 */
function arrowStroke(kind: ArrowKind, from: Point, to: Point, side: number): SkPath {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const L = Math.hypot(dx, dy) || 1;
  const u = { x: dx / L, y: dy / L };
  const n = { x: -u.y * side, y: u.x * side };
  const at = (t: number, o: number): Point => ({ x: from.x + u.x * t * L + n.x * o, y: from.y + u.y * t * L + n.y * o });
  const path = Skia.PathBuilder.Make();
  path.moveTo(from.x, from.y);
  switch (kind) {
    case "loop": {
      // A curl a third of the way along, like a pen that circles once before
      // it commits: the curve runs forward, over the top, back and down
      // through its own line.
      const r = Math.min(15, L * 0.13);
      const a = at(0.36, 0);
      const c = (along: number, off: number) => ({ x: a.x + u.x * along + n.x * off, y: a.y + u.y * along + n.y * off });
      const k1 = at(0.18, -L * 0.08);
      path.quadTo(k1.x, k1.y, a.x, a.y);
      const c1 = c(r * 2.3, r * 2.4);
      const c2 = c(-r * 1.1, r * 2.4);
      const b = c(r * 0.7, 0);
      path.cubicTo(c1.x, c1.y, c2.x, c2.y, b.x, b.y);
      const k2 = at(0.74, -L * 0.06);
      path.quadTo(k2.x, k2.y, to.x, to.y);
      break;
    }
    case "dashed": {
      // One wide arc, drawn dashed.
      const c1 = at(0.2, L * 0.42);
      const c2 = at(0.8, L * 0.3);
      path.cubicTo(c1.x, c1.y, c2.x, c2.y, to.x, to.y);
      break;
    }
    case "squiggle": {
      // A wave that settles: three crossings of the line, each smaller, then a
      // straight run in.
      const amp = Math.min(13, L * 0.11);
      const steps = 56;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const settle = t < 0.72 ? Math.pow(1 - t / 0.72, 1.1) : 0;
        const q = at(t, amp * Math.sin((t / 0.72) * Math.PI * 3) * settle);
        path.lineTo(q.x, q.y);
      }
      break;
    }
    case "swerve": {
      // An S: out to one side, back across, and in.
      const c1 = at(0.42, L * 0.48);
      const c2 = at(0.58, -L * 0.42);
      path.cubicTo(c1.x, c1.y, c2.x, c2.y, to.x, to.y);
      break;
    }
  }
  return path.detach();
}

interface Props {
  steps: GuideStep[];
  onDone: () => void;
}

/** Gap between the text and the arrow's tail, and between its head and the target. */
const GAP = 12;
/** How far the text sits from the target, which is roughly the arrow's length. */
const REACH = 124;
const RING_PAD = 6;
const HEAD = 10;
/**
 * The arrow grows in an ease-in-out, which is the one timed motion in the app
 * that is not lenis (decision 62): it was asked for by name, and a line drawn
 * toward a point reads as travelling, so it should start and arrive gently.
 */
const GROW_MS = 720;
const growEasing = Easing.inOut(Easing.cubic);

/**
 * THE SKY VIEW'S FIRST-VISIT GUIDE.
 *
 * One step at a time: a sentence, and an arrow that grows from it to the
 * control it is about, then a ring that closes on the control as the arrow
 * lands. A tap anywhere moves on. Each target is measured from the real
 * control when its step begins, so the arrow lands on a button wherever its
 * text wraps it, on any phone.
 *
 * The scrim is light (`Colors.guideScrim`). The guide is about the controls,
 * and a dark scrim would hide exactly what it points at.
 */
export function SkyGuide({ steps, onDone }: Props) {
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<{ y: number; height: number } | null>(null);
  const [target, setTarget] = useState<GuideRect | null>(null);
  const step = steps[index];

  useEffect(() => {
    let alive = true;
    step.measure().then((rect) => {
      if (!alive) return;
      if (rect) setTarget(rect);
      else if (index < steps.length - 1) setIndex(index + 1);
      else onDone();
    });
    return () => {
      alive = false;
    };
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useSharedValue(0);
  const grow = useSharedValue(0);
  const ring = useSharedValue(0);

  // Above the target when it sits in the lower part of the screen, below it
  // otherwise, so the text never covers the thing it describes.
  const above = target ? target.y + target.height / 2 > height * 0.4 : true;

  const geometry = useMemo(() => {
    if (!box || !target) return null;
    const t = target;
    const cx = t.x + t.width / 2;
    const textTop = box.y;
    const textBottom = box.y + box.height;
    // The tail leaves the text toward the target, kept inside the text column.
    const sx = Math.max(Spacing.page + 24, Math.min(width - Spacing.page - 24, cx));
    const start = { x: sx, y: above ? textBottom + GAP : textTop - GAP };
    const end = {
      x: cx,
      y: step.round
        ? t.y + t.height / 2 + (above ? -1 : 1) * (t.height / 2 + RING_PAD + GAP)
        : above
          ? t.y - RING_PAD - GAP
          : t.y + t.height + RING_PAD + GAP,
    };
    // Each curve bows toward the middle of the screen, so it never runs off
    // the edge it started near.
    const kind = step.arrow ?? KINDS[index % KINDS.length];
    // The off-line direction is (-dy, dx) times side, so its x has the sign of
    // -dy * side; pick side to make that point at the middle.
    const towardMiddle = width / 2 - (start.x + end.x) / 2;
    const side = Math.abs(towardMiddle) < 8 ? 1 : Math.sign(towardMiddle) * Math.sign(start.y - end.y || 1);
    const line = arrowStroke(kind, start, end, side);

    // The head follows the curve's own direction at its tip.
    const contour = Skia.ContourMeasureIter(line, false, 1).next();
    const [, tan] = contour ? contour.getPosTan(contour.length()) : [end, { x: 0, y: 1 }];
    const angle = Math.atan2(tan.y, tan.x);
    const head = Skia.PathBuilder.Make();
    head.moveTo(end.x + Math.cos(angle + Math.PI - 0.55) * HEAD, end.y + Math.sin(angle + Math.PI - 0.55) * HEAD);
    head.lineTo(end.x, end.y);
    head.lineTo(end.x + Math.cos(angle + Math.PI + 0.55) * HEAD, end.y + Math.sin(angle + Math.PI + 0.55) * HEAD);

    const ringPath = Skia.PathBuilder.Make();
    if (step.round) {
      ringPath.addCircle(cx, t.y + t.height / 2, t.height / 2 + RING_PAD);
    } else {
      const r = Math.min(t.height / 2 + RING_PAD, 26);
      ringPath.addRRect(
        Skia.RRectXY(
          Skia.XYWHRect(t.x - RING_PAD, t.y - RING_PAD, t.width + RING_PAD * 2, t.height + RING_PAD * 2),
          r,
          r
        )
      );
    }
    return { line, head: head.detach(), ringPath: ringPath.detach(), kind, end, ringCenter: { x: cx, y: t.y + t.height / 2 } };
  }, [box, target, step, index, above, width]);

  // Each step plays once its text has been measured, because the arrow's tail
  // is wherever the text ends.
  useEffect(() => {
    if (!geometry) return;
    const grown = reduced ? 0 : GROW_MS;
    shown.value = withTiming(1, { duration: reduced ? 0 : 260, easing: lenis });
    grow.value = withDelay(reduced ? 0 : 180, withTiming(1, { duration: grown, easing: growEasing }));
    ring.value = withDelay(reduced ? 0 : 180 + grown - 120, withTiming(1, { duration: reduced ? 0 : 280, easing: lenis }));
  }, [geometry]); // eslint-disable-line react-hooks/exhaustive-deps

  const advance = () => {
    const last = index === steps.length - 1;
    const after = () => {
      if (last) {
        onDone();
        return;
      }
      grow.value = 0;
      ring.value = 0;
      setBox(null);
      setTarget(null);
      setIndex(index + 1);
    };
    shown.value = withTiming(0, { duration: reduced ? 0 : 180, easing: lenis }, (finished) => {
      if (finished) runOnJS(after)();
    });
  };

  const headOpacity = useDerivedValue(() => interpolate(grow.value, [0.9, 1], [0, 1], Extrapolation.CLAMP));
  // The head opens out from the tip as the line reaches it.
  const headTransform = useDerivedValue(() => [{ scale: interpolate(grow.value, [0.9, 1], [0.4, 1], Extrapolation.CLAMP) }]);
  // The ring closes onto the control from a little outside it.
  const ringTransform = useDerivedValue(() => [{ scale: interpolate(ring.value, [0, 1], [1.12, 1]) }]);
  const textStyle = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: (1 - shown.value) * (above ? 6 : -6) }],
  }));

  const textYFor = (textHeight: number) =>
    !target ? 0 : above ? target.y - RING_PAD - REACH - textHeight : target.y + target.height + RING_PAD + REACH;

  return (
    <Animated.View
      entering={FadeIn.duration(240).easing(lenis).reduceMotion(ReduceMotion.System)}
      style={styles.root}
      accessibilityViewIsModal
    >
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={advance}
        accessibilityRole="button"
        accessibilityLabel={`${step.text} Step ${index + 1} of ${steps.length}.`}
        accessibilityHint={index === steps.length - 1 ? "Closes the guide." : "Goes to the next step."}
      >
        <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
          {geometry && (
            <Group opacity={shown}>
              <Path path={geometry.line} style="stroke" strokeWidth={2} strokeCap="round" strokeJoin="round" color={Colors.plateInk} start={0} end={grow}>
                {geometry.kind === "dashed" && <DashPathEffect intervals={[8, 7]} />}
              </Path>
              <Group opacity={headOpacity} origin={geometry.end} transform={headTransform}>
                <Path path={geometry.head} style="stroke" strokeWidth={2} strokeCap="round" strokeJoin="round" color={Colors.plateInk} />
              </Group>
              <Group opacity={ring} origin={geometry.ringCenter} transform={ringTransform}>
                <Path path={geometry.ringPath} style="stroke" strokeWidth={1} color={Colors.signalOnPlate} />
              </Group>
            </Group>
          )}
        </Canvas>

        {target && (
        <Animated.View
          key={step.key}
          onLayout={(e) => {
            const { height: h } = e.nativeEvent.layout;
            if (!box || box.height !== h) setBox({ y: textYFor(h), height: h });
          }}
          // Laid out off screen first: where it goes depends on its own height.
          style={[styles.text, { top: box ? box.y : -9999 }, textStyle]}
          pointerEvents="box-none"
        >
          <Text style={styles.count}>
            {index + 1} of {steps.length}
          </Text>
          <Text style={styles.body}>{step.text}</Text>
          <View style={styles.footer}>
            <Text style={styles.hint}>{index === steps.length - 1 ? "Tap to start" : "Tap to continue"}</Text>
            {index < steps.length - 1 && (
              <Pressable onPress={onDone} accessibilityRole="button" hitSlop={12}>
                <Text style={styles.skip}>Skip</Text>
              </Pressable>
            )}
          </View>
        </Animated.View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, backgroundColor: Colors.guideScrim },
  text: { position: "absolute", left: Spacing.page, right: Spacing.page, gap: Spacing.xs },
  count: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.label,
    letterSpacing: Tracking.label,
    textTransform: "uppercase",
    color: Colors.signalOnPlate,
  },
  body: {
    fontFamily: FontFamily.serif,
    fontSize: FontSize.heading,
    lineHeight: 30,
    color: Colors.plateInk,
  },
  footer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: Spacing.xs },
  hint: { fontFamily: FontFamily.mono, fontSize: FontSize.label, color: Colors.plateMuted },
  skip: { fontFamily: FontFamily.medium, fontSize: FontSize.small, color: Colors.plateInk },
});
