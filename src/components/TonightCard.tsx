import React, { useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { router, type Href } from "expo-router";
import {
  Colors,
  Spacing,
  FontFamily,
  FontSize,
  Tracking,
  Radius,
} from "@/constants/theme";
import { MoonPhaseGlyph } from "./MoonPhaseGlyph";
import { getMoonPhase, describePhase, formatIllumination } from "@/lib/astronomy/moonPhase";
import { getBrightLimbAngle } from "@/lib/astronomy/brightLimb";
import { getMoonReturns } from "@/lib/astronomy/moonReturn";
import {
  todayDateString,
  parseDateString,
  toLocalNight,
  toLocalDayStart,
} from "@/lib/astronomy/dateUtils";
import type { Milestone, MilestoneLocation } from "@/types";

interface TonightCardProps {
  milestones: Milestone[];
  location: MilestoneLocation | null;
}

/**
 * RECURRENCE RULE FIRING RATE CALCULATION:
 *
 * A milestone recurrence requires:
 * 1. Calendar date match: today's (month, day) === milestone's (month, day).
 *    P(date match) = 1 / 365.25 ≈ 0.2738% on any given day.
 * 2. Recurrence match: today's year is an astronomical return year from moonReturn.ts (+11, +19, +30, +38...).
 *    Over a 60-year human life, there are ~6 return years.
 *    P(return year | date match) = 6 / 60 = 10.0%.
 *
 * Daily firing rate for a single milestone:
 *   P(fires today) = (1 / 365.25) * (6 / 60) ≈ 0.0274% (1 in ~3,650 days, or once every 10 years).
 *
 * For a user with N milestones (assuming uncorrelated dates):
 *   P(at least one fires) = 1 - (1 - 0.000274)^N
 *   - For N = 1 milestone:  0.027% (~once per 10 years)
 *   - For N = 5 milestones: 0.137% (~once per 2 years)
 *   - For N = 10 milestones: 0.273% (~once per year)
 *
 * This ensures the return callout is a genuine, mathematically rare event,
 * not a monthly repeat.
 */
export function TonightCard({ milestones, location }: TonightCardProps) {
  const todayStr = todayDateString();
  const { year: todayYear, month: todayMonth, day: todayDay } = useMemo(
    () => parseDateString(todayStr),
    [todayStr]
  );

  // Check if today is an astronomical return for any recorded milestone
  const activeReturn = useMemo(() => {
    for (const m of milestones) {
      const { month, day } = parseDateString(m.date);
      if (month === todayMonth && day === todayDay) {
        const returns = getMoonReturns(m.date, {
          tzOffsetMin: location?.timezoneOffsetMin ?? m.location?.timezoneOffsetMin,
        });
        const hit = returns.find((r) => r.year === todayYear);
        if (hit) {
          return { milestone: m, returnInfo: hit };
        }
      }
    }
    return null;
  }, [milestones, todayMonth, todayDay, todayYear, location]);

  // Tonight's moon over current location
  const tonightMoon = useMemo(() => {
    const tz = location?.timezoneOffsetMin;
    const night = toLocalNight(todayStr, tz);
    const dayStart = toLocalDayStart(todayStr, tz);
    const phase = getMoonPhase(night, dayStart);
    const tilt = location ? getBrightLimbAngle(night, location) : null;
    return { phase, tilt };
  }, [todayStr, location]);

  const handlePress = () => {
    router.push("/sky/tonight" as Href);
  };

  return (
    <TouchableOpacity
      style={styles.plate}
      activeOpacity={0.88}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={
        activeReturn
          ? `Return tonight: ${activeReturn.milestone.title}'s moon returns after ${activeReturn.returnInfo.offsetYears} years`
          : `Tonight's moon: ${describePhase(tonightMoon.phase)}, ${formatIllumination(tonightMoon.phase.phaseFraction)} illuminated`
      }
    >
      {/* Header index line */}
      <View style={styles.headerRow}>
        <Text style={activeReturn ? styles.kickerReturn : styles.kicker}>
          {activeReturn
            ? `RETURN TONIGHT · ${activeReturn.returnInfo.cycleLabel.toUpperCase()}`
            : "TONIGHT OVERHEAD"}
        </Text>
        <Text style={styles.dateMono}>
          {String(todayDay).padStart(2, "0")}.{String(todayMonth).padStart(2, "0")}.{todayYear}
        </Text>
      </View>

      {/* Main content body */}
      <View style={styles.bodyRow}>
        <MoonPhaseGlyph
          phaseFraction={tonightMoon.phase.phaseFraction}
          phaseIndex={tonightMoon.phase.phaseIndex}
          size={52}
          brightLimbAngleDeg={tonightMoon.tilt}
          variant="bare"
        />

        <View style={styles.details}>
          {activeReturn ? (
            <>
              <Text style={styles.title}>
                {activeReturn.milestone.title}
              </Text>
              <Text style={styles.subtitle}>
                Moon returns after {activeReturn.returnInfo.offsetYears} years · {describePhase(tonightMoon.phase)} ({formatIllumination(tonightMoon.phase.phaseFraction)})
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.title}>
                {describePhase(tonightMoon.phase)}
              </Text>
              <Text style={styles.meta}>
                {formatIllumination(tonightMoon.phase.phaseFraction)}
                {tonightMoon.tilt != null
                  ? ` · ${Math.round(Math.abs(tonightMoon.tilt))}° limb tilt`
                  : ""}
              </Text>
              <Text style={styles.locationCaption}>
                {location ? `Over ${location.label}` : "No location set for local tilt"}
              </Text>
            </>
          )}
        </View>
      </View>

      {/* Action rule & link */}
      <View style={styles.footerRow}>
        <Text style={styles.actionText}>VIEW TONIGHT'S SKY</Text>
        <Text style={styles.actionArrow}>→</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  plate: {
    backgroundColor: Colors.plate,
    borderRadius: Radius.plate,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  kicker: {
    fontFamily: FontFamily.monoMedium,
    fontSize: FontSize.micro,
    color: Colors.plateMuted,
    letterSpacing: Tracking.label,
  },
  kickerReturn: {
    fontFamily: FontFamily.monoMedium,
    fontSize: FontSize.micro,
    color: Colors.signal,
    letterSpacing: Tracking.label,
  },
  dateMono: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.micro,
    color: Colors.plateMuted,
    letterSpacing: 0.5,
  },
  bodyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    marginVertical: Spacing.xs,
  },
  details: {
    flex: 1,
  },
  title: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.lead,
    color: Colors.plateInk,
    lineHeight: 22,
  },
  subtitle: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.small,
    color: Colors.plateMuted,
    marginTop: 3,
    lineHeight: 18,
  },
  meta: {
    fontFamily: FontFamily.monoMedium,
    fontSize: FontSize.small,
    color: Colors.signal,
    marginTop: 2,
    letterSpacing: 0.3,
  },
  locationCaption: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.micro,
    color: Colors.plateMuted,
    marginTop: 2,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: Colors.earthshine,
    paddingTop: Spacing.xs,
    marginTop: Spacing.sm,
  },
  actionText: {
    fontFamily: FontFamily.monoMedium,
    fontSize: FontSize.micro,
    color: Colors.plateInk,
    letterSpacing: Tracking.label,
  },
  actionArrow: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.label,
    color: Colors.signal,
  },
});
