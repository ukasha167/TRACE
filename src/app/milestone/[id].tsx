import React, { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from "react-native";
import { useLocalSearchParams, router, type Href } from "expo-router";
import {
  Colors,
  Spacing,
  Type,
  FontFamily,
  FontSize,
  Radius,
  formatLongDate,
} from "@/constants/theme";
import { useMilestonesStore } from "@/store/useMilestonesStore";
import { getMoonPhase } from "@/lib/astronomy/moonPhase";
import { getMoonReturns } from "@/lib/astronomy/moonReturn";
import { getRarityStat } from "@/lib/astronomy/rarity";
import { getBrightLimbAngle } from "@/lib/astronomy/brightLimb";
import { toLocalNight, toLocalDayStart } from "@/lib/astronomy/dateUtils";
import { useApod } from "@/hooks/useApod";
import { Arrive } from "@/components/Arrive";
import { MoonSection } from "@/components/detail/MoonSection";
import { RaritySection } from "@/components/detail/RaritySection";
import { MoonReturnSection } from "@/components/detail/MoonReturnSection";
import { ApodCard } from "@/components/detail/ApodCard";

const route = (path: string) => path as Href;

const TYPE_LABELS: Record<string, string> = {
  birthday: "Birthday",
  anniversary: "Anniversary",
  graduation: "Graduation",
  custom: "Record",
};

/** Thresholds tried high-to-low; the first one the moon clears is the one shown. */
const RARITY_THRESHOLDS = [99.5, 99, 97, 95, 90];

/**
 * MILESTONE DETAIL. Spec §2.
 *
 * Order is the design. Recurrence leads, because that is the app's thesis; APOD
 * trails, because it is the one part that needs a network and the one part that
 * isn't specific to this person. Everything above the APOD card is local
 * computation, so the screen is complete offline.
 *
 * The masthead is a nameplate: the person's name set large in the serif, the
 * date beneath it, nothing else competing. It used to be the title in Archivo
 * Black over a 3px ink rule, which read as a magazine cover.
 */
export default function MilestoneDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const getMilestone = useMilestonesStore((s) => s.getMilestone);
  const deleteMilestone = useMilestonesStore((s) => s.deleteMilestone);
  const milestone = getMilestone(id);

  const tzOffsetMin = milestone?.location?.timezoneOffsetMin;

  const computed = useMemo(() => {
    if (!milestone) return null;

    // "That night" is local midnight ENDING the date, in the milestone's own
    // timezone where known, so a Lahore birthday stays a Lahore night no matter
    // where the phone is (spec §6.1).
    const night = toLocalNight(milestone.date, tzOffsetMin);
    const phase = getMoonPhase(night, toLocalDayStart(milestone.date, tzOffsetMin));

    const allReturns = getMoonReturns(milestone.date, { tzOffsetMin });
    const returns =
      milestone.type === "birthday"
        ? allReturns.filter((r) => r.age > 0) // no sky before the person existed
        : allReturns;

    // Only claim rarity when something uncommon actually happened.
    const threshold = RARITY_THRESHOLDS.find(
      (t) => phase.phaseFraction * 100 >= t
    );

    return {
      night,
      phase,
      returns,
      rarity:
        threshold !== undefined
          ? getRarityStat(milestone.date, threshold, { tzOffsetMin })
          : null,
      brightLimbAngleDeg:
        milestone.location && milestone.location.latitude !== 0
          ? getBrightLimbAngle(night, milestone.location)
          : null,
    };
  }, [milestone, tzOffsetMin]);

  const apod = useApod(milestone?.date ?? null);

  if (!milestone || !computed) {
    return (
      <View style={styles.root}>
        <Text style={styles.errorText}>Milestone not found.</Text>
      </View>
    );
  }

  const unitLabel =
    milestone.type === "birthday" ? "birthdays" : "anniversaries";

  const handleDelete = () => {
    Alert.alert(
      "Delete this record?",
      `"${milestone.title}" will be permanently removed.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteMilestone(milestone.id);
            router.back();
          },
        },
      ]
    );
  };

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Arrive>
          <View style={styles.masthead}>
            <View style={styles.kickerRow}>
              <Text style={styles.kicker}>{TYPE_LABELS[milestone.type]}</Text>
              <Pressable
                onPress={() =>
                  router.push(route(`/milestone/edit/${milestone.id}`))
                }
                accessibilityRole="button"
                accessibilityLabel={`Edit ${milestone.title}`}
                hitSlop={12}
              >
                <Text style={styles.editLink}>Edit</Text>
              </Pressable>
            </View>
            <Text style={styles.title}>{milestone.title}</Text>
            <Text style={styles.date}>{formatLongDate(milestone.date)}</Text>
            {milestone.notes ? (
              <Text style={styles.notes}>{milestone.notes}</Text>
            ) : null}
          </View>
        </Arrive>

        <Arrive index={1}>
          <MoonSection
            milestoneId={milestone.id}
            phase={computed.phase}
            brightLimbAngleDeg={computed.brightLimbAngleDeg}
            location={milestone.location}
          />
        </Arrive>

        {computed.rarity && (
          <Arrive index={2}>
            <RaritySection rarity={computed.rarity} unitLabel={unitLabel} />
          </Arrive>
        )}

        {computed.returns.length > 0 && (
          <Arrive index={3}>
            <MoonReturnSection returns={computed.returns} />
          </Arrive>
        )}

        <Arrive index={4}>
          <Pressable
            style={({ pressed }) => [styles.ledgerLink, pressed && styles.pressed]}
            onPress={() => router.push(route(`/ledger/${milestone.id}`))}
            accessibilityRole="button"
            accessibilityLabel="Open the life in skies ledger"
          >
            <View style={styles.ledgerCopy}>
              <Text style={styles.ledgerTitle}>Every year, one sky</Text>
              <Text style={styles.ledgerSub}>
                The moon over every one of your {unitLabel}
              </Text>
            </View>
            <Text style={styles.ledgerArrow}>→</Text>
          </Pressable>
        </Arrive>

        <ApodCard
          status={apod.status}
          data={
            apod.status === "success" || apod.status === "video"
              ? apod.data
              : null
          }
          error={apod.status === "error" ? apod.error : null}
          onRetry={apod.retry}
        />

        <Pressable
          style={({ pressed }) => [styles.exportButton, pressed && styles.pressed]}
          onPress={() => router.push(route(`/export/${milestone.id}`))}
          accessibilityRole="button"
          accessibilityLabel="Export a shareable card"
        >
          <Text style={styles.exportText}>Make a card</Text>
        </Pressable>

        <Pressable
          style={styles.deleteButton}
          onPress={handleDelete}
          accessibilityRole="button"
          accessibilityLabel="Delete this record"
        >
          <Text style={styles.deleteText}>Delete this record</Text>
        </Pressable>
      </ScrollView>
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
  errorText: { ...Type.body, padding: Spacing.page },
  pressed: { opacity: 0.6 },

  masthead: { marginBottom: Spacing.xl },
  kickerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  kicker: { ...Type.label },
  editLink: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.small,
    color: Colors.signal,
  },
  title: { ...Type.display, marginTop: Spacing.sm },
  date: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.small,
    color: Colors.signal,
    marginTop: Spacing.sm,
  },
  notes: { ...Type.bodyMuted, marginTop: Spacing.md },

  ledgerLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
    padding: Spacing.md,
    marginBottom: Spacing.xl,
    backgroundColor: Colors.paperDim,
    borderRadius: Radius.plate,
  },
  ledgerCopy: { flex: 1 },
  ledgerTitle: {
    fontFamily: FontFamily.serifMedium,
    fontSize: FontSize.lead,
    color: Colors.ink,
  },
  ledgerSub: { ...Type.small, marginTop: 2 },
  ledgerArrow: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.lead,
    color: Colors.signal,
  },

  exportButton: {
    backgroundColor: Colors.ink,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  exportText: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSize.body,
    color: Colors.paper,
  },
  deleteButton: { alignSelf: "center", paddingVertical: Spacing.lg },
  deleteText: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.small,
    color: Colors.danger,
  },
});
