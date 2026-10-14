import React, { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { Colors, Spacing, Type, FontFamily, FontSize, Radius } from "@/constants/theme";
import { MoonGrid, type MoonGridCell } from "./MoonGrid";
import { nextPhases, phaseEventsBetween, moonRiseSet } from "@/lib/astronomy/tonight";
import { addDays, daysBetween, formatDeviceDay } from "@/lib/astronomy/anniversary";
import { getMoonPhase, formatIllumination } from "@/lib/astronomy/moonPhase";
import { getBrightLimbAngle, getLunarNorthRotation } from "@/lib/astronomy/brightLimb";
import {
  formatLocalTime,
  toDateString,
  toLocalNight,
  todayDateString,
} from "@/lib/astronomy/dateUtils";
import type { MilestoneLocation } from "@/types";

interface Props {
  location: MilestoneLocation | null;
  /** The dial's night, so the strip can mark it. */
  offsetDays: number;
  onPickNight: (offsetDays: number) => void;
}

const NIGHTS = 30;
const CELL = 46;

/**
 * TONIGHT'S SKY, as tools: when the next full and new moon land, when the moon
 * rises and sets, and the next thirty nights at a glance.
 *
 * Every clock time here is on the phone's own clock for the phone's own place,
 * which is the one case the rule against printing clock times allows. With no
 * location there is no rise or set to give, and the tiles say so rather than
 * computing one for somewhere else.
 *
 * Tapping a night in the strip sends the hero's dial to it.
 */
export function TonightTools({ location, offsetDays, onPickNight }: Props) {
  const today = todayDateString();

  const view = useMemo(() => {
    const now = new Date();
    const phases = nextPhases(now);
    const riseSet = location ? moonRiseSet(now, location) : null;

    // Which of the next thirty dates holds an exact full or new moon.
    const marks = new Map<string, "Full" | "New">();
    for (const e of phaseEventsBetween(now, NIGHTS)) {
      marks.set(toDateString(e.at), e.kind === "full" ? "Full" : "New");
    }

    const place = location && location.latitude !== 0 ? location : null;
    const cells: MoonGridCell[] = [];
    for (let i = 0; i < NIGHTS; i++) {
      const date = addDays(today, i);
      const night = toLocalNight(date, location?.timezoneOffsetMin);
      const phase = getMoonPhase(night);
      const mark = marks.get(date);
      const day = Number(date.slice(8));
      cells.push({
        key: String(i),
        label: mark ?? String(day),
        phaseFraction: phase.phaseFraction,
        waxing: phase.waxing,
        brightLimbAngleDeg: place ? getBrightLimbAngle(night, place) : null,
        northAngleDeg: place ? getLunarNorthRotation(night, place) : null,
        full: phase.phaseFraction >= 0.99,
        accessibilityLabel: `${formatDeviceDay(new Date(night.getTime() - 1))}, ${formatIllumination(phase.phaseFraction)} lit${mark ? `, ${mark.toLowerCase()} moon` : ""}`,
      });
    }

    const tile = (kind: "full" | "new") => {
      const e = phases.find((p) => p.kind === kind);
      if (!e) return { big: "Not in 40 days", small: "" };
      const d = daysBetween(today, toDateString(e.at));
      return {
        big: d === 0 ? "Today" : d === 1 ? "Tomorrow" : `In ${d} days`,
        small: `${formatDeviceDay(e.at)}, ${formatLocalTime(e.at)}`,
      };
    };
    const clock = (t: Date | null | undefined) => {
      if (!t) return { big: "Not tonight", small: "" };
      const d = daysBetween(today, toDateString(t));
      return { big: formatLocalTime(t), small: d === 0 ? "Today" : d === 1 ? "Tomorrow" : formatDeviceDay(t) };
    };

    return {
      full: tile("full"),
      fresh: tile("new"),
      rise: riseSet ? clock(riseSet.rise) : { big: "No place yet", small: "Turn on location for this" },
      set: riseSet ? clock(riseSet.set) : { big: "No place yet", small: "Turn on location for this" },
      cells,
    };
  }, [location, today]);

  const tiles = [
    { label: "Full moon", ...view.full, accent: true },
    { label: "New moon", ...view.fresh, accent: true },
    { label: "Moonrise", ...view.rise, accent: false },
    { label: "Moonset", ...view.set, accent: false },
  ];

  return (
    <View style={styles.root}>
      <Text style={styles.label}>Tonight's sky</Text>
      <View style={styles.grid}>
        {tiles.map((t) => (
          <View key={t.label} style={styles.tile} accessible accessibilityLabel={`${t.label}: ${t.big}. ${t.small}`}>
            <Text style={styles.tileLabel}>{t.label}</Text>
            <Text style={[styles.tileBig, t.accent && styles.accent]}>{t.big}</Text>
            {t.small ? <Text style={styles.tileSmall}>{t.small}</Text> : null}
          </View>
        ))}
      </View>
      {location && (
        <Text style={styles.note}>Times on your phone's clock, for {location.label.split(",")[0]}.</Text>
      )}

      <Text style={[styles.label, styles.stripLabel]}>The next {NIGHTS} nights</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        <View style={styles.stripPlate}>
          <MoonGrid
            cells={view.cells}
            columns={NIGHTS}
            width={NIGHTS * CELL}
            moonScale={0.7}
            selectedKey={offsetDays >= 0 && offsetDays < NIGHTS ? String(offsetDays) : null}
            onPressCell={(key) => onPickNight(Number(key))}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingTop: Spacing.xl },
  label: { ...Type.label },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm + 2, marginTop: Spacing.md },
  tile: {
    width: "48%",
    flexGrow: 1,
    backgroundColor: Colors.paperDim,
    borderRadius: Radius.plate,
    paddingVertical: Spacing.md - 2,
    paddingHorizontal: Spacing.md - 2,
    gap: 2,
  },
  tileLabel: { ...Type.label },
  tileBig: { fontFamily: FontFamily.monoMedium, fontSize: FontSize.lead + 2, color: Colors.ink },
  accent: { color: Colors.signal },
  tileSmall: { ...Type.small },
  note: { ...Type.small, marginTop: Spacing.sm },
  stripLabel: { marginTop: Spacing.lg },
  strip: { paddingTop: Spacing.md, paddingRight: Spacing.page },
  stripPlate: {
    backgroundColor: Colors.space,
    borderRadius: Radius.plate,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
});
