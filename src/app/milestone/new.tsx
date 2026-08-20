import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  KeyboardAvoidingView,
  Pressable,
  ActivityIndicator,
  Alert,
} from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { router } from "expo-router";
import * as Location from "expo-location";
import { MilestoneType, type MilestoneLocation } from "@/types";
import { Colors, FontFamily, FontSize, Spacing, Radius } from "@/constants/theme";
import { useMilestonesStore } from "@/store/useMilestonesStore";
import { toLocalNoon, toDateString } from "@/lib/astronomy/dateUtils";

// ---- Type selector config ----
const TYPES: Array<{ value: MilestoneType; label: string; symbol: string }> = [
  { value: "birthday",    label: "Birthday",    symbol: "🎂" },
  { value: "anniversary", label: "Anniversary", symbol: "💫" },
  { value: "graduation",  label: "Graduation",  symbol: "🎓" },
  { value: "custom",      label: "Custom",      symbol: "✦"  },
];

export default function NewMilestoneScreen() {
  const addMilestone = useMilestonesStore((s) => s.addMilestone);

  // Form state
  const [title, setTitle] = useState("");
  const [type, setType] = useState<MilestoneType>("birthday");
  const [date, setDate] = useState<Date>(toLocalNoon(toDateString(new Date())));
  const [notes, setNotes] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(Platform.OS === "ios");
  const [titleError, setTitleError] = useState(false);

  // Location state — always optional
  const [location, setLocation] = useState<MilestoneLocation | null>(null);
  const [manualLabel, setManualLabel] = useState("");
  const [locationMode, setLocationMode] = useState<"none" | "gps" | "manual">("none");
  const [gpsLoading, setGpsLoading] = useState(false);

  const formattedDate = date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const handleDateChange = useCallback(
    (_event: DateTimePickerEvent, selected?: Date) => {
      if (Platform.OS === "android") setShowDatePicker(false);
      if (selected) {
        setDate(toLocalNoon(toDateString(selected)));
      }
    },
    []
  );

  // GPS capture — requests permission, fetches coordinates, reverse-geocodes
  const handleUseGPS = useCallback(async () => {
    setGpsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Location permission denied",
          "The milestone will be saved without a location. You can type one manually instead.",
          [{ text: "OK" }]
        );
        setLocationMode("manual");
        return;
      }

      const coords = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      // Reverse geocode to a human-readable label
      let label = `${coords.coords.latitude.toFixed(4)}°, ${coords.coords.longitude.toFixed(4)}°`;
      try {
        const [geo] = await Location.reverseGeocodeAsync({
          latitude: coords.coords.latitude,
          longitude: coords.coords.longitude,
        });
        if (geo) {
          const parts = [geo.city, geo.region, geo.country].filter(Boolean);
          if (parts.length > 0) label = parts.join(", ");
        }
      } catch {
        // Reverse geocoding failure — fall back to coordinates
      }

      setLocation({
        latitude: coords.coords.latitude,
        longitude: coords.coords.longitude,
        label,
      });
      setLocationMode("gps");
    } catch (err) {
      Alert.alert("Could not get location", "Try entering it manually instead.");
      setLocationMode("manual");
    } finally {
      setGpsLoading(false);
    }
  }, []);

  // Manual text entry handler
  const handleManualLabelCommit = useCallback(() => {
    const trimmed = manualLabel.trim();
    if (!trimmed) {
      setLocation(null);
      return;
    }
    // Without actual coordinates, set lat/lng to 0 — angle rendering won't fire
    // but the label is stored for display. Spec §10 says GPS is the only coord source.
    setLocation({ latitude: 0, longitude: 0, label: trimmed });
  }, [manualLabel]);

  const handleClearLocation = useCallback(() => {
    setLocation(null);
    setManualLabel("");
    setLocationMode("none");
  }, []);

  const handleSave = useCallback(() => {
    if (!title.trim()) {
      setTitleError(true);
      return;
    }
    // Only pass location if we have real coordinates (GPS), not manual-only text
    const finalLocation = location && location.latitude !== 0 ? location : null;
    addMilestone({
      title: title.trim(),
      type,
      date: toDateString(date),
      notes: notes.trim() || undefined,
      location: finalLocation,
    });
    router.back();
  }, [title, type, date, notes, location, addMilestone]);

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ---- Title ---- */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>TITLE</Text>
          <TextInput
            style={[styles.textInput, titleError && styles.textInputError]}
            value={title}
            onChangeText={(t) => {
              setTitle(t);
              if (titleError && t.trim()) setTitleError(false);
            }}
            placeholder="e.g. My Birthday"
            placeholderTextColor={Colors.cyanotype + "88"}
            selectionColor={Colors.ember}
            returnKeyType="next"
            autoFocus
            maxLength={80}
            accessibilityLabel="Milestone title"
          />
          {titleError && (
            <Text style={styles.errorText}>A title is required.</Text>
          )}
        </View>

        {/* ---- Type selector ---- */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>TYPE</Text>
          <View style={styles.typeGrid}>
            {TYPES.map((t) => (
              <Pressable
                key={t.value}
                style={[styles.typeChip, type === t.value && styles.typeChipSelected]}
                onPress={() => setType(t.value)}
                accessibilityRole="radio"
                accessibilityState={{ checked: type === t.value }}
                accessibilityLabel={t.label}
              >
                <Text style={styles.typeChipSymbol}>{t.symbol}</Text>
                <Text
                  style={[
                    styles.typeChipLabel,
                    type === t.value && styles.typeChipLabelSelected,
                  ]}
                >
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* ---- Date ---- */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>DATE</Text>
          <View style={styles.dateCard}>
            {Platform.OS === "android" && (
              <TouchableOpacity
                style={styles.androidDateTrigger}
                onPress={() => setShowDatePicker(true)}
                accessibilityRole="button"
                accessibilityLabel="Choose date"
              >
                <Text style={styles.androidDateValue}>{formattedDate}</Text>
                <Text style={styles.androidDateIcon}>📅</Text>
              </TouchableOpacity>
            )}
            {showDatePicker && (
              <DateTimePicker
                value={date}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={handleDateChange}
                maximumDate={new Date(2100, 11, 31)}
                minimumDate={new Date(1800, 0, 1)}
                style={Platform.OS === "ios" ? styles.iosPicker : undefined}
                themeVariant="dark"
              />
            )}
          </View>
        </View>

        {/* ---- Notes (optional) ---- */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>
            NOTES <Text style={styles.optionalTag}>(optional)</Text>
          </Text>
          <TextInput
            style={[styles.textInput, styles.notesInput]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Any memory or context to attach..."
            placeholderTextColor={Colors.cyanotype + "88"}
            selectionColor={Colors.ember}
            multiline
            maxLength={500}
            textAlignVertical="top"
            accessibilityLabel="Optional notes"
          />
        </View>

        {/* ---- Location (optional) ---- */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>
            LOCATION <Text style={styles.optionalTag}>(optional)</Text>
          </Text>
          <Text style={styles.fieldHint}>
            Enables tilt-corrected moon orientation for this milestone's sky view.
          </Text>

          {/* Confirmed location display */}
          {location && location.latitude !== 0 && (
            <View style={styles.locationConfirmed}>
              <Text style={styles.locationConfirmedLabel}>📍 {location.label}</Text>
              <Text style={styles.locationCoords}>
                {location.latitude.toFixed(4)}°, {location.longitude.toFixed(4)}°
              </Text>
              <TouchableOpacity onPress={handleClearLocation} style={styles.locationClearBtn}>
                <Text style={styles.locationClearText}>Clear</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Manual label only (no coords) */}
          {location && location.latitude === 0 && (
            <View style={styles.locationConfirmed}>
              <Text style={styles.locationConfirmedLabel}>📍 {location.label}</Text>
              <Text style={styles.locationManualNote}>
                Manual entry — moon orientation unavailable without coordinates.
              </Text>
              <TouchableOpacity onPress={handleClearLocation} style={styles.locationClearBtn}>
                <Text style={styles.locationClearText}>Clear</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Action buttons when no location set yet */}
          {!location && locationMode === "none" && (
            <View style={styles.locationActions}>
              <TouchableOpacity
                style={styles.locationGpsButton}
                onPress={handleUseGPS}
                disabled={gpsLoading}
                accessibilityRole="button"
                accessibilityLabel="Use current GPS location"
              >
                {gpsLoading ? (
                  <ActivityIndicator size="small" color={Colors.starlight} />
                ) : (
                  <Text style={styles.locationGpsText}>📍 Use Current Location</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.locationManualButton}
                onPress={() => setLocationMode("manual")}
                accessibilityRole="button"
              >
                <Text style={styles.locationManualText}>Enter manually</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Manual text input */}
          {!location && locationMode === "manual" && (
            <View style={styles.locationManualInput}>
              <TextInput
                style={styles.textInput}
                value={manualLabel}
                onChangeText={setManualLabel}
                placeholder="e.g. Lahore, Pakistan"
                placeholderTextColor={Colors.cyanotype + "88"}
                selectionColor={Colors.ember}
                returnKeyType="done"
                onSubmitEditing={handleManualLabelCommit}
                onBlur={handleManualLabelCommit}
                autoFocus
                accessibilityLabel="Location label"
              />
              <TouchableOpacity
                onPress={() => setLocationMode("none")}
                style={styles.locationClearBtn}
              >
                <Text style={styles.locationClearText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>

      {/* ---- Sticky Save footer ---- */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.saveButton, !title.trim() && styles.saveButtonDisabled]}
          onPress={handleSave}
          accessibilityRole="button"
          accessibilityLabel="Save milestone"
        >
          <Text style={styles.saveButtonText}>Save Milestone</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.blueprint,
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    paddingBottom: 120,
  },

  // ---- Field groups ----
  fieldGroup: {
    marginBottom: Spacing.lg,
  },
  fieldLabel: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.xs,
    color: Colors.cyanotype,
    letterSpacing: 2,
    marginBottom: Spacing.sm,
  },
  optionalTag: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.xs,
    color: Colors.cyanotype,
    opacity: 0.5,
    letterSpacing: 0,
  },

  // ---- Text inputs ----
  textInput: {
    backgroundColor: Colors.blueprintLight,
    borderWidth: 1,
    borderColor: Colors.cyanotype + "44",
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 4,
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
    color: Colors.starlight,
  },
  textInputError: {
    borderColor: Colors.ember,
  },
  notesInput: {
    minHeight: 88,
    paddingTop: Spacing.sm + 4,
  },
  errorText: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    color: Colors.ember,
    marginTop: Spacing.xs,
  },

  // ---- Type selector ----
  typeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.cyanotype + "55",
    backgroundColor: Colors.blueprintLight,
  },
  typeChipSelected: {
    borderColor: Colors.ember,
    backgroundColor: Colors.ember + "22",
  },
  typeChipSymbol: {
    fontSize: 16,
  },
  typeChipLabel: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    color: Colors.cyanotype,
  },
  typeChipLabelSelected: {
    color: Colors.ember,
  },

  // ---- Date picker ----
  dateCard: {
    backgroundColor: Colors.blueprintLight,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.cyanotype + "44",
    overflow: "hidden",
  },
  iosPicker: {
    width: "100%",
  },
  androidDateTrigger: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 4,
  },
  androidDateValue: {
    fontFamily: FontFamily.displaySemiBold,
    fontSize: FontSize.lg,
    color: Colors.starlight,
  },
  androidDateIcon: {
    fontSize: 20,
  },

  // ---- Location field ----
  fieldHint: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    color: Colors.cyanotype,
    opacity: 0.7,
    lineHeight: 18,
    marginBottom: Spacing.sm,
  },
  locationActions: {
    gap: Spacing.sm,
  },
  locationGpsButton: {
    backgroundColor: Colors.blueprintLight,
    borderWidth: 1,
    borderColor: Colors.ember + "66",
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm + 4,
    alignItems: "center",
  },
  locationGpsText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.md,
    color: Colors.ember,
  },
  locationManualButton: {
    paddingVertical: Spacing.xs,
    alignItems: "center",
  },
  locationManualText: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    color: Colors.cyanotype,
    opacity: 0.7,
    textDecorationLine: "underline",
  },
  locationConfirmed: {
    backgroundColor: Colors.blueprintLight,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.cyanotype + "44",
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  locationConfirmedLabel: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    color: Colors.starlight,
  },
  locationCoords: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.sm,
    color: Colors.cyanotype,
    opacity: 0.7,
  },
  locationManualNote: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.xs,
    color: Colors.cyanotype,
    opacity: 0.6,
    lineHeight: 16,
  },
  locationManualInput: {
    gap: Spacing.xs,
  },
  locationClearBtn: {
    alignSelf: "flex-start",
    marginTop: 2,
  },
  locationClearText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    color: Colors.ember,
    opacity: 0.8,
  },

  // ---- Footer ----
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    paddingBottom: Platform.OS === "ios" ? Spacing.xl : Spacing.md,
    backgroundColor: Colors.blueprint,
    borderTopWidth: 1,
    borderTopColor: Colors.cyanotype + "33",
  },
  cancelButton: {
    flex: 1,
    paddingVertical: Spacing.sm + 4,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.cyanotype + "55",
    alignItems: "center",
  },
  cancelButtonText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.md,
    color: Colors.cyanotype,
  },
  saveButton: {
    flex: 2,
    paddingVertical: Spacing.sm + 4,
    borderRadius: Radius.sm,
    backgroundColor: Colors.ember,
    alignItems: "center",
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.md,
    color: "#fff",
  },
});
