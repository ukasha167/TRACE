import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
} from "react-native";
import { useLocalSearchParams, router, type Href } from "expo-router";
import { Pencil, Share2 } from "lucide-react-native";
import {
  Colors,
  Spacing,
  Type,
  FontFamily,
  FontSize,
  Radius,
  formatLongDate,
} from "@/constants/theme";
import { useMilestone, useMilestonesStore } from "@/store/useMilestonesStore";
import { useRevealStore } from "@/store/useRevealStore";
import { getMoonPhase, syzygyFallsInDay } from "@/lib/astronomy/moonPhase";
import { RARITY_THRESHOLDS } from "@/lib/astronomy/revealLines";
import { placeOf } from "@/lib/astronomy/place";
import { TYPE_LABELS } from "@/lib/occasion";
import { getMoonReturns } from "@/lib/astronomy/moonReturn";
import { getRarityStat } from "@/lib/astronomy/rarity";
import { nightFactsFor, headlineSentences } from "@/lib/astronomy/nightFacts";
import { planetReturnsFor } from "@/lib/astronomy/planetReturns";
import {
  getBrightLimbAngle,
  getLunarNorthRotation,
} from "@/lib/astronomy/brightLimb";
import {
  toLocalNight,
  toLocalDayStart,
  todayDateString,
} from "@/lib/astronomy/dateUtils";
import { useOpenSky } from "@/hooks/useOpenSky";
import { useSkyPrewarm } from "@/hooks/useSkyPrewarm";
import { preloadCardFonts } from "@/components/cardFonts";
import { Arrive } from "@/components/Arrive";
import { MoonSection } from "@/components/detail/MoonSection";
import { ComingUpCard } from "@/components/detail/ComingUpCard";
import { MoonReturnSection } from "@/components/detail/MoonReturnSection";
import { DetailsFold } from "@/components/detail/DetailsFold";

const route = (path: string) => path as Href;


export default function MilestoneDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const deleteMilestone = useMilestonesStore((s) => s.deleteMilestone);
  // Subscribed, not read once. See useMilestone.
  const milestone = useMilestone(id);
  const { moonRef, openSky } = useOpenSky(id);
  useSkyPrewarm(milestone?.location ?? null, milestone?.date ?? null);
  // The share card's fonts, so it opens with its text rather than a blank card.
  useEffect(() => {
    const task = requestIdleCallback(preloadCardFonts);
    return () => cancelIdleCallback(task);
  }, []);

  const tzOffsetMin = milestone?.location?.timezoneOffsetMin;
  const today = todayDateString();

  const computed = useMemo(() => {
    if (!milestone) return null;

    // "That night" is local midnight ENDING the date, in the milestone's own
    // timezone where known (spec §6.1).
    const night = toLocalNight(milestone.date, tzOffsetMin);
    const base = getMoonPhase(night);
    // The syzygy scan runs here and nowhere else: this page alone says where
    // the exact full or new instant fell (describeSyzygyNote).
    const phase = {
      ...base,
      isTruePhase: syzygyFallsInDay(toLocalDayStart(milestone.date, tzOffsetMin), base.phaseIndex),
    };
    const place = placeOf(milestone.location);

    const allReturns = getMoonReturns(milestone.date, { tzOffsetMin });
    const returns =
      milestone.type === "birthday"
        ? allReturns.filter((r) => r.age > 0) // no sky before the person existed
        : allReturns;

    // Only claim rarity when something uncommon actually happened.
    const threshold = RARITY_THRESHOLDS.find((t) => phase.phaseFraction * 100 >= t);
    const facts = place ? nightFactsFor(milestone.date, place, tzOffsetMin) : null;
    const brightLimbAngleDeg = place ? getBrightLimbAngle(night, place) : null;
    const rarity =
      threshold !== undefined
        ? getRarityStat(milestone.date, threshold, { tzOffsetMin, today })
        : null;

    // Rarity lives in the fold. On the page it was a second big number under
    // the moon's own, and the return line already says why the night matters.
    const rows: { label: string; value: string }[] = [];
    if (rarity) {
      rows.push({
        label: "How uncommon",
        value: `1 in ${rarity.oneInN.toFixed(1)} days has a moon at least ${rarity.thresholdPct}% lit`,
      });
    }
    // A date still ahead has no anniversaries yet, and "0 of 0" says nothing.
    if (rarity && rarity.totalYears > 0) {
      rows.push({
        label: "On this date",
        value: `${rarity.matchingYears.length} of ${rarity.totalYears} years so far had one`,
      });
    }
    rows.push(...(facts?.rows ?? []));
    if (brightLimbAngleDeg != null) {
      rows.push({
        label: "Lit edge",
        value: `${Math.abs(brightLimbAngleDeg).toFixed(1)}° ${brightLimbAngleDeg >= 0 ? "left" : "right"} of straight up`,
      });
    }
    rows.push({ label: "Observed from", value: milestone.location?.label ?? "Not recorded" });
    if (place) {
      rows.push({ label: "Coordinates", value: `${place.latitude.toFixed(2)}, ${place.longitude.toFixed(2)}` });
    }
    if (tzOffsetMin != null) {
      const a = Math.abs(tzOffsetMin);
      const hm = `${Math.floor(a / 60)}${a % 60 ? `:${String(a % 60).padStart(2, "0")}` : ""}`;
      rows.push({ label: "Offset used for that night", value: `UTC${tzOffsetMin >= 0 ? "+" : "−"}${hm}` });
    }

    return {
      night,
      phase,
      place,
      returns,
      facts,
      rows,
      brightLimbAngleDeg,
      northAngleDeg: place ? getLunarNorthRotation(night, place) : null,
    };
  }, [milestone, tzOffsetMin, today]);

  const [showPlanets, setShowPlanets] = useState(false);
  const planets = useMemo(() => showPlanets && computed ? [
    planetReturnsFor("Jupiter", computed.night, new Date()),
    planetReturnsFor("Saturn", computed.night, new Date()),
  ] : [], [showPlanets, computed]);

  if (!milestone || !computed) {
    return (
      <View style={styles.root}>
        <Text style={styles.errorText}>Date not found.</Text>
      </View>
    );
  }

  const headline = computed.facts ? headlineSentences(computed.facts) : [];
  const handleDelete = () => {
    Alert.alert(
      "Delete this date?",
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
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Arrive>
          <View style={styles.masthead}>
            <View style={styles.kickerRow}>
              <Text style={styles.kicker}>{TYPE_LABELS[milestone.type]}</Text>
              <View style={styles.editRow}>
              <Pressable onPress={() => router.push(route(`/export/${milestone.id}`))} accessibilityRole="button" accessibilityLabel="Share this night" style={{ padding: Spacing.sm }}>
                <Share2 size={19} color={Colors.signal} />
              </Pressable>
              <Pressable
                onPress={() => router.push(route(`/milestone/edit/${milestone.id}`))}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${milestone.title}`}
                hitSlop={12}
              >
                <View style={styles.editRow}>
                  <Pencil size={13} color={Colors.signal} strokeWidth={2.2} />
                  <Text style={styles.editLink}>Edit</Text>
                </View>
              </Pressable>
              </View>
            </View>
            <Text style={styles.title}>{milestone.title}</Text>
            <Text style={styles.date}>{`Evening of ${formatLongDate(milestone.date)}`}</Text>
            {milestone.location ? (
              <Text style={styles.place}>{milestone.location.label}</Text>
            ) : null}
            {milestone.notes ? <Text style={styles.notes}>{milestone.notes}</Text> : null}
          </View>
        </Arrive>

        <Arrive index={1}>
          <MoonSection
            phase={computed.phase}
            brightLimbAngleDeg={computed.brightLimbAngleDeg}
            northAngleDeg={computed.northAngleDeg}
            moonRef={moonRef}
            onOpenSky={computed.place ? openSky : undefined}
          />
        </Arrive>

        <Arrive index={2}>
          <View style={styles.night}>
            {headline.length > 0 ? (
              <Text style={styles.headline}>{headline.join(" ")}</Text>
            ) : (
              <Pressable
                onPress={() => router.push(route(`/milestone/edit/${milestone.id}`))}
                accessibilityRole="button"
              >
                <Text style={styles.addPlace}>
                  Add where it was to see when the moon rose that night, how high it
                  climbed, and what it sat in front of.
                </Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => useRevealStore.getState().show(milestone.id)}
              accessibilityRole="button"
              hitSlop={8}
              style={styles.replay}
            >
              <Text style={styles.link}>Replay that night →</Text>
            </Pressable>
          </View>
        </Arrive>

        <Arrive index={3}>
          <ComingUpCard milestone={milestone} />
        </Arrive>

        <MoonReturnSection
          returns={computed.returns}
          planets={planets}
          onExpand={() => setShowPlanets(true)}
          sourceDate={milestone.date}
          today={today}
        />

        <Pressable style={({ pressed }) => [styles.skyLink, pressed && styles.pressed]}
          onPress={() => router.push(route(`/ledger/${milestone.id}`))} accessibilityRole="button">
          <Text style={styles.skyLinkText}>Every year, one moon</Text>
          <Text style={styles.arrow}>→</Text>
        </Pressable>

        <View style={styles.fold}>
          <DetailsFold rows={computed.rows} />
        </View>

        <Pressable
          style={styles.deleteButton}
          onPress={handleDelete}
          accessibilityRole="button"
          accessibilityLabel="Delete this date"
        >
          <Text style={styles.deleteText}>Delete this date</Text>
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
  section: { marginBottom: Spacing.xl },

  masthead: { marginBottom: Spacing.xl },
  kickerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  kicker: { ...Type.label },
  editRow: { flexDirection: "row", alignItems: "center", gap: 6 },
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
  place: { ...Type.small, marginTop: 2 },
  notes: { ...Type.bodyMuted, marginTop: Spacing.md },

  night: { marginBottom: Spacing.xl },
  headline: { ...Type.heading, lineHeight: 30 },
  addPlace: { ...Type.body, color: Colors.signal },
  replay: { alignSelf: "flex-start", marginTop: Spacing.md },
  link: { fontFamily: FontFamily.medium, fontSize: FontSize.small, color: Colors.signal },

  skyLink: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.paperDim,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.md,
    marginTop: Spacing.md,
  },
  skyLinkText: { fontFamily: FontFamily.semibold, fontSize: FontSize.body, color: Colors.ink },
  arrow: { fontFamily: FontFamily.regular, fontSize: FontSize.body, color: Colors.signal },

  fold: { marginTop: Spacing.xl },
  deleteButton: { alignSelf: "center", paddingVertical: Spacing.lg },
  deleteText: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.small,
    color: Colors.danger,
  },
});
