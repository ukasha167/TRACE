import React, { useCallback, useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Alert,
  TextInput,
  PixelRatio,
  type LayoutChangeEvent,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useCanvasRef, ImageFormat } from "@shopify/react-native-skia";
import {
  Colors,
  FontFamily,
  FontSize,
  Spacing,
  Radius,
  Type,
  formatLongDate,
} from "@/constants/theme";
import { useMilestone } from "@/store/useMilestonesStore";
import {
  getMoonPhase,
  formatIllumination,
  describePhase,
} from "@/lib/astronomy/moonPhase";
import {
  getBrightLimbAngle,
  getLunarNorthRotation,
} from "@/lib/astronomy/brightLimb";
import { getMoonReturns } from "@/lib/astronomy/moonReturn";
import { toLocalNight, toLocalDayStart, todayDateString } from "@/lib/astronomy/dateUtils";
import { getNightFacts, headlineSentences, shortPlace } from "@/lib/astronomy/nightFacts";
import { daysBetween } from "@/lib/astronomy/anniversary";
import { ExportCardCanvas, CARD_SIZES, type CardFormat } from "@/components/ExportCardCanvas";
import { NightCardCanvas } from "@/components/NightCardCanvas";

type CardStyle = "night" | "paper";

export default function ExportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const milestone = useMilestone(id);

  const canvasRef = useCanvasRef();
  const [format, setFormat] = useState<CardFormat>("story");
  // Night leads: it was the pick from the prototype. Paper stays one tap away.
  const [style, setStyle] = useState<CardStyle>("night");
  const [dedication, setDedication] = useState("");
  const [exporting, setExporting] = useState(false);

  const { moonPhase, moonReturns, brightLimbAngleDeg, northAngleDeg, fact } = useMemo(() => {
    if (!milestone)
      return {
        moonPhase: null,
        moonReturns: null,
        brightLimbAngleDeg: null,
        northAngleDeg: null,
        fact: null,
      };
    const tz = milestone.location?.timezoneOffsetMin;
    const all = getMoonReturns(milestone.date, { tzOffsetMin: tz });
    const night = toLocalNight(milestone.date, tz);
    // A place stored without coordinates is not a place — spec §10.
    const place =
      milestone.location && milestone.location.latitude !== 0
        ? milestone.location
        : null;
    return {
      moonPhase: getMoonPhase(night, toLocalDayStart(milestone.date, tz)),
      brightLimbAngleDeg: place ? getBrightLimbAngle(night, place) : null,
      northAngleDeg: place ? getLunarNorthRotation(night, place) : null,
      moonReturns:
        milestone.type === "birthday" ? all.filter((r) => r.age > 0) : all,
      fact: place ? headlineSentences(getNightFacts(milestone.date, place, tz))[0] ?? null : null,
    };
  }, [milestone]);

  // The preview is sized from the space it actually gets, not from the screen
  // width. A story card is 9:16, so sizing on width alone made it 700pt tall in
  // a 500pt slot: it overflowed upward, hid the format selector, and ran under
  // the share button. Fit to whichever of the two dimensions binds.
  const [slot, setSlot] = useState<{ w: number; h: number } | null>(null);
  const onSlotLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSlot({ w: width, h: height });
  }, []);

  const handleExport = useCallback(async () => {
    if (!canvasRef.current) {
      Alert.alert("Not ready", "Canvas is still loading. Try again in a moment.");
      return;
    }
    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert("Sharing unavailable", "Sharing is not supported on this device.");
      return;
    }

    setExporting(true);
    try {
      // The canvas is laid out at the card's pixel size (see nativeWidth), so
      // its snapshot is the full 1080-wide card.
      const image = await canvasRef.current.makeImageSnapshotAsync();
      const base64Data = image.encodeToBase64(ImageFormat.PNG, 100);

      // Write to a temp file
      const filename = `trace-${milestone?.title?.replace(/\s+/g, "-").toLowerCase() ?? id}-${style}-${format}.png`;
      const fileUri = `${FileSystem.cacheDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Hand off to OS share sheet
      await Sharing.shareAsync(fileUri, {
        mimeType: "image/png",
        dialogTitle: `Share ${milestone?.title ?? "Cosmic Card"}`,
        UTI: "public.png",
      });
    } catch (err) {
      Alert.alert(
        "Export failed",
        err instanceof Error ? err.message : "Unknown error"
      );
    } finally {
      setExporting(false);
    }
  }, [canvasRef, milestone, format, style, id]);

  if (!milestone || !moonPhase || !moonReturns) {
    return (
      <View style={styles.root}>
        <Text style={styles.errorText}>Date not found.</Text>
      </View>
    );
  }

  const cardAspect = CARD_SIZES[format].h / CARD_SIZES[format].w;

  // The night card's words.
  const today = todayDateString();
  const md = milestone.date.slice(4);
  const ahead = moonReturns.filter((r) => daysBetween(`${r.year}${md}`, today) < 0).slice(0, 2);
  const returnsLine =
    ahead.length === 0
      ? null
      : `The moon comes back in ${ahead.map((r) => r.year).join(" and ")}.`;
  const loc = milestone.location && milestone.location.latitude !== 0 ? milestone.location : null;
  const coords = loc
    ? `${Math.abs(loc.latitude).toFixed(2)}° ${loc.latitude >= 0 ? "N" : "S"}, ${Math.abs(loc.longitude).toFixed(2)}° ${loc.longitude >= 0 ? "E" : "W"}`
    : null;
  const previewWidth = slot
    ? Math.floor(Math.min(slot.w, slot.h / cardAspect))
    : 0;
  // The card's width in points that lays out to exactly its pixel width.
  const nativeWidth = CARD_SIZES[format].w / PixelRatio.get();

  return (
    <View style={styles.root}>
      {/* ---- Style and format ---- */}
      <View style={styles.formatRow}>
        <Text style={styles.formatLabel}>Style</Text>
        <View style={styles.formatChips}>
          {(["night", "paper"] as CardStyle[]).map((st) => (
            <TouchableOpacity
              key={st}
              style={[styles.formatChip, style === st && styles.formatChipSelected]}
              onPress={() => setStyle(st)}
              accessibilityRole="radio"
              accessibilityState={{ checked: style === st }}
            >
              <Text style={[styles.formatChipText, style === st && styles.formatChipTextSelected]}>
                {st === "night" ? "Night" : "Paper"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={[styles.formatRow, styles.formatRowTight]}>
        <Text style={styles.formatLabel}>Format</Text>
        <View style={styles.formatChips}>
          {(["story", "square"] as CardFormat[]).map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.formatChip, format === f && styles.formatChipSelected]}
              onPress={() => setFormat(f)}
              accessibilityRole="radio"
              accessibilityState={{ checked: format === f }}
            >
              <Text
                style={[
                  styles.formatChipText,
                  format === f && styles.formatChipTextSelected,
                ]}
              >
                {f === "story" ? "Story · 9:16" : "Square · 1:1"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ---- Card preview ---- */}
      <View style={styles.previewWrapper} onLayout={onSlotLayout}>
        {previewWidth > 0 && (
          <View
            style={[
              styles.previewContainer,
              {
                width: previewWidth,
                height: previewWidth * cardAspect,
              },
            ]}
          >
            {/* THE CARD IS DRAWN AT ITS OWN SIZE and shrunk for the preview.
                The snapshot is the canvas's own pixels, so a canvas laid out at
                preview size exported a PNG about 730px wide on a 3x phone while
                the card promised 1080. Laid out at 1080 device pixels and
                scaled down as a view, it exports at 1080 on every screen. */}
            <View
              style={{
                width: nativeWidth,
                height: nativeWidth * cardAspect,
                transform: [{ scale: previewWidth / nativeWidth }],
                transformOrigin: "top left",
              }}
            >
            {style === "night" ? (
              <NightCardCanvas
                ref={canvasRef}
                title={milestone.title}
                whenWhere={`${formatLongDate(milestone.date)}${milestone.location ? ` · ${shortPlace(milestone.location.label)}` : ""}`}
                phaseLine={`${describePhase(moonPhase)}, ${formatIllumination(moonPhase.phaseFraction)} lit`}
                fact={fact}
                returns={returnsLine}
                dedication={dedication.trim() || null}
                coords={coords}
                moon={{
                  phaseFraction: moonPhase.phaseFraction,
                  waxing: moonPhase.waxing,
                  brightLimbAngleDeg,
                  northAngleDeg,
                }}
                format={format}
                previewWidth={nativeWidth}
              />
            ) : (
            <ExportCardCanvas
              ref={canvasRef}
              milestone={milestone}
              moonPhaseFraction={moonPhase.phaseFraction}
              moonWaxing={moonPhase.waxing}
              moonPhaseName={describePhase(moonPhase)}
              moonPhaseIllumination={formatIllumination(moonPhase.phaseFraction)}
              brightLimbAngleDeg={brightLimbAngleDeg}
              northAngleDeg={northAngleDeg}
              moonReturns={moonReturns}
              placeLabel={milestone.location?.label ?? null}
              format={format}
              previewWidth={nativeWidth}
            />
            )}
            </View>
          </View>
        )}
      </View>

      {style === "night" && (
        <View style={styles.dedicationRow}>
          <TextInput
            value={dedication}
            onChangeText={setDedication}
            placeholder="Add a line of your own, if you like"
            placeholderTextColor={Colors.inkMuted}
            style={styles.dedication}
            maxLength={90}
            multiline
            accessibilityLabel="A line of your own for the card"
          />
        </View>
      )}

      {/* ---- Export button ---- */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.exportButton, exporting && styles.exportButtonDisabled]}
          onPress={handleExport}
          disabled={exporting}
          accessibilityRole="button"
          accessibilityLabel="Share card"
        >
          {exporting ? (
            <ActivityIndicator color={Colors.paper} />
          ) : (
            <Text style={styles.exportButtonText}>Share this card</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => router.back()}
          accessibilityRole="button"
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.paper,
  },
  errorText: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.body,
    color: Colors.inkMuted,
    textAlign: "center",
    marginTop: Spacing.xxl,
  },

  // ---- Format selector ----
  formatRow: {
    paddingHorizontal: Spacing.page,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  formatLabel: { ...Type.label, width: 52 },
  formatRowTight: { paddingTop: 0 },
  dedicationRow: { paddingHorizontal: Spacing.page },
  dedication: {
    fontFamily: FontFamily.serif,
    fontSize: FontSize.body,
    color: Colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: Colors.rule,
    paddingVertical: Spacing.sm,
  },
  formatChips: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  formatChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.pill,
    backgroundColor: Colors.paperDim,
  },
  formatChipSelected: { backgroundColor: Colors.ink },
  formatChipText: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.small,
    color: Colors.inkMuted,
  },
  formatChipTextSelected: { color: Colors.paper },

  // ---- Preview ----
  previewWrapper: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.page,
  },
  previewContainer: {
    borderRadius: Radius.plate,
    overflow: "hidden",
    backgroundColor: Colors.paperDim,
  },

  // ---- APOD status ----

  // ---- Footer ----
  footer: {
    paddingHorizontal: Spacing.page,
    paddingVertical: Spacing.md,
    paddingBottom: Platform.OS === "ios" ? Spacing.xl : Spacing.md,
    gap: Spacing.sm,
  },
  exportButton: {
    backgroundColor: Colors.ink,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  exportButtonDisabled: {
    opacity: 0.5,
  },
  exportButtonText: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSize.body,
    color: Colors.paper,
  },
  cancelButton: {
    borderRadius: Radius.pill,
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  cancelButtonText: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.body,
    color: Colors.inkMuted,
  },
});
