import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Linking,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import Animated, {
  FadeIn,
  ReduceMotion,
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
import { MoonCarousel } from "./MoonCarousel";
import { lenis } from "@/lib/glide";
import { useMoonCarousel } from "@/hooks/useMoonCarousel";
import { useOpenSky } from "@/hooks/useOpenSky";
import { useSkyPrewarm } from "@/hooks/useSkyPrewarm";
import { StarField } from "./moon/StarField";
import { getMoonPhase, describePhase, formatIllumination } from "@/lib/astronomy/moonPhase";
import { getMoonReturns } from "@/lib/astronomy/moonReturn";
import {
  todayDateString,
  parseDateString,
  toLocalNight,
} from "@/lib/astronomy/dateUtils";
import { addDays, formatWeekdayDate } from "@/lib/astronomy/anniversary";
import type { Milestone, MilestoneLocation } from "@/types";

interface TonightHeroProps {
  /** Nights from tonight shown by the carousel. 0 is tonight. */
  offsetDays: number;
  onChangeOffset: (days: number) => void;
  /** Opens the form with the shown date filled in. */
  onSaveDate: (date: string) => void;
  milestones: Milestone[];
  location: MilestoneLocation;
  /** `location` is the default place, so offer the phone's own. */
  placeIsDefault: boolean;
  /** The person said no to location, so asking again would do nothing. */
  locationDenied: boolean;
  /** The phone is reading its place. */
  locating: boolean;
  /** Opens the permission dialog. Only ever called from a tap. */
  onRequestLocation: () => void;
  /** Safe-area top inset. The plate runs under the status bar. */
  topInset: number;
}

export function TonightHero({
  offsetDays,
  onChangeOffset,
  onSaveDate,
  milestones,
  location,
  placeIsDefault,
  locationDenied,
  locating,
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
          const then = getMoonPhase(toLocalNight(m.date, tz));
          return { milestone: m, returnInfo: hit, thenName: describePhase(then) };
        }
      }
    }
    return null;
  }, [milestones, todayMonth, todayDay, todayYear, isTonight]);

  const items = useMoonCarousel(offsetDays, location);
  const selected = items.find((item) => item.offset === offsetDays)!;
  const tonightMoon = { phase: selected.phase, tilt: selected.brightLimbAngleDeg, north: selected.northAngleDeg };
  // Tonight opens the live sky at this minute. Another day opens that day's
  // evening, so the sky never shows tonight under a different date.
  const { moonRef, openSky } = useOpenSky(isTonight ? "tonight" : "preview", isTonight ? undefined : shownStr);
  // Once the carousel rests, build the sky that tap would open.
  useSkyPrewarm(location, isTonight ? null : shownStr);

  const todayLabel = new Date(todayYear, todayMonth - 1, todayDay).toLocaleDateString(
    "en-GB",
    { day: "numeric", month: "long" }
  );
  const dialLabel = isTonight ? "Tonight" : formatWeekdayDate(shownStr);

  return (
    <View style={[styles.plate, { paddingTop: topInset + Spacing.sm }]} accessible={false}>
      {/* Decorative grain stays identical across dates. See decision 26. */}
      <StarField />

      <View style={styles.kickerRow}>
        <Text style={activeReturn ? styles.kickerReturn : styles.kicker}>
          {activeReturn ? "Returns tonight" : "Trace"}
        </Text>
        <Text style={styles.kickerDate}>{todayLabel}</Text>
      </View>

      <View style={styles.moonWrap}>
        <MoonCarousel items={items} offset={offsetDays} onChange={onChangeOffset}
          size={Math.min(width * 0.46, 220)} width={width} onOpen={openSky} moonRef={moonRef}
          label={`${isTonight ? "Tonight" : formatWeekdayDate(shownStr)}, ${describePhase(tonightMoon.phase)}, ${formatIllumination(tonightMoon.phase.phaseFraction)} lit`} />
      </View>

      <Animated.View
        entering={FadeIn.duration(Motion.duration)
          .easing(lenis)
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
            </Text>
            <Text style={styles.caption}>Over {location.label}</Text>
            {placeIsDefault && locating ? (
              // A fix can take seconds, and the tap that asked for it used to
              // change nothing on screen until the place name did.
              <View style={styles.locating} accessibilityLiveRegion="polite">
                <ActivityIndicator size="small" color={Colors.signalOnPlate} />
                <Text style={[styles.caption, styles.locatingText]}>Finding where you are</Text>
              </View>
            ) : placeIsDefault && (
              // A denied permission needs Settings; another request cannot open it.
              <Pressable
                onPress={locationDenied ? () => Linking.openSettings() : onRequestLocation}
                accessibilityRole="button"
                hitSlop={8}
              >
                <Text style={[styles.caption, styles.captionAction]}>
                  {locationDenied
                    ? "Turn on location to see the moon over you"
                    : "Use my location to see the moon over me"}
                </Text>
              </Pressable>
            )}
          </>
        )}

        {/* No arrows: the moons either side show that it swipes, and the
            carousel itself is adjustable for a screen reader. */}
        <Text style={styles.dialLabel} accessibilityLiveRegion="polite">
          {dialLabel}
        </Text>

        <View style={styles.ctaWrap}>
          {isTonight ? (
            <Pressable style={styles.cta} onPress={openSky} accessibilityRole="button">
              <Text style={styles.ctaText}>See this sky</Text>
              <Text style={styles.ctaArrow}>→</Text>
            </Pressable>
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
    </View>
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
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
    marginHorizontal: -Spacing.page,
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
  locating: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  locatingText: { marginTop: 0, paddingHorizontal: 0, color: Colors.signalOnPlate },

  stepPressed: { opacity: 0.6 },
  dialLabel: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.small,
    color: Colors.plateInk,
    textAlign: "center",
    marginTop: Spacing.md,
  },
  ctaRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: Spacing.sm },
  ctaWrap: { alignItems: "center", marginTop: Spacing.md },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.controlOnSpace,
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
