import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { View, StyleSheet } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS, runOnUI, useAnimatedStyle, useFrameCallback, useSharedValue,
  useReducedMotion, type FrameInfo, type SharedValue,
} from "react-native-reanimated";
import { MoonPhaseGlyph } from "./MoonPhaseGlyph";
import { MOON_DAY_LIMIT } from "@/lib/astronomy/moonCarousel";
import { GLIDE, glide, settled } from "@/lib/glide";
import type { MoonCarouselItem } from "@/types";

const mod5 = (n: number) => ((n % 5) + 5) % 5;
const clamp = (v: number) => { "worklet"; return Math.max(-MOON_DAY_LIMIT, Math.min(MOON_DAY_LIMIT, v)); };
/** One release travels at most this many days. The window renders two either side. */
const MAX_THROW = 2;
/**
 * The date is handed to the screen once the coast is this close to its detent.
 * Handing it over on release re-rendered the hero, and mounted a new moon at
 * the edge of the window, in the first frames of the coast, which is exactly
 * when a dropped frame shows.
 */
const COMMIT_WITHIN = 0.15;

interface Props {
  items: MoonCarouselItem[];
  offset: number;
  size: number;
  width: number;
  onChange: (offset: number) => void;
  onOpen: () => void;
  moonRef: React.RefObject<View | null>;
  label: string;
}

/**
 * The moons either side of tonight, on an arc, moved by a finger.
 *
 * Every frame of motion is computed on the UI thread by one frame callback that
 * glides the shown position toward a target (lib/glide.ts). The finger moves
 * the target; a release throws it to the nearest day along the flick. The JS
 * thread hears about it once, with the new date, when the coast has nearly
 * landed.
 *
 * The loop runs for as long as Home is mounted and returns at once when idle.
 * It used to switch itself on at touch-down through the JS thread and off when
 * settled, and its first frame ran before the pan activated, found nothing
 * moving, and switched itself off again: the first swipe moved the target with
 * no loop running, and the next touch jumped to it.
 */
export function MoonCarousel({ items, offset, size, width, onChange, onOpen, moonRef, label }: Props) {
  const position = useSharedValue(offset);
  const target = useSharedValue(offset);
  const start = useSharedValue(offset);
  const dragging = useSharedValue(false);
  /** A finger is down, moving or not. Holds the loop short of the drag threshold. */
  const touching = useSharedValue(false);
  const committed = useSharedValue(offset);
  const reduced = useReducedMotion();
  const stride = width * 0.65;

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const commit = useCallback((next: number) => onChangeRef.current(next), []);

  // Stable, so useFrameCallback registers it once. An inline worklet is new on
  // every render and re-registered at each date handover and location update.
  const step = useCallback((info: FrameInfo) => {
    "worklet";
    if (!touching.value && position.value === target.value) return;
    const dt = info.timeSincePreviousFrame ?? 16;
    position.value = glide(position.value, target.value, dt, dragging.value ? GLIDE.follow : GLIDE.coast);
    if (!dragging.value && committed.value !== target.value && Math.abs(target.value - position.value) < COMMIT_WITHIN) {
      committed.value = target.value;
      runOnJS(commit)(target.value);
    }
    if (!dragging.value && settled(position.value, target.value)) position.value = target.value;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useFrameCallback(step, true);

  // A date chosen elsewhere: "Back to tonight", or a screen reader's swipe.
  // The carousel's own commits come back through here too and are ignored.
  useEffect(() => {
    runOnUI((next: number) => {
      if (committed.value === next) return;
      committed.value = next;
      target.value = next;
      // Further than the window renders, the moons in between do not exist, so
      // the carousel cuts rather than gliding across empty arc.
      if (reduced || Math.abs(position.value - next) > MAX_THROW) position.value = next;
    })(offset);
  }, [offset, reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  // Built once per size. A new gesture object makes Gesture Handler copy its
  // worklets to the UI thread again, and every landing re-rendered this
  // component while the coast was still moving.
  const gesture = useMemo(() => {
    const open = () => onOpenRef.current();
    const pan = Gesture.Pan()
      // Android's touch slop. Any more and the page's native vertical scroll
      // takes a slightly diagonal swipe first.
      .activeOffsetX([-8, 8])
      .failOffsetY([-12, 12])
      .onBegin(() => {
        touching.value = true;
      })
      .onStart(() => {
        dragging.value = true;
        start.value = target.value = position.value;
      })
      .onUpdate((event) => {
        const next = start.value - event.translationX / stride;
        const edge = clamp(next);
        // Past the thirtieth day the arc resists rather than stopping dead.
        target.value = reduced ? start.value : edge + (next - edge) * 0.18;
        if (reduced) position.value = target.value;
      })
      .onEnd((event) => {
        const from = Math.round(start.value);
        const thrown = target.value - (event.velocityX / stride) * GLIDE.throwSeconds;
        const next = clamp(Math.round(Math.max(from - MAX_THROW, Math.min(from + MAX_THROW, thrown))));
        target.value = next;
        if (reduced) position.value = next;
      })
      .onFinalize(() => {
        dragging.value = false;
        touching.value = false;
      });
    const tap = Gesture.Tap().maxDistance(10).onEnd((_event, success) => {
      if (success && Math.abs(position.value - target.value) < 0.05) runOnJS(open)();
    });
    return Gesture.Race(pan, tap);
  }, [stride, reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={{ height: size + 48, width }}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityHint="Swipe to change the date. Double tap to open the sky."
        accessibilityValue={{ min: -MOON_DAY_LIMIT, max: MOON_DAY_LIMIT, now: offset }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }, { name: "activate" }]}
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === "activate") onOpen();
          else onChange(clamp(offset + (nativeEvent.actionName === "increment" ? 1 : -1)));
        }}
      >
        <View ref={moonRef} collapsable={false} pointerEvents="none" style={{ position: "absolute", left: (width - size) / 2, top: 16, width: size, height: size }} />
        {/* Keyed by slot, not by date: at a handover the moon leaving one edge
            becomes the moon entering the other (both sit at opacity 0), so no
            Skia canvas is torn down and rebuilt on the UI thread mid-coast. */}
        {items.map((item) => <OrbitMoon key={mod5(item.offset)} item={item} position={position} size={size} width={width} reduced={reduced} />)}
      </View>
    </GestureDetector>
  );
}

function OrbitMoon({ item, position, size, width, reduced }: {
  item: MoonCarouselItem; position: SharedValue<number>; size: number; width: number; reduced: boolean;
}) {
  // Read outside the worklet: capturing `item` restarted all five animations
  // each time the screen handed down a fresh object for the same moon.
  const at = item.offset;
  const animated = useAnimatedStyle(() => {
    const distance = at - position.value;
    const angle = Math.max(-2, Math.min(2, distance)) * 0.95;
    return {
      opacity: Math.max(0, 1 - Math.abs(distance) * 0.68),
      transform: [
        { translateX: Math.sin(angle) * width * 0.76 },
        { translateY: reduced ? 0 : (1 - Math.cos(angle)) * size * 0.72 },
        { scale: Math.max(0.55, 1 - Math.abs(distance) * 0.28) },
      ],
    };
  });
  return (
    <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={[styles.moon, { width: size, height: size, left: (width - size) / 2 }, animated]}>
      <MoonPhaseGlyph {...item.phase} size={size} brightLimbAngleDeg={item.brightLimbAngleDeg} northAngleDeg={item.northAngleDeg} variant="bare" glow="hero" />
    </Animated.View>
  );
}
const styles = StyleSheet.create({ moon: { position: "absolute", top: 16, alignItems: "center", justifyContent: "center" } });
