import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Linking,
  useWindowDimensions,
} from "react-native";
import { router, type Href } from "expo-router";
import Animated, {
  FadeIn,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from "react-native-reanimated";
import {
  Colors,
  Spacing,
  Type,
  FontFamily,
  FontSize,
  Tracking,
  Radius,
  Motion,
} from "@/constants/theme";
import { MoonPhaseGlyph } from "./MoonPhaseGlyph";
import { StarField } from "./moon/StarField";
import { getMoonPhase, describePhase, formatIllumination } from "@/lib/astronomy/moonPhase";
import {
  getBrightLimbAngle,
  getLunarNorthRotation,
} from "@/lib/astronomy/brightLimb";
import { getMoonReturns } from "@/lib/astronomy/moonReturn";
import {
  todayDateString,
  parseDateString,
  toLocalNight,
  toLocalDayStart,
} from "@/lib/astronomy/dateUtils";
import { addDays, formatWeekdayDate } from "@/lib/astronomy/anniversary";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import type { Milestone, MilestoneLocation } from "@/types";

interface TonightHeroProps {
  /** Nights from tonight shown by the dial. 0 is tonight. */
  offsetDays: number;
  onChangeOffset: (days: number) => void;
  /** Opens the form with the dial's date filled in. */
  onSaveDate: (date: string) => void;
  milestones: Milestone[];
  location: MilestoneLocation | null;
  /** The person said no to location, so asking again would do nothing. */
  locationDenied: boolean;
  /** Opens the permission dialog. Only ever called from a tap. */
  onRequestLocation: () => void;
  /** Safe-area top inset. The plate runs under the status bar. */
  topInset: number;
}

/**
 * TONIGHT. The dark hero at the top of Home.
 *
 * This is the plate idea taken to its conclusion. It was a 90pt strip inside
 * the paper page; now it is the top of the screen, bleeds to both edges, runs
 * under the status bar, and the moon is the largest object in the app. The
 * wordmark demotes to an 11pt kicker in its corner, which is the right size for
 * a name nobody needs reminding of after the first launch.
 *
 * Below the rounded bottom edge, the page returns to paper. Reading surfaces
 * are never dark; sky surfaces are never light.
 *
 * RECURRENCE RULE FIRING RATE:
 *
 * A milestone recurrence requires both:
 *   1. Calendar date match: today's (month, day) === the milestone's.
 *      P ≈ 1 / 365.25 ≈ 0.2738% on any given day.
 *   2. Today's year is an astronomical return year from moonReturn.ts
 *      (+11, +19, +30, +38...). Over a 60-year life there are ~6 of them, so
 *      P(return year | date match) = 6 / 60 = 10%.
 *
 * Per milestone: P(fires today) ≈ 0.0274%, once every ~10 years. With N
 * uncorrelated milestones, P = 1 - (1 - 0.000274)^N, about once a year at
 * N = 10. The callout stays a genuinely rare event rather than a monthly repeat.
 */
export function TonightHero({
  offsetDays,
  onChangeOffset,
  onSaveDate,
  milestones,
  location,
  locationDenied,
  onRequestLocation,
  topInset,
}: TonightHeroProps) {
  const { width } = useWindowDimensions();
  const todayStr = todayDateString();
  const { year: todayYear, month: todayMonth, day: todayDay } = useMemo(
    () => parseDateString(todayStr),
    [todayStr]
  );

  const isTonight = offsetDays === 0;
  const shownStr = addDays(todayStr, offsetDays);

  // Is today an astronomical return for anything on record? Asked in the
  // record's own place and time, as every other fact about a record is. The
  // phone's offset used to win here, so a Tokyo record viewed from London was
  // checked against a London night.
  const activeReturn = useMemo(() => {
    if (!isTonight) return null;
    for (const m of milestones) {
      const { month, day } = parseDateString(m.date);
      if (month === todayMonth && day === todayDay) {
        const tz = m.location?.timezoneOffsetMin;
        const returns = getMoonReturns(m.date, { tzOffsetMin: tz });
        const hit = returns.find((r) => r.year === todayYear);
        if (hit) {
          const then = getMoonPhase(toLocalNight(m.date, tz), toLocalDayStart(m.date, tz));
          return { milestone: m, returnInfo: hit, thenName: describePhase(then) };
        }
      }
    }
    return null;
  }, [milestones, todayMonth, todayDay, todayYear, isTonight]);

  // The moon over the current location, tonight or on the dial's night.
  const tonightMoon = useMemo(() => {
    const tz = location?.timezoneOffsetMin;
    const night = toLocalNight(shownStr, tz);
    const dayStart = toLocalDayStart(shownStr, tz);
    const phase = getMoonPhase(night, dayStart);
    const tilt = location ? getBrightLimbAngle(night, location) : null;
    const north = location ? getLunarNorthRotation(night, location) : null;
    return { phase, tilt, north };
  }, [shownStr, location]);

  // The moon settles rather than appearing: it scales up a couple of percent
  // and fades over Motion.durationSlow. Slower than the text beneath it, which
  // is what makes the plate feel like it is being lit rather than switched on.
  const settle = useSharedValue(0);
  React.useEffect(() => {
    settle.value = withTiming(1, {
      duration: Motion.durationSlow,
      easing: Easing.out(Easing.cubic),
    });
  }, [settle]);
  const moonStyle = useAnimatedStyle(() => ({
    opacity: settle.value,
    transform: [{ scale: 0.94 + settle.value * 0.06 }],
  }));

  const todayLabel = new Date(todayYear, todayMonth - 1, todayDay).toLocaleDateString(
    "en-GB",
    { day: "numeric", month: "long" }
  );
  const dialLabel = isTonight ? "Tonight" : formatWeekdayDate(shownStr);

  return (
    <Pressable
      style={[styles.plate, { paddingTop: topInset + Spacing.md }]}
      // The sky view shows tonight, so only tonight's plate opens it. On a
      // dialled night the plate used to open tonight's sky under another date.
      onPress={isTonight ? () => router.push("/sky/tonight" as Href) : undefined}
      disabled={!isTonight}
      accessibilityRole={isTonight ? "button" : "summary"}
      accessibilityLabel={
        activeReturn
          ? `Return tonight: ${activeReturn.milestone.title}'s moon returns after ${activeReturn.returnInfo.offsetYears} years`
          : `${isTonight ? "Tonight's moon" : `The moon on ${dialLabel}`}: ${describePhase(tonightMoon.phase)}, ${formatIllumination(tonightMoon.phase.phaseFraction)} illuminated`
      }
    >
      {/* First child, so it paints under the moon and the type. Decorative and
          identical on every screen in the app — see moon/starGrain.ts. */}
      <StarField />

      <View style={styles.kickerRow}>
        <Text style={activeReturn ? styles.kickerReturn : styles.kicker}>
          {activeReturn ? "Returns tonight" : "Trace"}
        </Text>
        <Text style={styles.kickerDate}>{todayLabel}</Text>
      </View>

      <Animated.View style={[styles.moonWrap, moonStyle]}>
        {/* Sized against the screen, not a constant. At a fixed 132pt the moon
            was smaller than the headline under it, which is not what a hero
            does. The wide halo carries the light into the plate so the disc is
            part of the surface rather than sitting on it. */}
        <MoonPhaseGlyph
          phaseFraction={tonightMoon.phase.phaseFraction}
          waxing={tonightMoon.phase.waxing}
          size={Math.min(width * 0.56, 260)}
          brightLimbAngleDeg={tonightMoon.tilt}
          northAngleDeg={tonightMoon.north}
          variant="bare"
          glow="hero"
        />
      </Animated.View>

      <Animated.View
        entering={FadeIn.duration(Motion.duration)
          .delay(Motion.durationSlow * 0.4)
          .reduceMotion(ReduceMotion.System)}
      >
        {activeReturn ? (
          <>
            <Text style={styles.headline}>{activeReturn.milestone.title}</Text>
            <Text style={styles.figure}>
              {formatIllumination(tonightMoon.phase.phaseFraction)} lit
            </Text>
            <Text style={styles.caption}>
              {/* A return is within a day of the phase, which can straddle a
                  name. "The same as then" is said only when it is. */}
              The moon is back to its {activeReturn.milestone.date.slice(0, 4)} phase,{" "}
              {activeReturn.returnInfo.offsetYears} years on.{" "}
              {describePhase(tonightMoon.phase) === activeReturn.thenName
                ? `${activeReturn.thenName}, the same as then.`
                : `${describePhase(tonightMoon.phase)} tonight, ${activeReturn.thenName} then.`}
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.headline}>{describePhase(tonightMoon.phase)}</Text>
            <Text style={styles.figure}>
              {formatIllumination(tonightMoon.phase.phaseFraction)} lit
              {tonightMoon.tilt != null
                ? `  ·  ${Math.round(Math.abs(tonightMoon.tilt))}° tilt`
                : ""}
            </Text>
            {location ? (
              <Text style={styles.caption}>Over {location.label}</Text>
            ) : (
              // Its own button inside the plate's. The permission dialog opens
              // only from this tap, never on launch, and a refusal sends people
              // to Settings, because asking again after a no shows nothing.
              <Pressable
                onPress={locationDenied ? () => Linking.openSettings() : onRequestLocation}
                accessibilityRole="button"
                hitSlop={8}
              >
                <Text style={[styles.caption, styles.captionAction]}>
                  {locationDenied
                    ? "Location is off. Turn it on to see tonight's tilt"
                    : "Use my location for tonight's tilt"}
                </Text>
              </Pressable>
            )}
          </>
        )}

        {/* THE DIAL. Any night's moon from here, and a way to keep it. The
            plate itself still opens the sky, so these are their own buttons. */}
        <View style={styles.dial}>
          <Pressable
            onPress={() => onChangeOffset(offsetDays - 1)}
            accessibilityRole="button"
            accessibilityLabel="The night before"
            hitSlop={6}
            style={({ pressed }) => [styles.step, pressed && styles.stepPressed]}
          >
            <ChevronLeft size={18} color={Colors.plateInk} strokeWidth={2} />
          </Pressable>
          <Text style={styles.dialLabel} accessibilityLiveRegion="polite">
            {dialLabel}
          </Text>
          <Pressable
            onPress={() => onChangeOffset(offsetDays + 1)}
            accessibilityRole="button"
            accessibilityLabel="The night after"
            hitSlop={6}
            style={({ pressed }) => [styles.step, pressed && styles.stepPressed]}
          >
            <ChevronRight size={18} color={Colors.plateInk} strokeWidth={2} />
          </Pressable>
        </View>

        <View style={styles.ctaWrap}>
          {isTonight ? (
            <View style={styles.cta}>
              <Text style={styles.ctaText}>Look up</Text>
              <Text style={styles.ctaArrow}>→</Text>
            </View>
          ) : (
            <View style={styles.ctaRow}>
              <Pressable
                onPress={() => onChangeOffset(0)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.cta, pressed && styles.stepPressed]}
              >
                <Text style={styles.ctaText}>Back to tonight</Text>
              </Pressable>
              <Pressable
                onPress={() => onSaveDate(shownStr)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.cta, pressed && styles.stepPressed]}
              >
                <Text style={styles.ctaText}>Save this date</Text>
              </Pressable>
            </View>
          )}
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  plate: {
    backgroundColor: Colors.space,
    borderBottomLeftRadius: Radius.hero,
    borderBottomRightRadius: Radius.hero,
    // The star layer fills the plate's whole rect, corners included, so without
    // this a star landing in a bottom corner prints on the paper below the
    // radius. The moon's halo is comfortably inside the plate at every size the
    // hero takes, so nothing else is clipped by it.
    overflow: "hidden",
    paddingHorizontal: Spacing.page,
    paddingBottom: Spacing.lg,
    alignItems: "stretch",
  },

  kickerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  kicker: {
    ...Type.label,
    color: Colors.plateMuted,
  },
  kickerReturn: {
    ...Type.label,
    color: Colors.signalOnPlate,
  },
  kickerDate: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.label,
    letterSpacing: 0.4,
    color: Colors.plateMuted,
  },

  moonWrap: {
    alignItems: "center",
    marginTop: Spacing.xl,
    marginBottom: Spacing.lg,
  },

  headline: {
    fontFamily: FontFamily.serif,
    fontSize: FontSize.title,
    letterSpacing: Tracking.title,
    lineHeight: 36,
    color: Colors.plateInk,
    textAlign: "center",
  },
  figure: {
    fontFamily: FontFamily.monoMedium,
    fontSize: FontSize.small,
    letterSpacing: 0.4,
    color: Colors.signalOnPlate,
    textAlign: "center",
    marginTop: Spacing.xs,
  },
  caption: {
    ...Type.smallOnPlate,
    textAlign: "center",
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  captionAction: {
    color: Colors.signalOnPlate,
    textDecorationLine: "underline",
  },

  dial: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  step: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.plateRule,
    alignItems: "center",
    justifyContent: "center",
  },
  stepPressed: { opacity: 0.6 },
  dialLabel: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.small,
    color: Colors.plateInk,
    minWidth: 190,
    textAlign: "center",
  },
  ctaRow: { flexDirection: "row", gap: Spacing.sm },
  ctaWrap: { alignItems: "center", marginTop: Spacing.md },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.plateRule,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.lg,
  },
  ctaText: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.small,
    color: Colors.plateInk,
  },
  ctaArrow: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.small,
    color: Colors.signalOnPlate,
  },
});
