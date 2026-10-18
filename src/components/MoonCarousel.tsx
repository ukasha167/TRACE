import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS, runOnUI, useAnimatedStyle, useFrameCallback, useSharedValue,
  useReducedMotion, type SharedValue,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { MoonPhaseGlyph } from "./MoonPhaseGlyph";
import { MOON_DAY_LIMIT } from "@/lib/astronomy/moonCarousel";
import { GLIDE, glide, settled } from "@/lib/glide";
import type { MoonCarouselItem } from "@/types";

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
 * thread hears about it twice: a haptic tick per day crossed, and the new date
 * once the coast has nearly landed.
 */
export function MoonCarousel({ items, offset, size, width, onChange, onOpen, moonRef, label }: Props) {
  const position = useSharedValue(offset);
  const target = useSharedValue(offset);
  const start = useSharedValue(offset);
  const dragging = useSharedValue(false);
  const committed = useSharedValue(offset);
  const detent = useSharedValue(offset);
  const reduced = useReducedMotion();
  const stride = width * 0.65;

  const tick = () => void Haptics.selectionAsync();
  const commit = (next: number) => onChange(next);

  const frame = useFrameCallback((info) => {
    const dt = info.timeSincePreviousFrame ?? 16;
    position.value = glide(position.value, target.value, dt, dragging.value ? GLIDE.follow : GLIDE.coast);
    const near = Math.round(position.value);
    if (near !== detent.value) {
      detent.value = near;
      runOnJS(tick)();
    }
    if (!dragging.value && committed.value !== target.value && Math.abs(target.value - position.value) < COMMIT_WITHIN) {
      committed.value = target.value;
      runOnJS(commit)(target.value);
    }
    if (!dragging.value && settled(position.value, target.value)) {
      position.value = target.value;
      runOnJS(stop)();
    }
  }, false);
  // setActive belongs to the JS thread; the frame callback reaches it through runOnJS.
  function stop() { frame.setActive(false); }
  const run = () => frame.setActive(true);

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
    run();
  }, [offset, reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-12, 12])
    .onBegin(() => {
      runOnJS(run)();
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
    });
  const tap = Gesture.Tap().maxDistance(10).onEnd((_event, success) => {
    if (success && Math.abs(position.value - target.value) < 0.05) runOnJS(onOpen)();
  });

  return (
    <GestureDetector gesture={Gesture.Race(pan, tap)}>
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
        {items.map((item) => <OrbitMoon key={item.date} item={item} position={position} size={size} width={width} reduced={reduced} />)}
      </View>
    </GestureDetector>
  );
}

function OrbitMoon({ item, position, size, width, reduced }: {
  item: MoonCarouselItem; position: SharedValue<number>; size: number; width: number; reduced: boolean;
}) {
  const animated = useAnimatedStyle(() => {
    const distance = item.offset - position.value;
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
