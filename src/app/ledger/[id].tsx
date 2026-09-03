import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from "react-native";
import { useLocalSearchParams } from "expo-router";
import {
  Colors,
  Spacing,
  Type,
  FontFamily,
  FontSize,
  Tracking,
} from "@/constants/theme";
import { useMilestonesStore } from "@/store/useMilestonesStore";
import { getLifeLedger, type LedgerYear } from "@/lib/astronomy/lifeLedger";
import { LedgerRow } from "@/components/LedgerRow";
import { ImageViewerModal } from "@/components/ImageViewerModal";
import { useApodBatch } from "@/hooks/useApodBatch";
import type { ApodCacheEntry } from "@/types";

/**
 * THE LIFE LEDGER — spec §2 / §8.5.
 *
 * A whole life on one vertical axis. Rows are pure local computation and paint
 * immediately; APOD thumbnails arrive progressively behind them. Turning the
 * network off changes nothing structural about this screen — that is the test
 * it has to pass.
 */
export default function LedgerScreen() {
  const [activeApod, setActiveApod] = useState<ApodCacheEntry | null>(null);
  const { id } = useLocalSearchParams<{ id: string }>();
  const getMilestone = useMilestonesStore((s) => s.getMilestone);
  const milestone = getMilestone(id);

  const rows = useMemo<LedgerYear[]>(
    () =>
      milestone
        ? getLifeLedger(milestone.date, { location: milestone.location })
        : [],
    [milestone]
  );

  const dates = useMemo(() => rows.map((r) => r.date), [rows]);
  const apod = useApodBatch(dates);

  if (!milestone) {
    return (
      <View style={styles.root}>
        <Text style={styles.errorText}>Milestone not found.</Text>
      </View>
    );
  }

  const fullest = rows.filter((r) => r.phaseFraction >= 0.99);
  const label = milestone.type === "birthday" ? "birthdays" : "anniversaries";

  return (
    <View style={styles.root}>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.date}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        initialNumToRender={12}
        windowSize={9}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.kicker}>LIFE IN SKIES</Text>
            <Text style={styles.title}>{milestone.title}</Text>
            <View style={styles.heavyRule} />
            <Text style={styles.subtitle}>
              {rows.length} {label}, and the moon over each one.
            </Text>

            {fullest.length > 0 && (
              <View style={styles.summary}>
                <Text style={styles.summaryText}>
                  <Text style={styles.summaryNumber}>{fullest.length}</Text> of
                  these {label} had a moon at least 99% full —{" "}
                  <Text style={styles.summaryNumber}>
                    {fullest.map((r) => r.year).join(", ")}
                  </Text>
                </Text>
              </View>
            )}

            {apod.rateLimited && (
              <View style={styles.notice}>
                <Text style={styles.noticeText}>
                  NASA's rate limit stopped the image fetch partway. Everything
                  above is unaffected — the images fill in next time.
                </Text>
              </View>
            )}

            {apod.loading && (
              <View style={styles.progress}>
                <ActivityIndicator size="small" color={Colors.inkMuted} />
                <Text style={styles.progressText}>
                  {apod.total > 0
                    ? `Loading images ${apod.fetched}/${apod.total}`
                    : "Checking cache"}
                </Text>
              </View>
            )}
          </View>
        }
        renderItem={({ item, index }) => (
          <LedgerRow
            row={item}
            apod={apod.entries.get(item.date) ?? null}
            isLast={index === rows.length - 1}
            onApodPress={setActiveApod}
          />
        )}
        ListFooterComponent={
          <Text style={styles.footer}>
            Moon phase and tilt are computed on device. Images are NASA's
            Astronomy Picture of the Day for each date — the picture NASA
            featured that day, not one taken on it.
          </Text>
        }
      />

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

  header: { marginBottom: Spacing.lg },
  kicker: { ...Type.label, color: Colors.signal },
  title: {
    fontFamily: FontFamily.black,
    fontSize: FontSize.title,
    letterSpacing: Tracking.title,
    lineHeight: 40,
    color: Colors.ink,
    marginTop: Spacing.sm,
  },
  heavyRule: { height: 3, backgroundColor: Colors.ink, marginTop: Spacing.md },
  subtitle: { ...Type.bodyMuted, marginTop: Spacing.sm },

  summary: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.rule,
  },
  summaryText: { ...Type.body },
  summaryNumber: {
    fontFamily: FontFamily.monoMedium,
    color: Colors.signal,
  },

  notice: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.signal,
  },
  noticeText: { ...Type.small, color: Colors.ink },

  progress: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  progressText: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.label,
    letterSpacing: Tracking.label,
    color: Colors.inkMuted,
  },

  footer: {
    ...Type.small,
    marginTop: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.rule,
  },
  errorText: { ...Type.body, padding: Spacing.page },
});
