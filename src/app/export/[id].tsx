import React, { useCallback, useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Alert,
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
} from "@/constants/theme";
import { useMilestonesStore } from "@/store/useMilestonesStore";
import {
  getMoonPhase,
  formatIllumination,
  describePhase,
} from "@/lib/astronomy/moonPhase";
import { getBrightLimbAngle } from "@/lib/astronomy/brightLimb";
import { getMoonReturns } from "@/lib/astronomy/moonReturn";
import { toLocalNight, toLocalDayStart } from "@/lib/astronomy/dateUtils";
import { ExportCardCanvas, CARD_SIZES, type CardFormat } from "@/components/ExportCardCanvas";

export default function ExportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const getMilestone = useMilestonesStore((s) => s.getMilestone);
  const milestone = getMilestone(id);

  const canvasRef = useCanvasRef();
  const [format, setFormat] = useState<CardFormat>("story");
  const [exporting, setExporting] = useState(false);

  const { moonPhase, moonReturns, brightLimbAngleDeg } = useMemo(() => {
    if (!milestone)
      return { moonPhase: null, moonReturns: null, brightLimbAngleDeg: null };
    const tz = milestone.location?.timezoneOffsetMin;
    const all = getMoonReturns(milestone.date, { tzOffsetMin: tz });
    const night = toLocalNight(milestone.date, tz);
    return {
      moonPhase: getMoonPhase(night, toLocalDayStart(milestone.date, tz)),
      brightLimbAngleDeg:
        milestone.location && milestone.location.latitude !== 0
          ? getBrightLimbAngle(night, milestone.location)
          : null,
      moonReturns:
        milestone.type === "birthday" ? all.filter((r) => r.age > 0) : all,
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
      // Render the canvas at full resolution → PNG base64 directly via Skia C++
      const image = await canvasRef.current.makeImageSnapshotAsync();
      const base64Data = image.encodeToBase64(ImageFormat.PNG, 100);

      // Write to a temp file
      const filename = `trace-${milestone?.title?.replace(/\s+/g, "-").toLowerCase() ?? id}-${format}.png`;
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
  }, [canvasRef, milestone, format, id]);

  if (!milestone || !moonPhase || !moonReturns) {
    return (
      <View style={styles.root}>
        <Text style={styles.errorText}>Milestone not found.</Text>
      </View>
    );
  }

  const cardAspect = CARD_SIZES[format].h / CARD_SIZES[format].w;
  const previewWidth = slot
    ? Math.floor(Math.min(slot.w, slot.h / cardAspect))
    : 0;

  return (
    <View style={styles.root}>
      {/* ---- Format selector ---- */}
      <View style={styles.formatRow}>
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
            <ExportCardCanvas
              ref={canvasRef}
              milestone={milestone}
              moonPhaseFraction={moonPhase.phaseFraction}
              moonWaxing={moonPhase.waxing}
              moonPhaseName={describePhase(moonPhase)}
              moonPhaseIllumination={formatIllumination(moonPhase.phaseFraction)}
              brightLimbAngleDeg={brightLimbAngleDeg}
              moonReturns={moonReturns}
              placeLabel={milestone.location?.label ?? null}
              format={format}
              previewWidth={previewWidth}
            />
          </View>
        )}
      </View>

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
  formatLabel: { ...Type.label },
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
