import React, { useMemo } from "react";
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from "react-native";
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
import type { Milestone, MilestoneLocation } from "@/types";

interface TonightHeroProps {
  milestones: Milestone[];
  location: MilestoneLocation | null;
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
export function TonightHero({ milestones, location, topInset }: TonightHeroProps) {
  const { width } = useWindowDimensions();
  const todayStr = todayDateString();
  const { year: todayYear, month: todayMonth, day: todayDay } = useMemo(
    () => parseDateString(todayStr),
    [todayStr]
  );

  // Is today an astronomical return for anything on record?
  const activeReturn = useMemo(() => {
    for (const m of milestones) {
      const { month, day } = parseDateString(m.date);
      if (month === todayMonth && day === todayDay) {
        const returns = getMoonReturns(m.date, {
          tzOffsetMin: location?.timezoneOffsetMin ?? m.location?.timezoneOffsetMin,
        });
        const hit = returns.find((r) => r.year === todayYear);
        if (hit) return { milestone: m, returnInfo: hit };
      }
    }
    return null;
  }, [milestones, todayMonth, todayDay, todayYear, location]);

  // Tonight's moon over the current location.
  const tonightMoon = useMemo(() => {
    const tz = location?.timezoneOffsetMin;
    const night = toLocalNight(todayStr, tz);
    const dayStart = toLocalDayStart(todayStr, tz);
    const phase = getMoonPhase(night, dayStart);
    const tilt = location ? getBrightLimbAngle(night, location) : null;
    const north = location ? getLunarNorthRotation(night, location) : null;
    return { phase, tilt, north };
  }, [todayStr, location]);

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

  return (
    <Pressable
      style={[styles.plate, { paddingTop: topInset + Spacing.md }]}
      onPress={() => router.push("/sky/tonight" as Href)}
      accessibilityRole="button"
      accessibilityLabel={
        activeReturn
          ? `Return tonight: ${activeReturn.milestone.title}'s moon returns after ${activeReturn.returnInfo.offsetYears} years`
          : `Tonight's moon: ${describePhase(tonightMoon.phase)}, ${formatIllumination(tonightMoon.phase.phaseFraction)} illuminated`
      }
    >
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
              This moon last hung here {activeReturn.returnInfo.offsetYears} years
              ago. {describePhase(tonightMoon.phase)}, the same as then.
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
            <Text style={styles.caption}>
              {location
                ? `Over ${location.label}`
                : "Set a place to see tonight's tilt"}
            </Text>
          </>
        )}

        <View style={styles.ctaWrap}>
          <View style={styles.cta}>
            <Text style={styles.ctaText}>Look up</Text>
            <Text style={styles.ctaArrow}>→</Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  plate: {
    backgroundColor: Colors.plate,
    borderBottomLeftRadius: Radius.hero,
    borderBottomRightRadius: Radius.hero,
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

  ctaWrap: { alignItems: "center", marginTop: Spacing.lg },
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
