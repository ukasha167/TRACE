import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Colors, Spacing, Type, FontFamily, FontSize } from "@/constants/theme";
import { SectionHeader } from "./SectionHeader";
import { formatIllumination } from "@/lib/astronomy/moonPhase";
import { formatDuration } from "@/lib/astronomy/nightFacts";
import { daysBetween } from "@/lib/astronomy/anniversary";
import { parseDateString } from "@/lib/astronomy/dateUtils";
import type { PlanetReturns } from "@/lib/astronomy/planetReturns";
import type { MoonReturn } from "@/types";

interface Props {
  returns: MoonReturn[];
  /** The record's own date, "YYYY-MM-DD". The line starts here. */
  sourceDate: string;
  /** Today, "YYYY-MM-DD", for the marker and for past and future. */
  today: string;
  /** Jupiter and Saturn, which come back to the same stars on longer clocks. */
  planets?: PlanetReturns[];
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthYear = (d: Date) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

/** "Jupiter stood in Cancer that night. It was back among the same stars in March 2011 and ..." */
function planetSentence(p: PlanetReturns, now: number): string {
  const past = p.returns.filter((d) => d.getTime() <= now);
  const next = p.returns.find((d) => d.getTime() > now);
  const list = (ds: Date[]) =>
    ds.length <= 1 ? ds.map(monthYear).join("") : `${ds.slice(0, -1).map(monthYear).join(", ")} and ${monthYear(ds[ds.length - 1])}`;
  let s = `${p.planet} stood in ${p.constellation} that night.`;
  if (past.length) s += ` It was back among the same stars in ${list(past)}${next ? `, and returns in ${monthYear(next)}.` : "."}`;
  else if (next) s += ` It is back among the same stars in ${monthYear(next)}.`;
  return s;
}

/** Sixty years is a lifetime's worth of returns, and every one of them fits. */
const SPAN_YEARS = 60;

/**
 * WHEN THIS SKY COMES BACK, drawn as a line.
 *
 * The rows used to be a timetable with a phase offset like ±0.61d beside each
 * year. The offset is real and nobody reads it, and a table does not show the
 * one thing a timeline does: where today sits among the returns. The line runs
 * from the date itself sixty years on, today is marked, and the returns sit on
 * it as filled dots once they have happened and open ones while they are ahead.
 *
 * PAST AND FUTURE ARE BY DATE, not by year. MoonReturn.direction is relative to
 * the record, and comparing years alone would call this October's return past
 * in January.
 */
export function MoonReturnSection({ returns, sourceDate, today, planets = [] }: Props) {
  const source = parseDateString(sourceDate);
  const end = source.year + SPAN_YEARS;
  const pad = (n: number) => String(n).padStart(2, "0");
  const onDate = (year: number) => `${year}-${pad(source.month)}-${pad(source.day)}`;
  const done = (year: number) => daysBetween(onDate(year), today) >= 0;

  const shown = returns.filter((r) => r.year > source.year && r.year <= end);
  const next = shown.find((r) => !done(r.year)) ?? null;
  const thisYear = parseDateString(today).year;
  const todayAt = Math.min(1, Math.max(0, (thisYear - source.year) / SPAN_YEARS));
  const at = (year: number) => `${((year - source.year) / SPAN_YEARS) * 100}%` as const;

  if (shown.length === 0 && planets.length === 0) return null;

  const lead = next
    ? next.year === thisYear
      ? `The moon comes back this year, ${next.offsetYears} years on.`
      : `The moon comes back in ${next.year}, ${next.offsetYears} years on.`
    : shown.length
      ? `The moon last came back in ${shown[shown.length - 1].year}.`
      : "The moon has not come back to this phase on this date yet.";
  const now = Date.UTC(thisYear, Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)));

  return (
    <View style={styles.section}>
      <SectionHeader label="When this sky comes back" />
      <Text style={styles.lead}>{lead}</Text>
      <Text style={styles.explainer}>
        19 years and 235 lunar months differ by about two hours, so the moon
        returns to nearly the same phase on the same date. It is a cycle, not a
        coincidence.
      </Text>

      <View style={styles.line} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={styles.rule} />
        <View style={[styles.today, { left: `${todayAt * 100}%` }]} />
        <Text style={[styles.todayLabel, { left: `${todayAt * 100}%` }]}>Today</Text>
        {shown.map((r) => (
          <View key={r.year} style={[styles.mark, { left: at(r.year) }]}>
            <View style={[styles.dot, done(r.year) ? styles.dotPast : styles.dotAhead]} />
            <Text style={styles.markYear}>{r.year}</Text>
          </View>
        ))}
        <Text style={[styles.end, { left: 0 }]}>{source.year}</Text>
        <Text style={[styles.end, { right: 0 }]}>{end}</Text>
      </View>

      {shown.map((r, i) => (
        <View key={r.year} style={[styles.row, i > 0 && styles.rowRule]}>
          <Text style={styles.year}>{r.year}</Text>
          <View style={styles.info}>
            <Text style={styles.cycle}>
              {r.offsetYears} years on. {r.cycleLabel.replace(/\s*\(\d+ years\)$/, "")}.
            </Text>
            <Text style={styles.offset}>
              {r.phaseOffsetDays * 24 < 1
                ? "Same phase, to within the hour"
                : `Phase ${formatDuration(r.phaseOffsetDays * 86_400_000)} apart`}
            </Text>
          </View>
          <Text style={styles.illum}>{formatIllumination(r.phaseFraction)}</Text>
        </View>
      ))}

      {planets.length > 0 && (
        <View style={styles.planets}>
          <Text style={styles.planetsLabel}>The planets come back too</Text>
          {planets.map((p) => (
            <Text key={p.planet} style={styles.planetText}>
              {planetSentence(p, now)}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: Spacing.xl },
  lead: { ...Type.heading },
  explainer: { ...Type.bodyMuted, marginTop: Spacing.sm },

  line: { height: 96, marginTop: Spacing.md, marginBottom: Spacing.sm },
  rule: { position: "absolute", left: 0, right: 0, top: 46, height: 1, backgroundColor: Colors.rule },
  // Solid: iOS draws no dash on a single-sided border.
  today: { position: "absolute", top: 24, height: 44, width: 1.5, marginLeft: -0.75, backgroundColor: Colors.ink },
  todayLabel: {
    ...Type.label,
    color: Colors.ink,
    position: "absolute",
    top: 4,
    width: 60,
    marginLeft: -30,
    textAlign: "center",
  },
  mark: { position: "absolute", top: 39, width: 44, marginLeft: -22, alignItems: "center", gap: 8 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  dotPast: { backgroundColor: Colors.signal },
  dotAhead: { borderWidth: 2, borderColor: Colors.signal, backgroundColor: Colors.paper },
  markYear: { fontFamily: FontFamily.mono, fontSize: FontSize.label, color: Colors.ink },
  end: {
    position: "absolute",
    top: 80,
    fontFamily: FontFamily.mono,
    fontSize: FontSize.micro,
    color: Colors.inkMuted,
  },

  row: { flexDirection: "row", alignItems: "baseline", gap: Spacing.md, paddingVertical: Spacing.md },
  rowRule: { borderTopWidth: 1, borderTopColor: Colors.rule },
  year: { fontFamily: FontFamily.monoMedium, fontSize: FontSize.lead, color: Colors.signal, width: 56 },
  info: { flex: 1, gap: 2 },
  cycle: { ...Type.body },
  offset: { ...Type.small },
  illum: { fontFamily: FontFamily.mono, fontSize: FontSize.small, color: Colors.inkMuted },

  planets: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.rule,
    gap: Spacing.sm,
  },
  planetsLabel: { ...Type.label },
  planetText: { ...Type.body },
});
