import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { Gesture, GestureDetector, type ScrollView as GHScrollView } from "react-native-gesture-handler";
import Animated, {
  type FrameInfo,
  type SharedValue,
  runOnJS,
  runOnUI,
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { GLIDE, glide, settled } from "@/lib/glide";
import {
  Colors,
  FontFamily,
  FontSize,
  Radius,
  Spacing,
} from "@/constants/theme";

/**
 * THE DATE WHEEL, FOR ANDROID.
 *
 * iOS keeps its own spinner. UIDatePicker already does the thing being copied
 * here, being the curve, the way a flick decays into a detent, and the day and
 * month wheels that wrap, and reimplementing it there would be strictly worse.
 * This exists because the Android side of `@react-native-community/datetimepicker`
 * is the Material calendar dialog: a modal you open, tap through and dismiss,
 * which is a different interaction with a different rhythm, and on a screen
 * that is otherwise one continuous scroll it reads as a trapdoor.
 *
 * WHY IT IS WRITTEN RATHER THAN INSTALLED. Every wheel picker for React Native
 * that looks right is a native module, and this app runs in Expo Go, where a
 * native module cannot be loaded.
 *
 * A RING, NOT A LONG LIST. The day and month wheels wrap: past the 31st comes
 * the 1st, past December comes January. A ScrollView cannot wrap, and making
 * one look as if it does means repeating the values hundreds of times and
 * re-centring when the reader gets near an end. So each column is a pan and a
 * frame loop instead, the same one the moon carousel runs (lib/glide.ts). The
 * column's position is a number of rows, a finger moves its target, a release
 * throws the target along the flick and the position glides to it, and every
 * row works out its own distance from the centre around a ring of its column's
 * length. The day column holds 31 rows and the month column 12, whatever the
 * reader spins through. The year column is the same wheel with ends.
 *
 * NO TICK. It used to fire a selection haptic per detent crossed. On the Pixel
 * a flick through a year column buzzed the motor for every row, and haptics in
 * this app belong to discrete actions (save, the reveal landing, the bell).
 */

/** Row height. iOS uses 34-40; 38 puts two rows either side in the same box. */
const ITEM_HEIGHT = 38;
/** Rows drawn, always odd so one of them is the centre. */
const VISIBLE = 5;
const PAD = ((VISIBLE - 1) / 2) * ITEM_HEIGHT;
const HEIGHT = ITEM_HEIGHT * VISIBLE;

/** Degrees of barrel rotation per row away from centre. */
const TILT = 32;
/** Rows from centre at which the barrel has turned as far as it is going to. */
const LIMIT = 2.4;
/** Rows from centre past which a row is outside the box and not drawn. */
const OUT = 3;
const FAR_OPACITY = 0.12;
const FAR_SCALE = 0.84;
/**
 * The value is handed to the form once the coast is this close to its detent,
 * as the carousel does. Handing it over at release re-rendered the form in the
 * first frames of the coast, which is when a dropped frame shows.
 */
const COMMIT_WITHIN = 0.15;

/**
 * The style every row outside the box resolves to, built once and handed back
 * BY REFERENCE rather than rebuilt per frame.
 *
 * This is a performance fix and it is not decoration. Reanimated decides
 * whether to touch a native view by running `shallowEqual` over the style
 * object, and that compares each key with `!==`. A `transform` array built
 * inside the worklet is a new array every frame, so it never compares equal, so
 * EVERY row pushes a native update on EVERY frame even when it is out of sight.
 * The year column is 201 rows and five of them are on screen.
 */
const HIDDEN = { opacity: 0, transform: [{ translateY: 0 }] };

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Days in a month, Gregorian, with the century rule the naive version drops. */
export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** `i` onto a ring of `n`, in [0, n). */
function wrap(i: number, n: number): number {
  "worklet";
  return ((i % n) + n) % n;
}

/** The short way round a ring of `n` from `from` to `to`, in [-n/2, n/2). */
function around(to: number, from: number, n: number): number {
  "worklet";
  return wrap(to - from + n / 2, n) - n / 2;
}

function clampRow(v: number, n: number): number {
  "worklet";
  return Math.max(0, Math.min(n - 1, v));
}

interface ColumnProps {
  values: string[];
  index: number;
  onIndexChange: (index: number) => void;
  /** Column width. Days and years need different room, so this is not uniform. */
  width: number;
  /** Mono for the figures, sans for the month name. Matches the rest of the app. */
  mono?: boolean;
  /** Past the last value comes the first. Days and months; never years. */
  loop?: boolean;
  /** The page's scroll, held still while a finger turns this column. */
  scrollRef?: React.RefObject<GHScrollView | null>;
  label: string;
}

function Column({
  values,
  index,
  onIndexChange,
  width,
  mono = false,
  loop = false,
  scrollRef,
  label,
}: ColumnProps) {
  const n = values.length;
  /** Rows from the first value. Unbounded on a ring until the coast lands. */
  const position = useSharedValue(index);
  const target = useSharedValue(index);
  const start = useSharedValue(index);
  const dragging = useSharedValue(false);
  /** A finger is down, moving or not. Holds the loop short of the drag threshold. */
  const touching = useSharedValue(false);
  const committed = useSharedValue(index);
  // Read by the worklets, which are built once. The day column changes length
  // under them when the month does.
  const count = useSharedValue(n);
  const reduced = useReducedMotion();

  const onIndexChangeRef = useRef(onIndexChange);
  onIndexChangeRef.current = onIndexChange;
  const commit = useCallback((next: number) => onIndexChangeRef.current(next), []);

  // Stable, so useFrameCallback registers it once. Returns at once when idle.
  const step = useCallback((info: FrameInfo) => {
    "worklet";
    if (!touching.value && position.value === target.value) return;
    const dt = info.timeSincePreviousFrame ?? 16;
    position.value = glide(position.value, target.value, dt, dragging.value ? GLIDE.follow : GLIDE.coast);
    if (dragging.value) return;
    const landed = loop ? wrap(target.value, count.value) : target.value;
    if (committed.value !== landed && Math.abs(target.value - position.value) < COMMIT_WITHIN) {
      committed.value = landed;
      runOnJS(commit)(landed);
    }
    if (settled(position.value, target.value)) {
      // Back onto the first lap, which no row can tell apart from any other.
      position.value = landed;
      target.value = landed;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useFrameCallback(step, true);

  // The form can move this column without the user touching it: turning the
  // month from March to February pulls the day down from the 31st to the 28th,
  // and the day wheel has to follow. It goes the short way round. Left alone
  // while a finger is on it, because pulling a column out from under a thumb
  // still resting on it is the one way this can feel broken. The column's own
  // commits come back through here too and are ignored.
  useEffect(() => {
    runOnUI((next: number, length: number) => {
      count.value = length;
      if (committed.value === next || touching.value) return;
      committed.value = next;
      target.value = loop ? position.value + around(next, position.value, length) : next;
      if (reduced) position.value = target.value;
    })(index, n);
  }, [index, n, reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .activeOffsetY([-6, 6])
      .onBegin(() => {
        touching.value = true;
      })
      .onStart(() => {
        dragging.value = true;
        start.value = target.value = position.value;
      })
      .onUpdate((event) => {
        const next = start.value - event.translationY / ITEM_HEIGHT;
        if (loop) {
          target.value = next;
        } else {
          // Past the first or last year the wheel resists rather than stopping dead.
          const edge = clampRow(next, count.value);
          target.value = edge + (next - edge) * 0.18;
        }
        if (reduced) position.value = target.value;
      })
      .onEnd((event) => {
        const thrown = Math.round(target.value - (event.velocityY / ITEM_HEIGHT) * GLIDE.throwSeconds);
        target.value = loop ? thrown : clampRow(thrown, count.value);
        if (reduced) position.value = target.value;
      })
      .onFinalize(() => {
        // A cancelled pan never reaches onEnd and would coast to a fraction of
        // a row, and a fraction of a day is not a date.
        const whole = Math.round(target.value);
        target.value = loop ? whole : clampRow(whole, count.value);
        dragging.value = false;
        touching.value = false;
      });
    // A row above or below the band is a shortcut to it, as on UIDatePicker.
    const tap = Gesture.Tap()
      .maxDistance(10)
      .onEnd((event, success) => {
        const rows = Math.round((event.y - HEIGHT / 2) / ITEM_HEIGHT);
        if (!success || rows === 0) return;
        const next = Math.round(target.value) + rows;
        target.value = loop ? next : clampRow(next, count.value);
        if (reduced) position.value = target.value;
      });
    // The form scrolls the same way this column turns. Without this the page
    // takes a vertical swipe that starts on the wheel.
    if (scrollRef) pan.blocksExternalGesture(scrollRef);
    return Gesture.Race(pan, tap);
  }, [reduced, scrollRef]); // eslint-disable-line react-hooks/exhaustive-deps

  const nudge = (by: number) => {
    const next = index + by;
    onIndexChange(loop ? wrap(next, n) : clampRow(next, n));
  };

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={[styles.column, { width }]}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text: values[index] }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={({ nativeEvent }) => nudge(nativeEvent.actionName === "increment" ? 1 : -1)}
      >
        {values.map((value, i) => (
          <Row key={value} i={i} position={position} count={count} loop={loop} text={value} mono={mono} />
        ))}
      </View>
    </GestureDetector>
  );
}

interface RowProps {
  i: number;
  position: SharedValue<number>;
  count: SharedValue<number>;
  loop: boolean;
  text: string;
  mono: boolean;
}

/**
 * One row of the barrel.
 *
 * Placed and bent from the live position rather than from the committed index,
 * which is what makes the wheel turn continuously under a drag instead of
 * stepping when a value lands.
 */
function Row({ i, position, count, loop, text, mono }: RowProps) {
  const style = useAnimatedStyle(() => {
    const d = loop ? around(i, position.value, count.value) : i - position.value;
    const away = Math.abs(d);
    // A stable reference for every row out of sight. See HIDDEN.
    if (away >= OUT) return HIDDEN;
    const bend = Math.max(-LIMIT, Math.min(LIMIT, d));
    return {
      opacity: interpolate(
        away,
        [0, 1, LIMIT],
        [1, 0.42, FAR_OPACITY],
        Extrapolation.CLAMP
      ),
      transform: [
        { translateY: d * ITEM_HEIGHT },
        { perspective: 620 },
        { rotateX: `${bend * TILT}deg` },
        {
          scale: interpolate(
            away,
            [0, LIMIT],
            [1, FAR_SCALE],
            Extrapolation.CLAMP
          ),
        },
      ],
    };
  });

  return (
    <Animated.View style={[styles.row, style]} pointerEvents="none">
      {/* Text is never truncated anywhere in this app, and a wheel is not an
          exception: each column is sized to its longest value instead. */}
      <Text style={[styles.rowText, mono && styles.rowMono]}>{text}</Text>
    </Animated.View>
  );
}

interface Props {
  value: Date;
  onChange: (next: Date) => void;
  minimumYear?: number;
  maximumYear?: number;
  /** The scroll view the wheel sits in, if any. See Column's `scrollRef`. */
  scrollRef?: React.RefObject<GHScrollView | null>;
}

/**
 * Day / month / year, in that order, because the app prints dates that way
 * everywhere else ("15 April 2005") and a picker that disagrees with the label
 * above it makes the reader check.
 */
export function WheelDatePicker({
  value,
  onChange,
  minimumYear = 1900,
  maximumYear = 2100,
  scrollRef,
}: Props) {
  const year = value.getFullYear();
  const month = value.getMonth();
  const day = value.getDate();

  const years = useMemo(
    () =>
      Array.from({ length: maximumYear - minimumYear + 1 }, (_, i) =>
        String(minimumYear + i)
      ),
    [minimumYear, maximumYear]
  );

  const dayCount = daysInMonth(year, month);
  const days = useMemo(
    () => Array.from({ length: dayCount }, (_, i) => String(i + 1)),
    [dayCount]
  );

  /**
   * Rebuilds the date from three independent columns, clamping the day.
   *
   * The clamp is the whole reason this is one function rather than three
   * handlers: turning from 31 March to February has to land on the 28th, or
   * the 29th in a leap year, and `new Date(y, 1, 31)` silently rolls into March
   * instead. That rollover is the same class of bug as the date parsing in
   * dateUtils, and it fails in the same quiet way.
   */
  const emit = useCallback(
    (y: number, m: number, d: number) => {
      const clampedDay = Math.min(d, daysInMonth(y, m));
      onChange(new Date(y, m, clampedDay, 12, 0, 0));
    },
    [onChange]
  );

  return (
    <View style={styles.wrap}>
      {/* The detent band, drawn under the rows so the centred value sits in it
          rather than behind a tint. */}
      <View pointerEvents="none" style={styles.band} />

      <View style={styles.columns}>
        <Column
          label="Day"
          values={days}
          index={Math.min(day, dayCount) - 1}
          onIndexChange={(i) => emit(year, month, i + 1)}
          width={64}
          mono
          loop
          scrollRef={scrollRef}
        />
        <Column
          label="Month"
          values={MONTHS}
          index={month}
          onIndexChange={(i) => emit(year, i, day)}
          width={132}
          loop
          scrollRef={scrollRef}
        />
        <Column
          label="Year"
          values={years}
          index={year - minimumYear}
          onIndexChange={(i) => emit(minimumYear + i, month, day)}
          width={80}
          mono
          scrollRef={scrollRef}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: HEIGHT,
    justifyContent: "center",
  },
  band: {
    position: "absolute",
    left: 0,
    right: 0,
    top: PAD,
    height: ITEM_HEIGHT,
    borderRadius: Radius.sm,
    backgroundColor: Colors.paperDim,
  },
  columns: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  column: { height: HEIGHT, overflow: "hidden" },
  // Every row sits on the band and is moved off it by its own transform.
  row: {
    position: "absolute",
    left: 0,
    right: 0,
    top: PAD,
    height: ITEM_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.lead,
    color: Colors.ink,
    // Android clips descenders on a tall line box without this.
    includeFontPadding: false,
    ...Platform.select({ android: { textAlignVertical: "center" as const } }),
  },
  rowMono: {
    fontFamily: FontFamily.mono,
  },
});
