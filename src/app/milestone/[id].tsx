import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useLocalSearchParams, router, type Href } from "expo-router";
import {
  Colors,
  Spacing,
  Type,
  FontFamily,
  FontSize,
  Tracking,
} from "@/constants/theme";
import { useMilestonesStore } from "@/store/useMilestonesStore";
import { getMoonPhase } from "@/lib/astronomy/moonPhase";
import { getMoonReturns } from "@/lib/astronomy/moonReturn";
import { getRarityStat } from "@/lib/astronomy/rarity";
import { getBrightLimbAngle } from "@/lib/astronomy/brightLimb";
import { toLocalNight, toLocalDayStart } from "@/lib/astronomy/dateUtils";
import { useApod } from "@/hooks/useApod";
import { MoonSection } from "@/components/detail/MoonSection";
import { RaritySection } from "@/components/detail/RaritySection";
import { MoonReturnSection } from "@/components/detail/MoonReturnSection";
import { ApodCard } from "@/components/detail/ApodCard";
import { SkySection } from "@/components/detail/SkySection";

const route = (path: string) => path as Href;

const TYPE_LABELS: Record<string, string> = {
  birthday: "BIRTHDAY",
  anniversary: "ANNIVERSARY",
  graduation: "GRADUATION",
  custom: "RECORD",
};

/** Thresholds tried high-to-low; the first one the moon clears is the one shown. */
const RARITY_THRESHOLDS = [99.5, 99, 97, 95, 90];

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * MILESTONE DETAIL — spec §2.
 *
 * Order is the design. Recurrence leads, because that is the app's thesis; APOD
 * trails, because it is the one part that needs a network and the one part that
 * isn't specific to this person. Everything above the APOD card is local
 * computation, so the screen is complete offline.
 */
export default function MilestoneDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const getMilestone = useMilestonesStore((s) => s.getMilestone);
  const deleteMilestone = useMilestonesStore((s) => s.deleteMilestone);
  const milestone = getMilestone(id);

  const tzOffsetMin = milestone?.location?.timezoneOffsetMin;

  const computed = useMemo(() => {
    if (!milestone) return null;

    // "That night" — local midnight ENDING the date, in the milestone's own
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

  // Sections are numbered in the order they actually render, so an absent sky
  // or rarity block never leaves a gap in the sequence.
  const hasSky = milestone.location !== null && milestone.location.latitude !== 0;
  let section = 0;
  const nextSection = () => ++section;
  const skyN = hasSky ? nextSection() : 0;
  const moonN = nextSection();
  const rarityN = computed.rarity ? nextSection() : 0;
  const returnsN = computed.returns.length > 0 ? nextSection() : 0;
  const apodN = nextSection();

  const handleDelete = () => {
    Alert.alert(
      "Delete milestone?",
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
        <View style={styles.masthead}>
          <View style={styles.kickerRow}>
            <Text style={styles.kicker}>{TYPE_LABELS[milestone.type]}</Text>
            <TouchableOpacity
              onPress={() =>
                router.push(route(`/milestone/edit/${milestone.id}`))
              }
              accessibilityRole="button"
              accessibilityLabel={`Edit ${milestone.title}`}
              hitSlop={12}
            >
              <Text style={styles.editLink}>EDIT</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.title}>{milestone.title}</Text>
          <View style={styles.heavyRule} />
          <Text style={styles.date}>{formatDate(milestone.date)}</Text>
          {milestone.notes ? (
            <Text style={styles.notes}>{milestone.notes}</Text>
          ) : null}
        </View>

        {hasSky && (
          <SkySection
            n={skyN}
            milestoneId={milestone.id}
            date={computed.night}
            location={milestone.location!}
          />
        )}

        <MoonSection
          n={moonN}
          phase={computed.phase}
          brightLimbAngleDeg={computed.brightLimbAngleDeg}
          location={milestone.location}
        />

        {computed.rarity && (
          <RaritySection n={rarityN} rarity={computed.rarity} unitLabel={unitLabel} />
        )}

        {computed.returns.length > 0 && (
          <MoonReturnSection n={returnsN} returns={computed.returns} />
        )}

        <TouchableOpacity
          style={styles.ledgerLink}
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
          <Text style={styles.ledgerArrow}>&#8594;</Text>
        </TouchableOpacity>

        <ApodCard
          n={apodN}
          status={apod.status}
          data={
            apod.status === "success" || apod.status === "video"
              ? apod.data
              : null
          }
          error={apod.status === "error" ? apod.error : null}
          onRetry={apod.retry}
        />

        <TouchableOpacity
          style={styles.exportButton}
          onPress={() => router.push(route(`/export/${milestone.id}`))}
          accessibilityRole="button"
          accessibilityLabel="Export a shareable card"
        >
          <Text style={styles.exportText}>EXPORT CARD</Text>
          <Text style={styles.exportArrow}>&#8594;</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.deleteButton}
          onPress={handleDelete}
          accessibilityRole="button"
          accessibilityLabel="Delete this milestone"
        >
          <Text style={styles.deleteText}>DELETE RECORD</Text>
        </TouchableOpacity>
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

  masthead: { marginBottom: Spacing.xl },
  kickerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  kicker: { ...Type.label, color: Colors.signal },
  editLink: { ...Type.label, color: Colors.ink },
  title: {
    fontFamily: FontFamily.black,
    fontSize: FontSize.title,
    letterSpacing: Tracking.title,
    lineHeight: 40,
    color: Colors.ink,
    marginTop: Spacing.sm,
  },
  heavyRule: { height: 3, backgroundColor: Colors.ink, marginTop: Spacing.md },
  date: {
    fontFamily: FontFamily.monoMedium,
    fontSize: FontSize.small,
    color: Colors.ink,
    marginTop: Spacing.sm,
  },
  notes: { ...Type.bodyMuted, marginTop: Spacing.md },

  ledgerLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.xl,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.ink,
  },
  ledgerCopy: { flex: 1 },
  ledgerTitle: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSize.lead,
    letterSpacing: -0.2,
    color: Colors.ink,
  },
  ledgerSub: { ...Type.small, marginTop: 2 },
  ledgerArrow: {
    fontFamily: FontFamily.regular,
    fontSize: 22,
    color: Colors.signal,
  },

  exportButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: Colors.ink,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  exportText: {
    fontFamily: FontFamily.monoMedium,
    fontSize: FontSize.small,
    letterSpacing: Tracking.label,
    color: Colors.paper,
  },
  exportArrow: {
    fontFamily: FontFamily.regular,
    fontSize: 20,
    color: Colors.signal,
  },
  deleteButton: { alignSelf: "flex-start", paddingVertical: Spacing.lg },
  deleteText: { ...Type.label, color: Colors.signal },
});
