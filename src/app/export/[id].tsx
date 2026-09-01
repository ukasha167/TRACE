import React, { useRef, useCallback, useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
  Alert,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useCanvasRef } from "@shopify/react-native-skia";
import { Colors, FontFamily, FontSize, Spacing, Radius } from "@/constants/theme";
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
  const { width: screenWidth } = useWindowDimensions();

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

  // Preview fits the screen with some horizontal padding
  const previewPad = Spacing.lg * 2;
  const previewWidth = screenWidth - previewPad;

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
      // Render the canvas at full resolution → PNG bytes
      const image = await canvasRef.current.makeImageSnapshotAsync();
      const pngBytes = image.encodeToBytes(); // Uint8Array

      // Write to a temp file
      const filename = `trace-${milestone?.title?.replace(/\s+/g, "-").toLowerCase() ?? id}-${format}.png`;
      const fileUri = `${FileSystem.cacheDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(
        fileUri,
        // Convert Uint8Array to base64
        uint8ArrayToBase64(pngBytes),
        { encoding: FileSystem.EncodingType.Base64 }
      );

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

  return (
    <View style={styles.root}>
      {/* ---- Format selector ---- */}
      <View style={styles.formatRow}>
        <Text style={styles.formatLabel}>FORMAT</Text>
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
                {f === "story" ? "Story  9:16" : "Square  1:1"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ---- Card preview ---- */}
      <View style={styles.previewWrapper}>
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
            moonPhaseIndex={moonPhase.phaseIndex}
            moonPhaseName={describePhase(moonPhase)}
            moonPhaseIllumination={formatIllumination(moonPhase.phaseFraction)}
            brightLimbAngleDeg={brightLimbAngleDeg}
            moonReturns={moonReturns}
            format={format}
            previewWidth={previewWidth}
          />
        </View>
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
            <Text style={styles.exportButtonText}>Share Card</Text>
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

// ---- base64 helper (Uint8Array → string without btoa which is unavailable in RN) ----
function uint8ArrayToBase64(bytes: Uint8Array): string {
  const CHUNK = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
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
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.inkMuted + "22",
  },
  formatLabel: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.label,
    color: Colors.inkMuted,
    letterSpacing: 2,
  },
  formatChips: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  formatChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.inkMuted + "44",
    backgroundColor: Colors.rule,
  },
  formatChipSelected: {
    borderColor: Colors.signal,
    backgroundColor: Colors.signal + "22",
  },
  formatChipText: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.small,
    color: Colors.inkMuted,
  },
  formatChipTextSelected: {
    color: Colors.signal,
  },

  // ---- Preview ----
  previewWrapper: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
  },
  previewContainer: {
    borderRadius: Radius.plate,
    overflow: "hidden",
  },

  // ---- APOD status ----

  // ---- Footer ----
  footer: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    paddingBottom: Platform.OS === "ios" ? Spacing.xl : Spacing.md,
    gap: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.inkMuted + "22",
  },
  exportButton: {
    backgroundColor: Colors.signal,
    borderRadius: Radius.plate,
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  exportButtonDisabled: {
    opacity: 0.5,
  },
  exportButtonText: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.body,
    color: Colors.paper,
    letterSpacing: 0.3,
  },
  cancelButton: {
    borderRadius: Radius.plate,
    borderWidth: 1,
    borderColor: Colors.inkMuted + "44",
    paddingVertical: Spacing.sm + 4,
    alignItems: "center",
  },
  cancelButtonText: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.body,
    color: Colors.inkMuted,
  },
});
