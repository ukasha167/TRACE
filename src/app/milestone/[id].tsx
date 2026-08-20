import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, router, type Href } from "expo-router";
import { Colors, FontFamily, FontSize, Spacing, Radius } from "@/constants/theme";
import { useMilestonesStore } from "@/store/useMilestonesStore";
import { getMoonPhase, formatIllumination } from "@/lib/astronomy/moonPhase";
import {
  getAllPlanetaryAges,
  PLANET_ORDER,
  PLANET_DISPLAY,
} from "@/lib/astronomy/planetaryAge";
import { toLocalNoon } from "@/lib/astronomy/dateUtils";
import { MoonPhaseGlyph } from "@/components/MoonPhaseGlyph";
import { useApod } from "@/hooks/useApod";
import { getLightTravelFact } from "@/lib/astronomy/lightTravel";
import { useSettingsStore } from "@/store/useSettingsStore";

const route = (path: string) => path as Href;

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const TYPE_LABELS: Record<string, string> = {
  birthday: "🎂 Birthday",
  anniversary: "💫 Anniversary",
  graduation: "🎓 Graduation",
  custom: "✦ Custom",
};

// ---- APOD hero sub-components ----

function ApodHeroLoading() {
  return (
    <View style={heroStyles.placeholder}>
      <ActivityIndicator color={Colors.cyanotype} size="small" />
      <Text style={heroStyles.placeholderText}>Loading NASA image…</Text>
    </View>
  );
}

function ApodHeroVideo({ data }: { data: { title: string; url: string } }) {
  return (
    <View style={[heroStyles.placeholder, heroStyles.videoState]}>
      <Text style={heroStyles.videoIcon}>▶</Text>
      <Text style={heroStyles.videoLabel}>VIDEO DAY</Text>
      <Text style={heroStyles.videoTitle} numberOfLines={2}>{data.title}</Text>
      <Text style={heroStyles.videoSub}>
        This day's APOD is a video.{"\n"}Image cards not available for video days.
      </Text>
    </View>
  );
}

function ApodHeroError({
  errorType,
  retry,
}: {
  errorType: "network" | "not_found" | "rate_limit" | "server_error";
  retry: () => void;
}) {
  const messages: Record<typeof errorType, { icon: string; title: string; body: string }> = {
    not_found: {
      icon: "✦",
      title: "No image for this date",
      body: "NASA's APOD archive begins June 16, 1995. Some early dates have gaps.",
    },
    rate_limit: {
      icon: "⏱",
      title: "Rate limit reached",
      body: "The DEMO_KEY allows 30 requests/hour. Add your own key in Settings, or try again later.",
    },
    network: {
      icon: "⚡",
      title: "No connection",
      body: "The NASA image will load the next time you're online.",
    },
    server_error: {
      icon: "⚠",
      title: "NASA API error",
      body: "Something went wrong on NASA's end. Try again in a moment.",
    },
  };

  const msg = messages[errorType];

  return (
    <View style={[heroStyles.placeholder, heroStyles.errorState]}>
      <Text style={heroStyles.errorIcon}>{msg.icon}</Text>
      <Text style={heroStyles.errorTitle}>{msg.title}</Text>
      <Text style={heroStyles.errorBody}>{msg.body}</Text>
      {errorType !== "not_found" && (
        <TouchableOpacity
          style={heroStyles.retryButton}
          onPress={retry}
          accessibilityRole="button"
          accessibilityLabel="Retry loading NASA image"
        >
          <Text style={heroStyles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function ApodHeroImage({
  data,
}: {
  data: { url: string; title: string; copyright: string | null };
}) {
  return (
    <View style={heroStyles.imageContainer}>
      <Image
        source={{ uri: data.url }}
        style={heroStyles.image}
        contentFit="cover"
        transition={400}
        accessibilityLabel={data.title}
      />
      {/* No separate scrim — background lives on the caption itself */}
      <View style={heroStyles.imageCaption}>
        <Text style={heroStyles.imageCaptionTitle} numberOfLines={2}>
          {data.title}
        </Text>
        {data.copyright && (
          <Text style={heroStyles.imageCaptionCopyright}>
            © {data.copyright}
          </Text>
        )}
      </View>
    </View>
  );
}

// ---- Main screen ----

export default function MilestoneDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const getMilestone = useMilestonesStore((s) => s.getMilestone);
  const deleteMilestone = useMilestonesStore((s) => s.deleteMilestone);

  const milestone = getMilestone(id);

  const distanceUnit = useSettingsStore((s) => s.distanceUnit);

  const { moonPhase, planetaryAges, lightTravelFact } = useMemo(() => {
    if (!milestone) return { moonPhase: null, planetaryAges: null, lightTravelFact: null };
    const mDate = toLocalNoon(milestone.date);
    const today = new Date();
    return {
      moonPhase: getMoonPhase(mDate),
      planetaryAges: getAllPlanetaryAges(mDate, today),
      lightTravelFact: getLightTravelFact(mDate, today, distanceUnit),
    };
  }, [milestone, distanceUnit]);

  // APOD data — null date skips the hook entirely
  const apod = useApod(milestone?.date ?? null);

  if (!milestone || !moonPhase || !planetaryAges) {
    return (
      <View style={styles.root}>
        <Text style={styles.errorText}>Milestone not found.</Text>
      </View>
    );
  }

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
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ---- Header ---- */}
        <View style={styles.header}>
          <View style={styles.typeBadge}>
            <Text style={styles.typeBadgeText}>{TYPE_LABELS[milestone.type]}</Text>
          </View>
          <Text style={styles.title}>{milestone.title}</Text>
          <Text style={styles.dateText}>{formatDate(milestone.date)}</Text>
          {milestone.notes ? (
            <Text style={styles.notes}>{milestone.notes}</Text>
          ) : null}
        </View>

        {/* ---- APOD Hero ---- */}
        <View style={styles.heroWrapper}>
          <Text style={styles.sectionLabel}>ASTRONOMY PICTURE OF THE DAY</Text>
          {apod.status === "loading" || apod.status === "idle" ? (
            <ApodHeroLoading />
          ) : apod.status === "video" ? (
            <ApodHeroVideo data={apod.data} />
          ) : apod.status === "error" ? (
            <ApodHeroError errorType={apod.error.kind} retry={apod.retry} />
          ) : (
            <ApodHeroImage data={apod.data} />
          )}
        </View>

        {/* APOD explanation (only when image loaded) */}
        {apod.status === "success" && (
          <Text style={styles.apodExplanation} numberOfLines={6}>
            {apod.data.explanation}
          </Text>
        )}

        {/* ---- Moon Phase ---- */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>MOON PHASE</Text>
          <View style={styles.moonRow}>
            <MoonPhaseGlyph
              phaseFraction={moonPhase.phaseFraction}
              phaseIndex={moonPhase.phaseIndex}
              size={72}
            />
            <View style={styles.moonInfo}>
              <Text style={styles.moonPhaseName}>{moonPhase.phaseName}</Text>
              <Text style={styles.moonFraction}>
                {formatIllumination(moonPhase.phaseFraction)} illuminated
              </Text>
              <Text style={styles.moonAngleNote}>
                {milestone.location
                  ? `📍 ${milestone.location.label}`
                  : "Phase orientation available with location (Phase 8)"}
              </Text>
            </View>
          </View>
        </View>

        {/* ---- Planetary Ages ---- */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>PLANETARY AGES AT THIS DATE</Text>
          <Text style={styles.sectionSub}>Counted from {milestone.title}'s date to today</Text>
          <View style={styles.agesGrid}>
            {PLANET_ORDER.map((planet) => {
              const age = planetaryAges[planet];
              const display = PLANET_DISPLAY[planet];
              return (
                <View key={planet} style={styles.ageChip}>
                  <Text style={styles.ageChipSymbol}>{display.emoji}</Text>
                  <Text style={styles.ageChipPlanet}>{display.label}</Text>
                  <Text style={[styles.ageChipValue, { color: display.color }]}>
                    {age.toFixed(1)}
                  </Text>
                  <Text style={styles.ageChipUnit}>yrs</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* ---- Light-travel fact ---- */}
        {lightTravelFact && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>LIGHT-TRAVEL FACT</Text>
            <View style={styles.lightCard}>
              {/* Main sentence */}
              <Text style={styles.lightSentence}>{lightTravelFact.sentence}</Text>

              {/* Landmark detail row */}
              {lightTravelFact.landmark && (
                <View style={styles.lightLandmarkRow}>
                  <Text style={styles.lightLandmarkName}>
                    {lightTravelFact.landmark.name}
                  </Text>
                  <Text style={styles.lightLandmarkDist}>
                    {distanceUnit === "ly"
                      ? `${lightTravelFact.landmark.distanceLightYears < 1
                          ? `${(lightTravelFact.landmark.distanceLightYears * 365.25).toFixed(1)} ly-days`
                          : `${lightTravelFact.landmark.distanceLightYears.toLocaleString()} ly`}`
                      : `${(lightTravelFact.landmark.distanceLightYears * 9.4607e12).toExponential(2)} km`}
                  </Text>
                </View>
              )}

              {/* Alt-unit footnote */}
              <View style={styles.lightAltRow}>
                <Text style={styles.lightAltLabel}>
                  {distanceUnit === "ly" ? "IN KILOMETRES" : "IN LIGHT-YEARS"}
                </Text>
                <Text style={styles.lightAltValue}>
                  {distanceUnit === "ly"
                    ? `${(lightTravelFact.distanceKm / 1e12).toFixed(2)} trillion km`
                    : `${lightTravelFact.distanceLightYears < 1
                        ? `${(lightTravelFact.distanceLightYears * 365.25).toFixed(0)} light-days`
                        : `${lightTravelFact.distanceLightYears.toFixed(2)} ly`}`}
                </Text>
              </View>

              {/* Source note */}
              {lightTravelFact.landmark && (
                <Text style={styles.lightSourceNote} numberOfLines={2}>
                  {lightTravelFact.landmark.distanceUncertaintyNote}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* ---- Export placeholder ---- */}
        <TouchableOpacity style={styles.exportButton} disabled>
          <Text style={styles.exportButtonText}>Export Card — Phase 7</Text>
        </TouchableOpacity>

        {/* ---- Delete ---- */}
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={handleDelete}
          accessibilityRole="button"
        >
          <Text style={styles.deleteButtonText}>Delete Milestone</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

// ---- Hero styles ----
const heroStyles = StyleSheet.create({
  placeholder: {
    height: 200,
    borderRadius: Radius.md,
    backgroundColor: Colors.blueprintLight,
    borderWidth: 1,
    borderColor: Colors.cyanotype + "33",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    padding: Spacing.md,
  },
  placeholderText: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    color: Colors.cyanotype,
    opacity: 0.6,
  },
  videoState: {
    borderStyle: "solid",
    gap: Spacing.xs,
  },
  videoIcon: {
    fontSize: 28,
    color: Colors.cyanotype,
    opacity: 0.5,
  },
  videoLabel: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.xs,
    color: Colors.cyanotype,
    letterSpacing: 2,
    opacity: 0.5,
  },
  videoTitle: {
    fontFamily: FontFamily.displaySemiBold,
    fontSize: FontSize.lg,
    color: Colors.starlight,
    textAlign: "center",
    opacity: 0.8,
    marginTop: 2,
  },
  videoSub: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    color: Colors.cyanotype,
    textAlign: "center",
    opacity: 0.6,
    lineHeight: 18,
  },
  errorState: {
    borderStyle: "solid",
    gap: Spacing.sm,
  },
  errorIcon: {
    fontSize: 24,
    color: Colors.cyanotype,
    opacity: 0.4,
  },
  errorTitle: {
    fontFamily: FontFamily.displaySemiBold,
    fontSize: FontSize.lg,
    color: Colors.starlight,
    opacity: 0.8,
    textAlign: "center",
  },
  errorBody: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    color: Colors.cyanotype,
    textAlign: "center",
    lineHeight: 18,
    opacity: 0.7,
  },
  retryButton: {
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.ember + "88",
  },
  retryButtonText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    color: Colors.ember,
  },
  imageContainer: {
    height: 220,
    borderRadius: Radius.md,
    overflow: "hidden",
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  imageCaption: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    // Background lives here — only as tall as the text needs
    backgroundColor: Colors.blueprint + "CC",  // ~80% opacity
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    gap: 2,
  },
  imageCaptionTitle: {
    fontFamily: FontFamily.displaySemiBold,
    fontSize: FontSize.md,
    color: Colors.starlight,
    lineHeight: 20,
  },
  imageCaptionCopyright: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.xs,
    color: Colors.cyanotype,
    opacity: 0.7,
  },
});

// ---- Screen styles ----
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.blueprint,
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  errorText: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
    color: Colors.cyanotype,
    textAlign: "center",
    marginTop: Spacing.xxl,
  },

  // ---- Header ----
  header: {
    marginBottom: Spacing.lg,
  },
  typeBadge: {
    backgroundColor: Colors.blueprintLight,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: Colors.cyanotype + "44",
    marginBottom: Spacing.sm,
  },
  typeBadgeText: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.xs,
    color: Colors.cyanotype,
    letterSpacing: 0.5,
  },
  title: {
    fontFamily: FontFamily.displayBold,
    fontSize: FontSize.xxl,
    color: Colors.starlight,
    letterSpacing: -0.5,
    lineHeight: 34,
    marginBottom: Spacing.xs,
  },
  dateText: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.sm,
    color: Colors.cyanotype,
    marginBottom: Spacing.sm,
  },
  notes: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
    color: Colors.cyanotype,
    lineHeight: 22,
    opacity: 0.8,
  },

  // ---- APOD Hero wrapper ----
  heroWrapper: {
    marginBottom: Spacing.sm,
  },
  apodExplanation: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    color: Colors.cyanotype,
    lineHeight: 20,
    opacity: 0.75,
    marginBottom: Spacing.lg,
  },

  // ---- Sections ----
  section: {
    marginBottom: Spacing.lg,
  },
  sectionLabel: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.xs,
    color: Colors.cyanotype,
    letterSpacing: 2,
    marginBottom: Spacing.sm,
  },
  sectionSub: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    color: Colors.cyanotype,
    opacity: 0.6,
    marginTop: -Spacing.xs,
    marginBottom: Spacing.sm,
  },

  // ---- Moon Phase ----
  moonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg,
    backgroundColor: Colors.blueprintLight,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.cyanotype + "44",
    padding: Spacing.md,
  },
  moonInfo: {
    flex: 1,
    gap: Spacing.xs,
  },
  moonPhaseName: {
    fontFamily: FontFamily.displaySemiBold,
    fontSize: FontSize.xl,
    color: Colors.starlight,
    letterSpacing: -0.2,
  },
  moonFraction: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.md,
    color: Colors.starlight,
    opacity: 0.7,
  },
  moonAngleNote: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    color: Colors.cyanotype,
    opacity: 0.6,
    marginTop: 2,
  },

  // ---- Planetary Ages ----
  agesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  ageChip: {
    backgroundColor: Colors.blueprintLight,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.cyanotype + "44",
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    alignItems: "center",
    minWidth: "22%",
    flexGrow: 1,
    gap: 2,
  },
  ageChipSymbol: { fontSize: 20 },
  ageChipPlanet: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.xs,
    color: Colors.cyanotype,
    letterSpacing: 0.3,
  },
  ageChipValue: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.lg,
    letterSpacing: -0.5,
  },
  ageChipUnit: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.xs,
    color: Colors.cyanotype,
    opacity: 0.6,
  },

  // ---- Generic placeholder ----
  placeholder: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.blueprintLight,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.cyanotype + "33",
    borderStyle: "dashed",
    padding: Spacing.md,
    opacity: 0.5,
  },
  placeholderIcon: { fontSize: 20, color: Colors.starlight },
  placeholderText: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    color: Colors.cyanotype,
    flex: 1,
  },

  // ---- Light-travel card ----
  lightCard: {
    backgroundColor: Colors.blueprintLight,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.cyanotype + "44",
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  lightSentence: {
    fontFamily: FontFamily.displayItalic,
    fontSize: FontSize.lg,
    color: Colors.starlight,
    lineHeight: 26,
    letterSpacing: -0.2,
  },
  lightLandmarkRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.cyanotype + "33",
  },
  lightLandmarkName: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.sm,
    color: Colors.cyanotype,
    flex: 1,
  },
  lightLandmarkDist: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.sm,
    color: Colors.cyanotype,
    opacity: 0.7,
  },
  lightAltRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  lightAltLabel: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.xs,
    color: Colors.cyanotype,
    letterSpacing: 1.5,
    opacity: 0.5,
  },
  lightAltValue: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.xs,
    color: Colors.cyanotype,
    opacity: 0.6,
  },
  lightSourceNote: {
    fontFamily: FontFamily.mono,
    fontSize: 10,
    color: Colors.cyanotype,
    opacity: 0.4,
    lineHeight: 14,
  },

  // ---- Action buttons ----
  exportButton: {
    borderRadius: Radius.md,
    backgroundColor: Colors.cyanotype + "22",
    borderWidth: 1,
    borderColor: Colors.cyanotype + "44",
    borderStyle: "dashed",
    padding: Spacing.md,
    alignItems: "center",
    marginBottom: Spacing.sm,
    opacity: 0.5,
  },
  exportButtonText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.md,
    color: Colors.cyanotype,
  },
  deleteButton: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.ember + "55",
    padding: Spacing.md,
    alignItems: "center",
    marginTop: Spacing.sm,
  },
  deleteButtonText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.md,
    color: Colors.ember,
  },
});
