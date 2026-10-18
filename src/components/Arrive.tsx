import React from "react";
import type { ViewStyle, StyleProp } from "react-native";
import Animated, { FadeInDown, ReduceMotion } from "react-native-reanimated";
import { Motion } from "@/constants/theme";

interface ArriveProps {
  children: React.ReactNode;
  /** Position in a list. Each step delays arrival by Motion.stagger. */
  index?: number;
  /** Extra delay in ms, on top of the index stagger. */
  delay?: number;
  /** Slower and taller, for a hero rather than a row. */
  slow?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * The app's one arrival animation: rise a little, fade in.
 *
 * There is exactly one of these on purpose. The previous build had no motion
 * at all, which read as absence rather than restraint; the failure mode in the
 * other direction is a different easing on every element, which reads as busy.
 * One gesture, staggered down the page, is enough to make a screen feel like it
 * settles rather than snaps.
 *
 * ReduceMotion.System means a viewer who has asked their OS for less motion
 * gets the content with no transition instead of a shortened one.
 */
export function Arrive({
  children,
  index = 0,
  delay = 0,
  slow = false,
  style,
}: ArriveProps) {
  const entering = FadeInDown.duration(slow ? Motion.durationSlow : Motion.duration)
    .delay(delay + Math.min(index, 8) * Motion.stagger)
    .withInitialValues({
      transform: [{ translateY: slow ? Motion.rise * 1.8 : Motion.rise }],
    })
    .reduceMotion(ReduceMotion.System);

  return (
    <Animated.View entering={entering} style={style}>
      {children}
    </Animated.View>
  );
}
