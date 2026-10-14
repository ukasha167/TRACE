import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import {
  Colors,
  Spacing,
  Type,
  FontFamily,
  FontSize,
  Radius,
  formatLongDate,
} from "@/constants/theme";
import { useMilestone } from "@/store/useMilestonesStore";
import { getLifeLedger, brightestYears, type LedgerYear } from "@/lib/astronomy/lifeLedger";
import { formatIllumination, describePhase } from "@/lib/astronomy/moonPhase";
import { daysBetween, occasionLabel } from "@/lib/astronomy/anniversary";
import { todayDateString } from "@/lib/astronomy/dateUtils";
import { LedgerRow } from "@/components/LedgerRow";
import { MoonGrid } from "@/components/MoonGrid";
import { MoonPhaseGlyph } from "@/components/MoonPhaseGlyph";
import { ImageViewerModal } from "@/components/ImageViewerModal";
import { useApodBatch } from "@/hooks/useApodBatch";
import type { ApodCacheEntry } from "@/types";

/** How many anniversaries past today the grid shows, faded. */
const AHEAD = 3;

/**
 * LIFE IN MOONS. Spec §2 and §8.5.
 *
 * A whole life as a field of moons, one per anniversary, at its real phase and
 * tilt. Full ones glow, the years the moon came back are ringed, and the next
 * few are there faded so the pattern runs on past today. It used to open on a
 * table, which is still here one tap away, and the table is the better way to
 * read figures; the grid is the better way to see that two of thirty were full.
 *
 * Everything but the NASA pictures is local, so the screen is complete offline.
 */
export default function LedgerScreen() {
  const [activeApod, setActiveApod] = useState<ApodCacheEntry | null>(null);
  const [view, setView] = useState<"grid" | "table">("grid");
  const { id } = useLocalSearchParams<{ id: string }>();
  const milestone = useMilestone(id);
  const { width } = useWindowDimensions();
  const today = todayDateString();

  const rows = useMemo<LedgerYear[]>(
    () =>
      milestone
        ? getLifeLedger(milestone.date, {
            location: milestone.location,
            throughYear: Number(today.slice(0, 4)) + AHEAD,
          })
        : [],
    [milestone, today]
  );
  const past = useMemo(() => rows.filter((r) => daysBetween(r.date, today) >= 0), [rows, today]);
  const lastReturn = [...past].reverse().find((r) => r.isReturn && r.age > 0);
  const [selected, setSelected] = useState<string | null>(null);
  const shown = rows.find((r) => r.date === selected) ?? lastReturn ?? past[past.length - 1] ?? null;

  const dates = useMemo(() => past.map((r) => r.date), [past]);
  const apod = useApodBatch(dates);

  if (!milestone) {
    return (
      <View style={styles.root}>
        <Text style={styles.errorText}>Record not found.</Text>
      </View>
    );
  }

  const label = milestone.type === "birthday" ? "birthdays" : "anniversaries";
  const full = past.filter((r) => r.phaseFraction >= 0.99);
  const [brightest] = brightestYears(past, 1);
  const returns = rows.filter((r) => r.isReturn && r.age > 0);
  const lastPastReturn = [...returns].reverse().find((r) => daysBetween(r.date, today) >= 0);
  const nextReturn = returns.find((r) => daysBetween(r.date, today) < 0);

  const summary = [
    `Full on ${full.length} of the ${past.length} ${label} so far.`,
    brightest ? `The brightest was ${brightest.year}, at ${formatIllumination(brightest.phaseFraction)}.` : "",
    lastPastReturn || nextReturn
      ? `The moon came back to its first phase${lastPastReturn ? ` in ${lastPastReturn.year}` : ""}${
          lastPastReturn && nextReturn ? `, and does again in ${nextReturn.year}.` : nextReturn ? ` in ${nextReturn.year}.` : "."
        }`
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  const header = (
    <View style={styles.header}>
      <Text style={styles.kicker}>Life in moons</Text>
      <Text style={styles.title}>{milestone.title}</Text>
      <Text style={styles.subtitle}>
        Every {formatLongDate(milestone.date).replace(/ \d{4}$/, "")} since {milestone.date.slice(0, 4)}
        {milestone.location ? `, over ${milestone.location.label.split(",")[0]}` : ""}.
      </Text>
      <Text style={styles.summary}>{summary}</Text>

      <View style={styles.segment} accessibilityRole="tablist">
        {(["grid", "table"] as const).map((v) => (
          <Pressable
            key={v}
            onPress={() => setView(v)}
            accessibilityRole="tab"
            accessibilityState={{ selected: view === v }}
            style={[styles.segmentItem, view === v && styles.segmentOn]}
          >
            <Text style={[styles.segmentText, view === v && styles.segmentTextOn]}>
              {v === "grid" ? "Moons" : "Table"}
            </Text>
          </Pressable>
        ))}
      </View>

      {apod.rateLimited && (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            NASA's rate limit stopped the image fetch partway. Everything above is
            unaffected. The images fill in next time.
          </Text>
        </View>
      )}
      {apod.loading && (
        <View style={styles.progress}>
          <ActivityIndicator size="small" color={Colors.inkMuted} />
          <Text style={styles.progressText}>
            {apod.total > 0 ? `Loading images ${apod.fetched}/${apod.total}` : "Checking cache"}
          </Text>
        </View>
      )}
    </View>
  );

  const shownApod = shown ? apod.entries.get(shown.date) ?? null : null;
  const shownFuture = shown ? daysBetween(shown.date, today) < 0 : false;
  const gridWidth = width - Spacing.page * 2 - Spacing.sm * 2;

  return (
    <View style={styles.root}>
      {view === "grid" ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {header}
          <View style={styles.plate}>
            <MoonGrid
              width={gridWidth}
              columns={5}
              moonScale={0.7}
              selectedKey={shown?.date ?? null}
              onPressCell={setSelected}
              cells={rows.map((r) => ({
                key: r.date,
                label: String(r.year),
                phaseFraction: r.phaseFraction,
                waxing: r.waxing,
                brightLimbAngleDeg: r.brightLimbAngleDeg,
                northAngleDeg: r.northAngleDeg,
                full: r.phaseFraction >= 0.99,
                ring: r.isReturn && r.age > 0,
                future: daysBetween(r.date, today) < 0,
                accessibilityLabel: `${r.year}, ${formatIllumination(r.phaseFraction)} lit${r.isReturn && r.age > 0 ? ", a return" : ""}`,
              }))}
            />
          </View>
          <Text style={styles.legend}>
            Glowing moons were full, 99% or more. A ring marks a year the moon came
            back to its first phase. Faded years are still to come.
          </Text>

          {shown && (
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <MoonPhaseGlyph
                  phaseFraction={shown.phaseFraction}
                  waxing={shown.waxing}
                  size={96}
                  brightLimbAngleDeg={shown.brightLimbAngleDeg}
                  northAngleDeg={shown.northAngleDeg}
                  platePadding={14}
                  glow="hero"
                />
                <View style={styles.cardText}>
                  <Text style={styles.cardKicker}>{occasionLabel(milestone.type, shown.age)}</Text>
                  <Text style={styles.cardTitle}>{formatLongDate(shown.date)}</Text>
                  <Text style={styles.cardPhase}>
                    {describePhase(shown)},{" "}
                    <Text style={styles.cardFigure}>{formatIllumination(shown.phaseFraction)}</Text>
                    {shownFuture ? ", to come" : ""}
                  </Text>
                </View>
              </View>
              {shown.isReturn && shown.age > 0 && (
                <Text style={styles.cardReturn}>
                  A return. The moon {shownFuture ? "comes" : "came"} back to its{" "}
                  {milestone.date.slice(0, 4)} phase, {shown.age} years on.
                </Text>
              )}
              {shownApod?.kind === "photograph" ? (
                <Pressable onPress={() => setActiveApod(shownApod)} accessibilityRole="imagebutton" accessibilityLabel={`NASA's picture for that day: ${shownApod.title}`}>
                  <Image source={{ uri: shownApod.url }} style={styles.apod} contentFit="cover" transition={200} />
                  <Text style={styles.apodCaption}>{shownApod.title}</Text>
                </Pressable>
              ) : (
                <Text style={styles.apodNone}>
                  {shownFuture
                    ? "NASA's picture for this date is still to come."
                    : shown.year < 1995 || (shown.year === 1995 && shown.date < "1995-06-16")
                      ? "NASA's daily pictures begin in June 1995."
                      : shownApod
                        ? "NASA's pick that day was not a photograph."
                        : apod.missing.includes(shown.date)
                          ? "NASA's archive has no picture for this date."
                          : apod.loading
                            ? "NASA's picture for this date is loading."
                            : apod.failed.includes(shown.date)
                              ? "NASA's site did not send this date's picture. TRACE asks again next time this opens."
                              : "NASA's picture for this date loads when the phone is online."}
                </Text>
              )}
            </View>
          )}
        </ScrollView>
      ) : (
        <FlatList
          data={past}
          keyExtractor={(r) => r.date}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          initialNumToRender={12}
          windowSize={9}
          ListHeaderComponent={header}
          renderItem={({ item, index }) => (
            <LedgerRow
              row={item}
              apod={apod.entries.get(item.date) ?? null}
              isLast={index === past.length - 1}
              onApodPress={setActiveApod}
            />
          )}
          ListFooterComponent={
            <Text style={styles.footer}>
              Moon phase and tilt are computed on the phone. Images are NASA's
              Astronomy Picture of the Day for each date, which is the picture NASA
              featured that day rather than one taken on it.
            </Text>
          }
        />
      )}

      {activeApod && (
        <ImageViewerModal
          visible={Boolean(activeApod)}
          onClose={() => setActiveApod(null)}
          imageUrl={activeApod.url}
          hdUrl={activeApod.hdurl}
          title={activeApod.title}
          date={activeApod.date}
          copyright={activeApod.copyright}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.paper },
  content: {
    paddingHorizontal: Spacing.page,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxl,
  },

  header: { marginBottom: Spacing.md },
  kicker: { ...Type.label },
  title: { ...Type.display, marginTop: Spacing.sm },
  subtitle: { fontFamily: FontFamily.mono, fontSize: FontSize.small, color: Colors.signal, marginTop: Spacing.sm },
  summary: { ...Type.body, marginTop: Spacing.md },

  segment: {
    flexDirection: "row",
    gap: 4,
    padding: 4,
    marginTop: Spacing.lg,
    borderRadius: Radius.pill,
    backgroundColor: Colors.paperDim,
  },
  segmentItem: { flex: 1, paddingVertical: Spacing.sm + 2, borderRadius: Radius.pill, alignItems: "center" },
  segmentOn: { backgroundColor: Colors.ink },
  segmentText: { fontFamily: FontFamily.medium, fontSize: FontSize.small, color: Colors.inkMuted },
  segmentTextOn: { color: Colors.paper },

  plate: {
    backgroundColor: Colors.space,
    borderRadius: Radius.hero,
    padding: Spacing.sm,
    overflow: "hidden",
  },
  legend: { ...Type.small, marginTop: Spacing.sm },

  card: {
    marginTop: Spacing.lg,
    padding: Spacing.md,
    borderRadius: Radius.plate,
    backgroundColor: Colors.paperDim,
    gap: Spacing.md,
  },
  cardHead: { flexDirection: "row", gap: Spacing.md, alignItems: "center" },
  cardText: { flex: 1, gap: 2 },
  cardKicker: { ...Type.label },
  cardTitle: { ...Type.heading },
  cardPhase: { ...Type.small, color: Colors.ink },
  cardFigure: { fontFamily: FontFamily.monoMedium, color: Colors.signal },
  cardReturn: { ...Type.body, color: Colors.signal },
  apod: { width: "100%", aspectRatio: 16 / 10, borderRadius: Radius.sm, backgroundColor: Colors.plate },
  apodCaption: { ...Type.small, marginTop: Spacing.xs },
  apodNone: { ...Type.small },

  notice: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.plate,
    backgroundColor: Colors.paperDim,
  },
  noticeText: { ...Type.small, color: Colors.ink },
  progress: { flexDirection: "row", alignItems: "center", gap: Spacing.sm, marginTop: Spacing.md },
  progressText: { fontFamily: FontFamily.mono, fontSize: FontSize.label, color: Colors.inkMuted },

  footer: {
    ...Type.small,
    marginTop: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.rule,
  },
  errorText: { ...Type.body, padding: Spacing.page },
});
