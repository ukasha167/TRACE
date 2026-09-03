import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { router, type Href } from "expo-router";
import {
  Colors,
  Spacing,
  Type,
  FontFamily,
  FontSize,
  Tracking,
} from "@/constants/theme";
import { useMilestonesStore } from "@/store/useMilestonesStore";
import { MilestoneListRow } from "@/components/MilestoneListRow";
import { TonightCard } from "@/components/TonightCard";
import { useCurrentLocation } from "@/hooks/useCurrentLocation";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const route = (path: string) => path as Href;

/**
 * HOME — the record ledger.
 *
 * Swiss masthead: the wordmark set large, a heavy rule beneath it, then a mono
 * index line. Rows are separated by hairlines rather than boxed into cards —
 * the rule IS the structure, which is the whole point of the style.
 */
export default function HomeScreen() {
  const milestones = useMilestonesStore((s) => s.milestones);
  const { location } = useCurrentLocation();
  const insets = useSafeAreaInsets();
  const isEmpty = milestones.length === 0;

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Spacing.lg },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.masthead}>
          <Text style={styles.wordmark}>TRACE</Text>
          <View style={styles.heavyRule} />
          <View style={styles.mastheadMeta}>
            <Text style={styles.metaLabel}>A RECORD OF SKIES</Text>
            <Text style={styles.metaCount}>
              {String(milestones.length).padStart(2, "0")}
            </Text>
          </View>
        </View>

        <TonightCard milestones={milestones} location={location} />

        {isEmpty ? (
          <View style={styles.empty}>
            <Text style={styles.emptyHeadline}>Nothing recorded yet.</Text>
            <Text style={styles.emptyBody}>
              Add a date that matters and TRACE works out the moon that hung over
              it, how uncommon that sky was, and the years it comes back.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {milestones.map((milestone, index) => (
              <MilestoneListRow
                key={milestone.id}
                milestone={milestone}
                index={index}
                isLast={index === milestones.length - 1}
              />
            ))}
          </View>
        )}

        <View style={styles.utility}>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => router.push(route("/age-converter"))}
          >
            <Text style={styles.utilityLink}>PLANETARY AGES</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => router.push(route("/settings"))}
          >
            <Text style={styles.utilityLink}>SETTINGS</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <TouchableOpacity
        style={[styles.newBar, { paddingBottom: insets.bottom || Spacing.md }]}
        accessibilityRole="button"
        accessibilityLabel="Add a new record"
        onPress={() => router.push(route("/milestone/new"))}
      >
        <Text style={styles.newBarText}>NEW RECORD</Text>
        <Text style={styles.newBarPlus}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.paper },
  content: {
    paddingHorizontal: Spacing.page,
    paddingBottom: Spacing.xxl,
  },

  masthead: { marginBottom: Spacing.xl },
  wordmark: {
    fontFamily: FontFamily.black,
    fontSize: FontSize.mega,
    letterSpacing: -3,
    lineHeight: 72,
    color: Colors.ink,
  },
  heavyRule: { height: 3, backgroundColor: Colors.ink, marginTop: Spacing.sm },
  mastheadMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginTop: Spacing.sm,
  },
  metaLabel: { ...Type.label },
  metaCount: {
    fontFamily: FontFamily.monoMedium,
    fontSize: FontSize.label,
    letterSpacing: Tracking.label,
    color: Colors.signal,
  },

  list: { borderTopWidth: 1, borderTopColor: Colors.rule },

  empty: {
    borderTopWidth: 1,
    borderTopColor: Colors.rule,
    paddingTop: Spacing.lg,
  },
  emptyHeadline: { ...Type.title },
  emptyBody: { ...Type.bodyMuted, marginTop: Spacing.md, maxWidth: 380 },

  utility: {
    flexDirection: "row",
    gap: Spacing.lg,
    marginTop: Spacing.xl,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.rule,
  },
  utilityLink: {
    fontFamily: FontFamily.monoMedium,
    fontSize: FontSize.label,
    letterSpacing: Tracking.label,
    color: Colors.inkMuted,
  },

  newBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: Colors.ink,
    paddingHorizontal: Spacing.page,
    paddingTop: Spacing.md,
  },
  newBarText: {
    fontFamily: FontFamily.monoMedium,
    fontSize: FontSize.small,
    letterSpacing: Tracking.label,
    color: Colors.paper,
  },
  newBarPlus: {
    fontFamily: FontFamily.regular,
    fontSize: 22,
    color: Colors.signal,
  },
});
