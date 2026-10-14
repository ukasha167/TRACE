import React, { useMemo } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { router, type Href } from "expo-router";
import { Colors, Spacing, Type, Radius } from "@/constants/theme";
import { MoonPhaseGlyph } from "./MoonPhaseGlyph";
import {
  countdownLabel,
  describeComingMoon,
  formatWeekdayDate,
  type Anniversary,
} from "@/lib/astronomy/anniversary";
import { formatIllumination } from "@/lib/astronomy/moonPhase";
import { getBrightLimbAngle, getLunarNorthRotation } from "@/lib/astronomy/brightLimb";
import { toLocalNight, parseDateString } from "@/lib/astronomy/dateUtils";
import type { Milestone } from "@/types";

/**
 * The soonest anniversary on the list, and the moon it will bring. The reason
 * to open the app on an ordinary day.
 */
export function ComingUpHome({ milestone, next }: { milestone: Milestone; next: Anniversary }) {
  const tilt = useMemo(() => {
    const place = milestone.location && milestone.location.latitude !== 0 ? milestone.location : null;
    const night = toLocalNight(next.date, milestone.location?.timezoneOffsetMin);
    return {
      limb: place ? getBrightLimbAngle(night, place) : null,
      north: place ? getLunarNorthRotation(night, place) : null,
    };
  }, [milestone, next.date]);

  const when = formatWeekdayDate(next.date).replace(/ \d{4}$/, "");

  return (
    <View style={styles.root}>
      <Text style={styles.label}>Coming up</Text>
      <Pressable
        onPress={() => router.push(`/milestone/${milestone.id}` as Href)}
        accessibilityRole="button"
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
      >
        <MoonPhaseGlyph
          phaseFraction={next.phase.phaseFraction}
          waxing={next.phase.waxing}
          size={60}
          brightLimbAngleDeg={tilt.limb}
          northAngleDeg={tilt.north}
          platePadding={12}
        />
        <View style={styles.text}>
          <Text style={styles.when}>
            {countdownLabel(next.daysLeft)} · {when}
          </Text>
          <Text style={styles.title}>{milestone.title}</Text>
          <Text style={styles.body}>
            {describeComingMoon(next.phase, formatIllumination(next.phase.phaseFraction))}
          </Text>
          {next.moonReturn && (
            <Text style={[styles.body, styles.accent]}>
              The moon comes back to its {parseDateString(milestone.date).year} phase,{" "}
              {next.moonReturn.offsetYears} years on.
            </Text>
          )}
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingTop: Spacing.xl },
  label: { ...Type.label },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.plate,
    backgroundColor: Colors.paperDim,
  },
  text: { flex: 1, gap: 3 },
  when: { ...Type.label, color: Colors.signal },
  title: { ...Type.heading },
  body: { ...Type.small, color: Colors.ink },
  accent: { color: Colors.signal },
});
