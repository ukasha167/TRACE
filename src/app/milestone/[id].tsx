import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  useWindowDimensions,
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
import { getMoonPhase, formatIllumination } from "@/lib/astronomy/moonPhase";
import { getMoonReturns } from "@/lib/astronomy/moonReturn";
import { getRarityStat } from "@/lib/astronomy/rarity";
import { getNightFacts, headlineSentences, shortPlace } from "@/lib/astronomy/nightFacts";
import { getLifeLedger } from "@/lib/astronomy/lifeLedger";
import { planetReturns } from "@/lib/astronomy/planetReturns";
import { daysBetween } from "@/lib/astronomy/anniversary";
import {
  getBrightLimbAngle,
  getLunarNorthRotation,
} from "@/lib/astronomy/brightLimb";
import {
  toLocalNight,
  toLocalDayStart,
  todayDateString,
} from "@/lib/astronomy/dateUtils";
import { useApod } from "@/hooks/useApod";
import { Arrive } from "@/components/Arrive";
import { MoonGrid } from "@/components/MoonGrid";
import { SkyCanvas } from "@/components/SkyCanvas";
import { MoonSection } from "@/components/detail/MoonSection";
import { ComingUpCard } from "@/components/detail/ComingUpCard";
import { RaritySection } from "@/components/detail/RaritySection";
import { MoonReturnSection } from "@/components/detail/MoonReturnSection";
import { SectionHeader } from "@/components/detail/SectionHeader";
import { DetailsFold } from "@/components/detail/DetailsFold";
import { ApodCard } from "@/components/detail/ApodCard";

const route = (path: string) => path as Href;

const TYPE_LABELS: Record<string, string> = {
  birthday: "Birthday",
  anniversary: "Anniversary",
  graduation: "Graduation",
  custom: "A day to remember",
};

/** Thresholds tried high-to-low; the first one the moon clears is the one shown. */
const RARITY_THRESHOLDS = [99.5, 99, 97, 95, 90];

/**
 * MILESTONE DETAIL. Spec §2.
 *
 * ORDER IS THE DESIGN, and it changed. The page used to go moon, rarity,
 * returns, a link, NASA, with the night described by a tilt in degrees. Now it
 * goes: the name, the moon, what that night was like in a sentence or two, this
 * year's night with a bell, how uncommon it was, when it comes back, the whole
 * sky that night, every year's moon, NASA's picture, share. The instrument
 * readings are all still here, in a fold at the bottom, because rule 1 is that
 * anyone can check them.
 *
 * Everything above the NASA card is local computation, so the page is whole
 * offline.
 */
export default function MilestoneDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const deleteMilestone = useMilestonesStore((s) => s.deleteMilestone);
  // Subscribed, not read once. See useMilestone.
  const milestone = useMilestone(id);
  const { width } = useWindowDimensions();

  const tzOffsetMin = milestone?.location?.timezoneOffsetMin;
  const today = todayDateString();

  const computed = useMemo(() => {
    if (!milestone) return null;

    // "That night" is local midnight ENDING the date, in the milestone's own
    // timezone where known (spec §6.1).
    const night = toLocalNight(milestone.date, tzOffsetMin);
    const phase = getMoonPhase(night, toLocalDayStart(milestone.date, tzOffsetMin));

    // A place stored without coordinates is not a place, spec §10.
    const place =
      milestone.location && milestone.location.latitude !== 0
        ? milestone.location
        : null;

    const allReturns = getMoonReturns(milestone.date, { tzOffsetMin });
    const returns =
      milestone.type === "birthday"
        ? allReturns.filter((r) => r.age > 0) // no sky before the person existed
        : allReturns;

    // Only claim rarity when something uncommon actually happened.
    const threshold = RARITY_THRESHOLDS.find((t) => phase.phaseFraction * 100 >= t);
    const facts = place ? getNightFacts(milestone.date, place, tzOffsetMin) : null;
    const brightLimbAngleDeg = place ? getBrightLimbAngle(night, place) : null;


    const rows: { label: string; value: string }[] = [...(facts?.rows ?? [])];
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
      rarity:
        threshold !== undefined
          ? getRarityStat(milestone.date, threshold, { tzOffsetMin, today })
          : null,
      brightLimbAngleDeg,
      northAngleDeg: place ? getLunarNorthRotation(night, place) : null,
    };
  }, [milestone, tzOffsetMin, today]);

  // BELOW THE FOLD, AFTER THE FIRST FRAME. The strip of every year's moon and
  // the planet returns are the two slowest things on the page, together a few
  // hundred milliseconds under Hermes, and both sit well off the first screen.
  // Computed with the rest they held the screen's first frame, and the push
  // waits for that frame. The slide itself runs natively, so work started one
  // frame later does not stutter it.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const later = useMemo(() => {
    if (!settled || !milestone || !computed) return null;
    return {
      // Every anniversary so far, for the strip of moons.
      life: getLifeLedger(milestone.date, { location: milestone.location }).filter(
        (row) => daysBetween(row.date, today) >= 0
      ),
      // Jupiter and Saturn, geocentric, so "the same stars" means what it says.
      planets: [
        planetReturns("Jupiter", computed.night, new Date()),
        planetReturns("Saturn", computed.night, new Date()),
      ],
    };
  }, [settled, milestone, computed, today]);

  const apod = useApod(milestone?.date ?? null);

  if (!milestone || !computed) {
    return (
      <View style={styles.root}>
        <Text style={styles.errorText}>Record not found.</Text>
      </View>
    );
  }

  const unitLabel = milestone.type === "birthday" ? "birthdays" : "anniversaries";
  const headline = computed.facts ? headlineSentences(computed.facts) : [];
  const moon = {
    phaseFraction: computed.phase.phaseFraction,
    waxing: computed.phase.waxing,
    brightLimbAngleDeg: computed.brightLimbAngleDeg,
    northAngleDeg: computed.northAngleDeg,
  };

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

  const mapSize = width - Spacing.page * 2;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Arrive>
          <View style={styles.masthead}>
            <View style={styles.kickerRow}>
              <Text style={styles.kicker}>{TYPE_LABELS[milestone.type]}</Text>
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
            <Text style={styles.title}>{milestone.title}</Text>
            <Text style={styles.date}>{formatLongDate(milestone.date)}</Text>
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

        {computed.rarity && (
          <RaritySection rarity={computed.rarity} unitLabel={unitLabel} />
        )}

        <MoonReturnSection
          returns={computed.returns}
          sourceDate={milestone.date}
          today={today}
          planets={later?.planets ?? []}
        />

        {computed.place && (
          <View style={styles.section}>
            <SectionHeader label={`The sky over ${shortPlace(computed.place.label)} that night`} />
            <SkyCanvas
              date={computed.night}
              location={computed.place}
              size={mapSize}
              moon={moon}
              onPress={() => router.push(route(`/sky/${milestone.id}`))}
            />
            <Text style={styles.caption}>
              At midnight, looking straight up. North is at the top and east on the
              left, the way the sky looks from underneath. The moon is drawn far
              larger than it is so its phase shows.
            </Text>
            <Pressable
              style={({ pressed }) => [styles.skyLink, pressed && styles.pressed]}
              onPress={() => router.push(route(`/sky/${milestone.id}`))}
              accessibilityRole="button"
            >
              <Text style={styles.skyLinkText}>Stand under this sky</Text>
              <Text style={styles.arrow}>→</Text>
            </Pressable>
          </View>
        )}

        {later && later.life.length > 1 && (
          <View style={styles.section}>
            <SectionHeader label="Life in moons" />
            <Text style={styles.lifeLine}>
              The moon over every {formatLongDate(milestone.date).replace(/ \d{4}$/, "")} since{" "}
              {milestone.date.slice(0, 4)}.
            </Text>
            <View style={styles.lifePlate}>
              <MoonGrid
                width={mapSize - Spacing.md}
                columns={7}
                moonScale={0.66}
                cells={later.life.map((row) => ({
                  key: String(row.year),
                  label: String(row.year),
                  phaseFraction: row.phaseFraction,
                  waxing: row.waxing,
                  brightLimbAngleDeg: row.brightLimbAngleDeg,
                  northAngleDeg: row.northAngleDeg,
                  full: row.phaseFraction >= 0.99,
                  ring: row.isReturn,
                  accessibilityLabel: `${row.year}, ${formatIllumination(row.phaseFraction)} lit${row.isReturn ? ", a return" : ""}`,
                }))}
              />
            </View>
            <Pressable
              style={({ pressed }) => [styles.skyLink, pressed && styles.pressed]}
              onPress={() => router.push(route(`/ledger/${milestone.id}`))}
              accessibilityRole="button"
            >
              <Text style={styles.skyLinkText}>Every year, one moon</Text>
              <Text style={styles.arrow}>→</Text>
            </Pressable>
          </View>
        )}

        <ApodCard
          status={apod.status}
          data={apod.status === "success" || apod.status === "video" ? apod.data : null}
          error={apod.status === "error" ? apod.error : null}
          onRetry={apod.retry}
        />

        <Pressable
          style={({ pressed }) => [styles.exportButton, pressed && styles.pressed]}
          onPress={() => router.push(route(`/export/${milestone.id}`))}
          accessibilityRole="button"
          accessibilityLabel="Share this night as a card"
        >
          <View style={styles.editRow}>
            <Share2 size={17} color={Colors.paper} strokeWidth={2} />
            <Text style={styles.exportText}>Share this night</Text>
          </View>
        </Pressable>

        <View style={styles.fold}>
          <DetailsFold rows={computed.rows} />
        </View>

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

  caption: { ...Type.small, marginTop: Spacing.md },
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

  lifeLine: { ...Type.body, marginBottom: Spacing.md },
  lifePlate: {
    backgroundColor: Colors.space,
    borderRadius: Radius.plate,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.sm,
    overflow: "hidden",
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
  fold: { marginTop: Spacing.xl },
  deleteButton: { alignSelf: "center", paddingVertical: Spacing.lg },
  deleteText: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.small,
    color: Colors.danger,
  },
});
