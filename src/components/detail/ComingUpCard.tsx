import React, { useMemo } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Bell, BellRing } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, Type, FontFamily, FontSize, Radius } from "@/constants/theme";
import { MoonPhaseGlyph } from "../MoonPhaseGlyph";
import {
  nextAnniversary,
  countdownLabel,
  describeComingMoon,
  occasionLabel,
  formatWeekdayDate,
} from "@/lib/astronomy/anniversary";
import { formatIllumination } from "@/lib/astronomy/moonPhase";
import { getBrightLimbAngle, getLunarNorthRotation } from "@/lib/astronomy/brightLimb";
import { toLocalNight, todayDateString, parseDateString } from "@/lib/astronomy/dateUtils";
import { placeOf } from "@/lib/astronomy/place";
import { reminderBody, REMINDER_HOUR } from "@/lib/reminders/planReminders";
import { useReminderBell } from "@/hooks/useReminders";
import type { Milestone } from "@/types";

/**
 * THIS YEAR'S NIGHT, before it happens.
 *
 * A record used to be a page about the past and nothing else, so there was no
 * reason to open it twice. This card is the reason: how long until the date
 * comes round, what the moon will be, whether it is a year the moon comes back,
 * and a bell that puts the night on the lock screen when it arrives.
 */
export function ComingUpCard({ milestone }: { milestone: Milestone }) {
  const today = todayDateString();
  const { state, toggle } = useReminderBell(milestone.id);

  const view = useMemo(() => {
    const next = nextAnniversary(milestone, today);
    const place = placeOf(milestone.location);
    const night = toLocalNight(next.date, milestone.location?.timezoneOffsetMin);
    return {
      next,
      tilt: place ? getBrightLimbAngle(night, place) : null,
      north: place ? getLunarNorthRotation(night, place) : null,
      preview: reminderBody(milestone, next.year),
    };
  }, [milestone, today]);

  const { next } = view;
  const sourceYear = parseDateString(milestone.date).year;
  const bellLabel =
    state === "on"
      ? "Reminder set for the day"
      : state === "blocked"
        ? "Notifications are off. Open Settings"
        : "Remind me on the day";

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <MoonPhaseGlyph
          phaseFraction={next.phase.phaseFraction}
          waxing={next.phase.waxing}
          size={48}
          brightLimbAngleDeg={view.tilt}
          northAngleDeg={view.north}
          platePadding={9}
        />
        <View style={styles.headText}>
          <Text style={styles.countdown}>{countdownLabel(next.daysLeft)}</Text>
          <Text style={styles.occasion}>{occasionLabel(milestone.type, next.age)}</Text>
          <Text style={styles.when}>{formatWeekdayDate(next.date)}</Text>
        </View>
      </View>

      <Text style={styles.body}>
        {describeComingMoon(next.phase, formatIllumination(next.phase.phaseFraction))}
      </Text>
      {next.moonReturn && (
        <Text style={[styles.body, styles.accent]}>
          A return year. The moon comes back to its {sourceYear} phase,{" "}
          {next.moonReturn.offsetYears} years on.
        </Text>
      )}

      <Pressable
        onPress={() => {
          Haptics.selectionAsync();
          toggle();
        }}
        accessibilityRole="switch"
        accessibilityState={{ checked: state === "on" }}
        style={({ pressed }) => [
          styles.bell,
          state === "on" && styles.bellOn,
          pressed && { opacity: 0.7 },
        ]}
      >
        {state === "on" ? (
          <BellRing size={17} color={Colors.paper} strokeWidth={2} />
        ) : (
          <Bell size={17} color={Colors.signal} strokeWidth={2} />
        )}
        <Text style={[styles.bellText, state === "on" && styles.bellTextOn]}>{bellLabel}</Text>
      </Pressable>

      {state === "on" && (
        <Text style={styles.preview}>
          At {String(REMINDER_HOUR).padStart(2, "0")}:00 on the day: {"“"}
          {view.preview}
          {"”"}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.paperDim,
    borderRadius: Radius.plate,
    padding: Spacing.md + 2,
    gap: Spacing.sm + 4,
    marginBottom: Spacing.xl,
  },
  head: { flexDirection: "row", alignItems: "center", gap: Spacing.md },
  headText: { flex: 1, gap: 2 },
  countdown: { ...Type.label, color: Colors.signal },
  occasion: { ...Type.heading },
  when: { ...Type.small },
  body: { ...Type.body },
  accent: { color: Colors.signal },
  bell: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.signal,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.sm + 5,
    paddingHorizontal: Spacing.md,
  },
  bellOn: { backgroundColor: Colors.signal },
  bellText: { fontFamily: FontFamily.medium, fontSize: FontSize.body, color: Colors.signal },
  bellTextOn: { color: Colors.paper },
  preview: { ...Type.small },
});
