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
import { getCachedApod } from "@/lib/apod/apodCache";
import { getMoonPhase, formatIllumination } from "@/lib/astronomy/moonPhase";
import { getLightTravelFact } from "@/lib/astronomy/lightTravel";
import { toLocalNoon } from "@/lib/astronomy/dateUtils";
import { useSettingsStore } from "@/store/useSettingsStore";
import { ExportCardCanvas, CARD_SIZES, type CardFormat } from "@/components/ExportCardCanvas";
import { useApod } from "@/hooks/useApod";

export default function ExportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width: screenWidth } = useWindowDimensions();

  const getMilestone = useMilestonesStore((s) => s.getMilestone);
  const distanceUnit = useSettingsStore((s) => s.distanceUnit);
  const milestone = getMilestone(id);

  const canvasRef = useCanvasRef();
  const [format, setFormat] = useState<CardFormat>("story");
  const [exporting, setExporting] = useState(false);

  // Use the same APOD hook so we get whatever is cached
  const apod = useApod(milestone?.date ?? null);
  const apodData = apod.status === "success" ? apod.data : null;

  const { moonPhase, lightFact } = useMemo(() => {
    if (!milestone) return { moonPhase: null, lightFact: null };
    const mDate = toLocalNoon(milestone.date);
    return {
      moonPhase: getMoonPhase(mDate),
      lightFact: getLightTravelFact(mDate, new Date(), distanceUnit),
    };
  }, [milestone, distanceUnit]);

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

  if (!milestone || !moonPhase || !lightFact) {
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
            apod={apodData}
            moonPhaseFraction={moonPhase.phaseFraction}
            moonPhaseIndex={moonPhase.phaseIndex}
            moonPhaseName={moonPhase.phaseName}
            moonPhaseIllumination={formatIllumination(moonPhase.phaseFraction)}
            lightSentence={lightFact.sentence}
            format={format}
            previewWidth={previewWidth}
          />
        </View>
      </View>

      {/* ---- APOD status note ---- */}
      {apod.status === "loading" && (
        <View style={styles.apodStatusRow}>
          <ActivityIndicator size="small" color={Colors.cyanotype} />
          <Text style={styles.apodStatusText}>Loading NASA image…</Text>
        </View>
      )}
      {(apod.status === "video" || apod.status === "error") && (
        <Text style={styles.apodStatusText}>
          {apod.status === "video"
            ? "This day's APOD is a video — card renders without image."
            : "APOD unavailable — card renders without image."}
        </Text>
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
            <ActivityIndicator color="#fff" />
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
    backgroundColor: Colors.blueprint,
  },
  errorText: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
    color: Colors.cyanotype,
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
    borderBottomColor: Colors.cyanotype + "22",
  },
  formatLabel: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.xs,
    color: Colors.cyanotype,
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
    borderColor: Colors.cyanotype + "44",
    backgroundColor: Colors.blueprintLight,
  },
  formatChipSelected: {
    borderColor: Colors.ember,
    backgroundColor: Colors.ember + "22",
  },
  formatChipText: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.sm,
    color: Colors.cyanotype,
  },
  formatChipTextSelected: {
    color: Colors.ember,
  },

  // ---- Preview ----
  previewWrapper: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
  },
  previewContainer: {
    borderRadius: Radius.md,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 16,
  },

  // ---- APOD status ----
  apodStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingBottom: Spacing.sm,
  },
  apodStatusText: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.xs,
    color: Colors.cyanotype,
    opacity: 0.6,
    textAlign: "center",
    paddingBottom: Spacing.sm,
  },

  // ---- Footer ----
  footer: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    paddingBottom: Platform.OS === "ios" ? Spacing.xl : Spacing.md,
    gap: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.cyanotype + "22",
  },
  exportButton: {
    backgroundColor: Colors.ember,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  exportButtonDisabled: {
    opacity: 0.5,
  },
  exportButtonText: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
    color: "#fff",
    letterSpacing: 0.3,
  },
  cancelButton: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.cyanotype + "44",
    paddingVertical: Spacing.sm + 4,
    alignItems: "center",
  },
  cancelButtonText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.md,
    color: Colors.cyanotype,
  },
});
