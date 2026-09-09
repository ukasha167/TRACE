import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  ScrollView,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import Animated, {
  type SharedValue,
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  useAnimatedReaction,
  runOnJS,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
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
 * here, being the curve, the tick under the thumb and the way a flick decays
 * into a detent, and reimplementing it there would be strictly worse. This
 * exists because the Android side of `@react-native-community/datetimepicker`
 * is the Material calendar dialog: a modal you open, tap through and dismiss,
 * which is a different interaction with a different rhythm, and on a screen
 * that is otherwise one continuous scroll it reads as a trapdoor.
 *
 * WHY IT IS WRITTEN RATHER THAN INSTALLED. Every wheel picker for React Native
 * that looks right is a native module, and this app runs in Expo Go, where a
 * native module cannot be loaded. The JS-only ones exist but none of them has
 * been through Reanimated 4 and React Native 0.86 yet. So: a ScrollView per
 * column with snap detents, a rotateX per row for the barrel, and one haptic
 * tick per detent crossed.
 *
 * THE TICK IS THE POINT. What people mean when they say the iOS picker feels
 * good is mostly that it answers under the thumb: every value that passes the
 * centre line fires a selection haptic, during the drag and during the decay,
 * not once at the end. So the tick is driven from `useAnimatedReaction` on the
 * live scroll offset rather than from `onMomentumScrollEnd`, which fires once
 * and far too late.
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
const FAR_OPACITY = 0.12;
const FAR_SCALE = 0.84;

/**
 * The style every row past `LIMIT` resolves to, built once and handed back BY
 * REFERENCE rather than rebuilt per frame.
 *
 * This is a performance fix and it is not decoration. Reanimated decides
 * whether to touch a native view by running `shallowEqual` over the style
 * object, and that compares each key with `!==`. A `transform` array built
 * inside the worklet is a new array every frame, so it never compares equal, so
 * EVERY row pushes a native update on EVERY frame even when its own value has
 * not moved. The year column is 201 rows and five of them are on screen.
 * Returning a stable object for the clamped rows means only the handful
 * actually bending push anything.
 *
 * The alternative was a FlatList, which windows the rows for you. That works,
 * and it is what this was first written as, but the form is a ScrollView, and a
 * VirtualizedList nested in a ScrollView of the same orientation is a warning
 * React Native is right to print: the outer view lays the inner one out at full
 * height, so the windowing it was chosen for is defeated anyway.
 */
const FAR_ABOVE = {
  opacity: FAR_OPACITY,
  transform: [
    { perspective: 620 },
    { rotateX: `${-LIMIT * TILT}deg` },
    { scale: FAR_SCALE },
  ],
};
const FAR_BELOW = {
  opacity: FAR_OPACITY,
  transform: [
    { perspective: 620 },
    { rotateX: `${LIMIT * TILT}deg` },
    { scale: FAR_SCALE },
  ],
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Days in a month, Gregorian, with the century rule the naive version drops. */
export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

interface ColumnProps {
  values: string[];
  index: number;
  onIndexChange: (index: number) => void;
  /** Column width. Days and years need different room, so this is not uniform. */
  width: number;
  /** Mono for the figures, sans for the month name. Matches the rest of the app. */
  mono?: boolean;
  label: string;
}

function Column({
  values,
  index,
  onIndexChange,
  width,
  mono = false,
  label,
}: ColumnProps) {
  const ref = useRef<ScrollView>(null);
  const dragging = useRef(false);
  const placed = useRef(false);
  const offset = useSharedValue(index * ITEM_HEIGHT);

  const onScroll = useAnimatedScrollHandler((e) => {
    offset.value = e.contentOffset.y;
  });

  const tick = useCallback(() => {
    Haptics.selectionAsync().catch(() => {
      // A device with haptics switched off, or a simulator. The wheel still
      // works; it just does not answer back.
    });
  }, []);

  // One tick per detent crossed, live. Not on momentum end; see the header.
  useAnimatedReaction(
    () => Math.round(offset.value / ITEM_HEIGHT),
    (current, previous) => {
      if (previous !== null && current !== previous) runOnJS(tick)();
    }
  );

  const commit = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
      const clamped = Math.max(0, Math.min(values.length - 1, next));
      if (clamped !== index) onIndexChange(clamped);
    },
    [index, onIndexChange, values.length]
  );

  // Opening position. `contentOffset` would have been the tidy way to say this,
  // and it is an iOS-only prop, so on Android the wheel opened on row zero
  // whatever date it was handed. Done on layout instead: once, and unanimated.
  const place = useCallback(() => {
    if (placed.current) return;
    placed.current = true;
    ref.current?.scrollTo({ y: index * ITEM_HEIGHT, animated: false });
  }, [index]);

  // The parent can move this column without the user touching it: scrolling the
  // month from March to February pulls the day down from the 31st to the 28th,
  // and the day wheel has to follow. Guarded on `dragging`, because pulling a
  // column out from under a thumb still resting on it is the one way this can
  // feel broken. Guarded on `placed` so mounting does not animate.
  //
  // Reads a prop, not a shared value. Decision 19 is about the latter.
  useEffect(() => {
    if (!placed.current || dragging.current) return;
    ref.current?.scrollTo({ y: index * ITEM_HEIGHT, animated: true });
  }, [index]);

  return (
    <View style={{ width }} accessibilityLabel={label}>
      <Animated.ScrollView
        ref={ref}
        onLayout={place}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        // The form is itself a vertical ScrollView. Without this the parent can
        // intercept the drag on Android and scroll the page instead of the
        // wheel, which is the same nesting the FlatList was warning about,
        // except that here it is the intended arrangement.
        nestedScrollEnabled
        onScrollBeginDrag={() => {
          dragging.current = true;
        }}
        onMomentumScrollEnd={(e) => {
          dragging.current = false;
          commit(e);
        }}
        // A slow drag that stops without a flick never fires momentum end, and
        // without this the wheel would settle on a value it never reported.
        onScrollEndDrag={(e) => {
          dragging.current = false;
          commit(e);
        }}
        contentContainerStyle={styles.content}
      >
        {values.map((value, i) => (
          <Row key={value} i={i} offset={offset} text={value} mono={mono} />
        ))}
      </Animated.ScrollView>
    </View>
  );
}

interface RowProps {
  i: number;
  offset: SharedValue<number>;
  text: string;
  mono: boolean;
}

/**
 * One row of the barrel.
 *
 * The transform is computed from the live scroll offset rather than from the
 * committed index, which is what makes the wheel bend continuously under a drag
 * instead of stepping when a value lands.
 */
function Row({ i, offset, text, mono }: RowProps) {
  const style = useAnimatedStyle(() => {
    const d = i - offset.value / ITEM_HEIGHT;
    // Stable references for the rows that are not bending. See FAR_ABOVE.
    if (d <= -LIMIT) return FAR_ABOVE;
    if (d >= LIMIT) return FAR_BELOW;
    const away = Math.abs(d);
    return {
      opacity: interpolate(
        away,
        [0, 1, LIMIT],
        [1, 0.42, FAR_OPACITY],
        Extrapolation.CLAMP
      ),
      transform: [
        { perspective: 620 },
        { rotateX: `${d * TILT}deg` },
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
    <Animated.View style={[styles.row, style]}>
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
   * handlers: scrolling from 31 March to February has to land on the 28th, or
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
        />
        <Column
          label="Month"
          values={MONTHS}
          index={month}
          onIndexChange={(i) => emit(year, i, day)}
          width={132}
        />
        <Column
          label="Year"
          values={years}
          index={year - minimumYear}
          onIndexChange={(i) => emit(minimumYear + i, month, day)}
          width={80}
          mono
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
  content: { paddingVertical: PAD },
  row: {
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
