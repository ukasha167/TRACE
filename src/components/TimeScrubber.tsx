import React, { useCallback, useRef, useState } from "react";
import { View, StyleSheet, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
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

/**
 * A rail and a thumb for scrubbing through one night.
 *
 * Written rather than installed, for the same reason as the Android date wheel:
 * the slider packages that look right are native modules and this app runs in
 * Expo Go. It snaps to ten minutes and ticks the phone once per hour crossed,
 * so a thumb dragged through the night can be felt going past each hour.
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
  const lastHour = useRef(Math.floor(value / HOUR));
  const span = Math.max(1, max - min);

  const setFromX = useCallback(
    (x: number) => {
      if (width <= 0) return;
      const f = Math.min(1, Math.max(0, x / width));
      const snapped = Math.round((min + f * span) / STEP) * STEP;
      const v = Math.min(max, Math.max(min, snapped));
      const hour = Math.floor(v / HOUR);
      if (hour !== lastHour.current) {
        lastHour.current = hour;
        Haptics.selectionAsync();
      }
      onChange(v);
    },
    [width, min, max, span, onChange]
  );

  const pan = Gesture.Pan()
    .onBegin((e) => setFromX(e.x))
    .onUpdate((e) => setFromX(e.x))
    .runOnJS(true);
  const tap = Gesture.Tap()
    .onEnd((e) => setFromX(e.x))
    .runOnJS(true);

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
        {width > 0 && (
          <View style={[styles.fill, { width: Math.max(0, at(value)) }]} />
        )}
        {width > 0 && <View style={[styles.thumb, { left: at(value) - THUMB / 2 }]} />}
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
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: Colors.plateInk,
  },
});
