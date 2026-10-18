import React, { useEffect, useRef, useState } from "react";
import { View, StyleSheet, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  runOnUI,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/theme";

interface Props {
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
  /** Instants to tick on the rail, such as sunset and sunrise. */
  marks?: number[];
  accessibilityLabel: string;
  /** Read out as the value, since a raw instant means nothing to a screen reader. */
  accessibilityValue: string;
}

const STEP = 10 * 60_000;
const HOUR = 3_600_000;
const THUMB = 22;
/** The thumb's settle onto its ten-minute mark, and onto a value set from outside. */
const SETTLE = { duration: 260, easing: Easing.out(Easing.exp) };

/**
 * A rail and a thumb for scrubbing through one night.
 *
 * Written rather than installed, for the same reason as the Android date wheel:
 * the slider packages that look right are native modules and this app runs in
 * Expo Go. It snaps to ten minutes and ticks the phone once per hour crossed,
 * so a thumb dragged through the night can be felt going past each hour.
 *
 * THE THUMB LIVES ON THE UI THREAD. It used to be placed from the `value` prop,
 * so it moved only after the whole sky screen had re-rendered for the new
 * time, and it trailed the finger by however long that took. Now the finger
 * moves it directly and continuously; only the snapped time goes to the JS
 * thread, at most once a frame, and the thumb settles onto that mark when the
 * finger lifts.
 */
export function TimeScrubber({
  min,
  max,
  value,
  onChange,
  marks = [],
  accessibilityLabel,
  accessibilityValue,
}: Props) {
  const [width, setWidth] = useState(0);
  const span = Math.max(1, max - min);
  const railWidth = useSharedValue(0);
  const thumbX = useSharedValue(0);
  const dragging = useSharedValue(false);
  const lastStep = useSharedValue(value);
  const lastHour = useSharedValue(Math.floor(value / HOUR));

  // A value set from outside ("Midnight", a screen reader) moves the thumb.
  // While a finger is on it, the finger wins.
  useEffect(() => {
    runOnUI((v: number, w: number) => {
      railWidth.value = w;
      if (dragging.value || w <= 0) return;
      lastStep.value = v;
      thumbX.value = withTiming(((v - min) / span) * w, SETTLE);
    })(value, width);
  }, [value, width, min, span]); // eslint-disable-line react-hooks/exhaustive-deps

  // Several snapped values can arrive between two frames on a fast drag. Only
  // the last matters, and the sky re-renders once for it.
  const pending = useRef<number | null>(null);
  const flush = () => {
    const v = pending.current;
    pending.current = null;
    if (v != null) onChange(v);
  };
  const emit = (v: number) => {
    if (pending.current == null) requestAnimationFrame(flush);
    pending.current = v;
  };
  const tick = () => void Haptics.selectionAsync();

  const setFromX = (x: number) => {
    "worklet";
    const w = railWidth.value;
    if (w <= 0) return;
    const cx = Math.min(w, Math.max(0, x));
    thumbX.value = cx;
    const snapped = Math.min(max, Math.max(min, Math.round((min + (cx / w) * span) / STEP) * STEP));
    if (snapped === lastStep.value) return;
    lastStep.value = snapped;
    const hour = Math.floor(snapped / HOUR);
    if (hour !== lastHour.value) {
      lastHour.value = hour;
      runOnJS(tick)();
    }
    runOnJS(emit)(snapped);
  };
  const settle = () => {
    "worklet";
    const w = railWidth.value;
    if (w > 0) thumbX.value = withTiming(((lastStep.value - min) / span) * w, SETTLE);
  };

  const pan = Gesture.Pan()
    .onBegin((e) => {
      dragging.value = true;
      setFromX(e.x);
    })
    .onUpdate((e) => setFromX(e.x))
    .onFinalize(() => {
      dragging.value = false;
      settle();
    });
  const tap = Gesture.Tap().onEnd((e) => {
    setFromX(e.x);
    settle();
  });

  const fillStyle = useAnimatedStyle(() => ({ width: Math.max(0, thumbX.value) }));
  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: thumbX.value - THUMB / 2 }] }));
  const at = (t: number) => ((t - min) / span) * width;

  return (
    <GestureDetector gesture={Gesture.Race(pan, tap)}>
      <View
        style={styles.hit}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ text: accessibilityValue }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => {
          const next = value + (e.nativeEvent.actionName === "increment" ? 3 : -3) * STEP;
          onChange(Math.min(max, Math.max(min, next)));
        }}
      >
        <View style={styles.rail} />
        {width > 0 &&
          marks
            .filter((m) => m >= min && m <= max)
            .map((m) => <View key={m} style={[styles.mark, { left: at(m) - 0.5 }]} />)}
        {width > 0 && <Animated.View style={[styles.fill, fillStyle]} />}
        {width > 0 && <Animated.View style={[styles.thumb, thumbStyle]} />}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  hit: { height: 44, justifyContent: "center" },
  rail: { height: 3, borderRadius: 2, backgroundColor: Colors.plateRule },
  fill: {
    position: "absolute",
    left: 0,
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.signalOnPlate,
  },
  mark: { position: "absolute", width: 1, height: 12, backgroundColor: Colors.plateMuted },
  thumb: {
    position: "absolute",
    left: 0,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: Colors.plateInk,
  },
});
