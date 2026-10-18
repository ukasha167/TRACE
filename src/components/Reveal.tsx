import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  StatusBar,
  AccessibilityInfo,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { router, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  cancelAnimation,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { Colors, Spacing, FontFamily, FontSize, Radius, Tracking } from "@/constants/theme";
import { MoonPhaseGlyph } from "./MoonPhaseGlyph";
import { StarField } from "./moon/StarField";
import { useMilestone } from "@/store/useMilestonesStore";
import { useRevealStore } from "@/store/useRevealStore";
import { revealContent, type RevealContent } from "@/lib/astronomy/revealLines";
import { todayDateString } from "@/lib/astronomy/dateUtils";

/**
 * Mounted once at the root, after the navigation stack, so it paints over every
 * screen and header. Shows whichever record useRevealStore names.
 */
export function RevealHost() {
  const id = useRevealStore((s) => s.id);
  const hide = useRevealStore((s) => s.hide);
  const milestone = useMilestone(id ?? undefined);
  const content = useMemo(
    () => (milestone ? revealContent(milestone, todayDateString()) : null),
    [milestone]
  );
  if (!id || !content) return null;
  return <Reveal key={id} content={content} title={milestone!.title} onDone={hide} onShare={() => { hide(); router.push(`/export/${id}` as Href); }} />;
}

interface Props {
  content: RevealContent;
  title: string;
  onShare: () => void;
  onDone: () => void;
}

/** One clock drives everything, in milliseconds, so a skip is one assignment. */
const END = 6200;
const MOON_IN = 300;
const MOON_LANDS = 2500;
const LINE_AT = [2400, 3000, 3800, 4700];
const ACTIONS_AT = 5600;

function fade(t: SharedValue<number>, start: number, rise = 10) {
  "worklet";
  const p = Math.min(1, Math.max(0, (t.value - start) / 750));
  return { opacity: p, transform: [{ translateY: (1 - p) * rise }] };
}

/**
 * THE REVEAL. The moment the app exists for.
 *
 * Saving a record used to call router.back() and drop the person on the list
 * they came from. All of the work the app does, the phase, the tilt, the
 * eclipse search, the rarity walk, happened off screen and waited to be found.
 * Now the screen goes black, the moon of that night rises into it at its real
 * phase and tilt, and four lines follow: when and where, how lit, one thing
 * about that night, and how uncommon it was or when it comes back.
 *
 * A tap skips to the last frame. Reduced motion starts there. A light haptic
 * lands with the moon, and nothing else on this screen makes a sound or a buzz.
 */
function Reveal({ content, title, onDone, onShare }: Props) {
  const { moon, line1, line2, line3, line4 } = content;
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  // A screen reader gets the finished frame, like reduced motion does: lines
  // fading in one by one are invisible to it, and it should not have to wait.
  const [screenReader, setScreenReader] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isScreenReaderEnabled().then(setScreenReader);
  }, []);
  const t = useSharedValue(0);

  useEffect(() => {
    if (reduced || screenReader) {
      cancelAnimation(t);
      t.value = END;
      return;
    }
    t.value = 0;
    t.value = withTiming(END, { duration: END, easing: Easing.linear });
    return () => cancelAnimation(t);
  }, [reduced, screenReader, t]);

  const land = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);
  useAnimatedReaction(
    () => t.value >= MOON_LANDS,
    (now, before) => {
      if (now && before === false) runOnJS(land)();
    }
  );

  const moonStyle = useAnimatedStyle(() => {
    const o = Math.min(1, Math.max(0, (t.value - MOON_IN) / 1800));
    const m = Math.min(1, Math.max(0, (t.value - MOON_IN) / (MOON_LANDS - MOON_IN)));
    const eased = 1 - Math.pow(1 - m, 3);
    return {
      opacity: o,
      transform: [{ translateY: (1 - eased) * 56 }, { scale: 0.94 + eased * 0.06 }],
    };
  });
  const s1 = useAnimatedStyle(() => fade(t, LINE_AT[0]));
  const s2 = useAnimatedStyle(() => fade(t, LINE_AT[1]));
  const s3 = useAnimatedStyle(() => fade(t, LINE_AT[2]));
  const s4 = useAnimatedStyle(() => fade(t, LINE_AT[3]));
  const actions = useAnimatedStyle(() => fade(t, ACTIONS_AT, 0));
  const hint = useAnimatedStyle(() => ({
    opacity: t.value < 900 ? t.value / 900 : t.value > ACTIONS_AT - 600 ? Math.max(0, (ACTIONS_AT - t.value) / 600) : 1,
  }));

  const skip = useCallback(() => {
    if (t.value >= END) return;
    cancelAnimation(t);
    t.value = END;
  }, [t]);

  const moonSize = Math.min(width * 0.6, 300);

  return (
    <Animated.View
      style={styles.overlay}
      entering={FadeIn.duration(250)}
      exiting={FadeOut.duration(450)}
      accessibilityViewIsModal
    >
      <StatusBar barStyle="light-content" />
      {/* Not an accessibility element itself. As one big "skip" button it hid
          the four lines and the way out from VoiceOver, and with the overlay
          modal that left a screen-reader user with nowhere to go. */}
      <Pressable style={styles.root} onPress={skip} accessible={false}>
        <StarField />
        <ScrollView contentContainerStyle={[styles.stage, { paddingTop: insets.top + Spacing.lg, paddingBottom: Spacing.xl }]} showsVerticalScrollIndicator={false}>
          <Animated.View style={[styles.moon, moonStyle]}>
            <MoonPhaseGlyph
              phaseFraction={moon.phaseFraction}
              waxing={moon.waxing}
              size={moonSize}
              brightLimbAngleDeg={moon.brightLimbAngleDeg}
              northAngleDeg={moon.northAngleDeg}
              variant="bare"
              glow="hero"
            />
          </Animated.View>

          <View style={styles.lines}>
            <Animated.Text style={[styles.l2, s1]}>{title}</Animated.Text>
            <Animated.Text style={[styles.l1, s1]}>{line1}</Animated.Text>
            <Animated.Text style={[styles.l2, s2]}>{line2}</Animated.Text>
            {line3 ? <Animated.Text style={[styles.l3, s3]}>{line3}</Animated.Text> : null}
            {line4 ? <Animated.Text style={[styles.l4, s4]}>{line4}</Animated.Text> : null}
          </View>
        </ScrollView>

        <Animated.Text
          style={[styles.hint, { bottom: insets.bottom + Spacing.xl }, hint]}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          Tap to skip
        </Animated.Text>
        <Animated.View style={[styles.actions, { paddingBottom: insets.bottom + Spacing.md }, actions]}>
          {/* Share leads: this frame is the moment people want to send, and
              sharing from the date page cost four taps. Both buttons are
              invisible until the lines land, so an early tap skips like a tap
              anywhere else rather than leaving. */}
          <Pressable
            onPress={() => (t.value >= ACTIONS_AT ? onShare() : skip())}
            accessibilityRole="button"
            style={({ pressed }) => [styles.primary, pressed && { opacity: 0.8 }]}
          >
            <Text style={styles.primaryText}>Share this night</Text>
          </Pressable>
          <Pressable
            onPress={() => (t.value >= ACTIONS_AT ? onDone() : skip())}
            accessibilityRole="button"
            accessibilityLabel="Done, open this date"
            style={styles.quiet}
          >
            <Text style={styles.quietText}>Done</Text>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 10, elevation: 10 },
  root: { flex: 1, backgroundColor: Colors.space },
  stage: { flexGrow: 1, alignItems: "center" },
  moon: { marginTop: Spacing.xl, marginBottom: Spacing.xl },
  lines: { paddingHorizontal: Spacing.xl, alignItems: "center", gap: Spacing.sm + 4 },
  l1: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.small - 1,
    letterSpacing: 0.6,
    color: Colors.plateMuted,
    textAlign: "center",
  },
  l2: {
    fontFamily: FontFamily.serif,
    fontSize: FontSize.title,
    lineHeight: 36,
    letterSpacing: Tracking.title,
    color: Colors.plateInk,
    textAlign: "center",
  },
  l3: {
    fontFamily: FontFamily.serif,
    fontSize: FontSize.lead + 1,
    lineHeight: 27,
    color: Colors.plateInk,
    textAlign: "center",
  },
  l4: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.small + 1,
    lineHeight: 21,
    color: Colors.signalOnPlate,
    textAlign: "center",
  },
  hint: {
    position: "absolute",
    alignSelf: "center",
    fontFamily: FontFamily.regular,
    fontSize: FontSize.label,
    color: Colors.plateMuted,
  },
  actions: { paddingHorizontal: Spacing.page, gap: Spacing.sm },
  quiet: { padding: Spacing.md, alignItems: "center" },
  quietText: { fontFamily: FontFamily.medium, fontSize: FontSize.body, color: Colors.plateMuted },
  primary: {
    backgroundColor: Colors.plateInk,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  primaryText: { fontFamily: FontFamily.semibold, fontSize: FontSize.body, color: Colors.plate },
});
