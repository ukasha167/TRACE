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
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import * as Location from "expo-location";
import {
  MilestoneType,
  type Milestone,
  type MilestoneLocation,
} from "@/types";
import {
  Colors,
  Spacing,
  Type,
  FontFamily,
  FontSize,
  Tracking,
} from "@/constants/theme";
import {
  toLocalNoon,
  toDateString,
  approximateTimezoneOffsetMin,
} from "@/lib/astronomy/dateUtils";

/**
 * The record form, shared by create and edit.
 *
 * Both routes render THIS — a second copy for editing would drift from the
 * original within a change or two, and the location handling in particular is
 * too easy to get subtly wrong twice (see the lat/lng-0 bug that made typed
 * places useless for historical dates).
 *
 * No pictograms. Swiss form conventions: labels are small uppercase mono, inputs
 * are underlined rather than boxed, and the selected chip is an ink fill. The
 * emoji that used to sit on the type chips were the single most generic element
 * in the app and rendered as tofu on some devices besides.
 */

export interface MilestoneFormValues {
  title: string;
  type: MilestoneType;
  date: string;
  notes?: string;
  location: MilestoneLocation | null;
}

interface MilestoneFormProps {
  /** Present when editing; absent when creating. */
  initial?: Milestone;
  submitLabel: string;
  onSubmit: (values: MilestoneFormValues) => void;
  onCancel: () => void;
}

const TYPES: Array<{ value: MilestoneType; label: string }> = [
  { value: "birthday", label: "BIRTHDAY" },
  { value: "anniversary", label: "ANNIVERSARY" },
  { value: "graduation", label: "GRADUATION" },
  { value: "custom", label: "RECORD" },
];

export function MilestoneForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: MilestoneFormProps) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [type, setType] = useState<MilestoneType>(initial?.type ?? "birthday");
  const [date, setDate] = useState<Date>(
    toLocalNoon(initial?.date ?? toDateString(new Date()))
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [showDatePicker, setShowDatePicker] = useState(Platform.OS === "ios");
  const [titleError, setTitleError] = useState(false);

  const [location, setLocation] = useState<MilestoneLocation | null>(
    initial?.location ?? null
  );
  // Seeded from the saved label so an edit doesn't look like the location was lost.
  const [placeQuery, setPlaceQuery] = useState(initial?.location?.label ?? "");
  const [busy, setBusy] = useState<null | "gps" | "lookup">(null);
  const [lookupFailed, setLookupFailed] = useState(false);

  const formattedDate = date.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const handleDateChange = useCallback(
    (_event: DateTimePickerEvent, selected?: Date) => {
      if (Platform.OS === "android") setShowDatePicker(false);
      if (selected) setDate(toLocalNoon(toDateString(selected)));
    },
    []
  );

  const commitLocation = (
    latitude: number,
    longitude: number,
    label: string
  ) => {
    setLocation({
      latitude,
      longitude,
      label,
      // Approximated from longitude — see approximateTimezoneOffsetMin.
      timezoneOffsetMin: approximateTimezoneOffsetMin(longitude),
    });
    setLookupFailed(false);
  };

  const handleUseGPS = useCallback(async () => {
    setBusy("gps");
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Location permission denied",
          "You can type a place instead, or save without one — everything except the sky view still works."
        );
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = pos.coords;

      let label = `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`;
      try {
        const [geo] = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (geo) {
          const parts = [geo.city, geo.region, geo.country].filter(Boolean);
          if (parts.length) label = parts.join(", ");
        }
      } catch {
        // Reverse geocoding is a nicety; coordinates are the payload.
      }
      commitLocation(latitude, longitude, label);
      setPlaceQuery(label);
    } catch {
      Alert.alert("Could not read location", "Try typing the place instead.");
    } finally {
      setBusy(null);
    }
  }, []);

  /**
   * Resolves typed text to real coordinates.
   *
   * This is what makes location useful for HISTORICAL dates, which is nearly
   * all of them. GPS only ever describes where you are standing now; a birthday
   * from 2004 needs the place it happened. An earlier version stored typed
   * places with latitude/longitude 0, which silently disabled the sky render
   * and the moon tilt for exactly the records that most needed them.
   */
  const handleLookupPlace = useCallback(async () => {
    const q = placeQuery.trim();
    if (!q) return;
    setBusy("lookup");
    setLookupFailed(false);
    try {
      const results = await Location.geocodeAsync(q);
      if (!results.length) {
        setLookupFailed(true);
        setLocation(null);
        return;
      }
      const { latitude, longitude } = results[0];
      commitLocation(latitude, longitude, q);
    } catch {
      setLookupFailed(true);
      setLocation(null);
    } finally {
      setBusy(null);
    }
  }, [placeQuery]);

  const handleSave = useCallback(() => {
    if (!title.trim()) {
      setTitleError(true);
      return;
    }
    onSubmit({
      title: title.trim(),
      type,
      date: toDateString(date),
      notes: notes.trim() || undefined,
      location,
    });
  }, [title, type, date, notes, location, onSubmit]);

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ---- Title ---- */}
        <Text style={styles.label}>TITLE</Text>
        <TextInput
          style={[styles.input, titleError && styles.inputError]}
          value={title}
          onChangeText={(t) => {
            setTitle(t);
            if (titleError && t.trim()) setTitleError(false);
          }}
          placeholder="Name this record"
          placeholderTextColor={Colors.inkMuted}
          selectionColor={Colors.signal}
          returnKeyType="next"
          maxLength={80}
          accessibilityLabel="Record title"
        />
        {titleError && <Text style={styles.error}>A title is required.</Text>}

        {/* ---- Type ---- */}
        <Text style={[styles.label, styles.spaced]}>TYPE</Text>
        <View style={styles.chips}>
          {TYPES.map((t) => {
            const selected = type === t.value;
            return (
              <Pressable
                key={t.value}
                style={[styles.chip, selected && styles.chipOn]}
                onPress={() => setType(t.value)}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
              >
                <Text style={[styles.chipText, selected && styles.chipTextOn]}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* ---- Date ---- */}
        <Text style={[styles.label, styles.spaced]}>DATE</Text>
        {Platform.OS === "android" && (
          <TouchableOpacity
            onPress={() => setShowDatePicker(true)}
            accessibilityRole="button"
          >
            <Text style={styles.dateValue}>{formattedDate}</Text>
          </TouchableOpacity>
        )}
        {(showDatePicker || Platform.OS === "ios") && (
          <View style={styles.pickerWrap}>
            <DateTimePicker
              value={date}
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={handleDateChange}
              maximumDate={new Date(2100, 11, 31)}
              minimumDate={new Date(1900, 0, 1)}
              themeVariant="light"
              accentColor={Colors.signal}
            />
          </View>
        )}

        {/* ---- Notes ---- */}
        <Text style={[styles.label, styles.spaced]}>NOTES · OPTIONAL</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Anything worth remembering"
          placeholderTextColor={Colors.inkMuted}
          selectionColor={Colors.signal}
          multiline
          maxLength={400}
          accessibilityLabel="Notes"
        />

        {/* ---- Location ---- */}
        <Text style={[styles.label, styles.spaced]}>LOCATION · OPTIONAL</Text>
        <Text style={styles.help}>
          Needed for the sky view and the moon&apos;s tilt. Everything else works
          without it.
        </Text>

        <TextInput
          style={styles.input}
          value={placeQuery}
          onChangeText={(t) => {
            setPlaceQuery(t);
            setLocation(null);
            setLookupFailed(false);
          }}
          onSubmitEditing={handleLookupPlace}
          placeholder="Where did it happen?"
          placeholderTextColor={Colors.inkMuted}
          selectionColor={Colors.signal}
          returnKeyType="search"
          accessibilityLabel="Place name"
        />

        <View style={styles.locationActions}>
          <TouchableOpacity
            style={styles.outlineButton}
            onPress={handleLookupPlace}
            disabled={busy !== null || !placeQuery.trim()}
            accessibilityRole="button"
          >
            {busy === "lookup" ? (
              <ActivityIndicator size="small" color={Colors.ink} />
            ) : (
              <Text style={styles.outlineButtonText}>FIND PLACE</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.outlineButton}
            onPress={handleUseGPS}
            disabled={busy !== null}
            accessibilityRole="button"
          >
            {busy === "gps" ? (
              <ActivityIndicator size="small" color={Colors.ink} />
            ) : (
              <Text style={styles.outlineButtonText}>USE CURRENT</Text>
            )}
          </TouchableOpacity>
        </View>

        {location && (
          <View style={styles.resolved}>
            <Text style={styles.resolvedLabel}>RESOLVED</Text>
            <Text style={styles.resolvedValue}>
              {Math.abs(location.latitude).toFixed(3)}°
              {location.latitude >= 0 ? "N" : "S"}{"   "}
              {Math.abs(location.longitude).toFixed(3)}°
              {location.longitude >= 0 ? "E" : "W"}
            </Text>
          </View>
        )}
        {lookupFailed && (
          <Text style={styles.error}>
            Couldn&apos;t find that place. Try a city and country, or save without
            a location.
          </Text>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.cancel}
          onPress={onCancel}
          accessibilityRole="button"
        >
          <Text style={styles.cancelText}>CANCEL</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.save}
          onPress={handleSave}
          accessibilityRole="button"
        >
          <Text style={styles.saveText}>{submitLabel}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.paper },
  content: {
    paddingHorizontal: Spacing.page,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
  },

  label: { ...Type.label, color: Colors.ink },
  spaced: { marginTop: Spacing.xl },
  help: { ...Type.small, marginTop: Spacing.xs, marginBottom: Spacing.sm },

  input: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.lead,
    color: Colors.ink,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.ink,
  },
  inputError: { borderBottomColor: Colors.signal },
  multiline: { minHeight: 72, textAlignVertical: "top" },
  error: { ...Type.small, color: Colors.signal, marginTop: Spacing.sm },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm, marginTop: Spacing.sm },
  chip: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.ink,
  },
  chipOn: { backgroundColor: Colors.ink },
  chipText: {
    fontFamily: FontFamily.monoMedium,
    fontSize: FontSize.label,
    letterSpacing: Tracking.label,
    color: Colors.ink,
  },
  chipTextOn: { color: Colors.paper },

  dateValue: {
    fontFamily: FontFamily.monoMedium,
    fontSize: FontSize.lead,
    color: Colors.ink,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.ink,
  },
  pickerWrap: { marginTop: Spacing.xs, alignItems: "center" },

  locationActions: { flexDirection: "row", gap: Spacing.sm, marginTop: Spacing.md },
  outlineButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 42,
    borderWidth: 1,
    borderColor: Colors.ink,
  },
  outlineButtonText: {
    fontFamily: FontFamily.monoMedium,
    fontSize: FontSize.label,
    letterSpacing: Tracking.label,
    color: Colors.ink,
  },

  resolved: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.rule,
  },
  resolvedLabel: { ...Type.label, color: Colors.signal },
  resolvedValue: {
    fontFamily: FontFamily.monoMedium,
    fontSize: FontSize.small,
    color: Colors.ink,
  },

  footer: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: Colors.ink,
  },
  cancel: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.page,
    justifyContent: "center",
  },
  cancelText: {
    fontFamily: FontFamily.monoMedium,
    fontSize: FontSize.label,
    letterSpacing: Tracking.label,
    color: Colors.inkMuted,
  },
  save: {
    flex: 1,
    backgroundColor: Colors.ink,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
  },
  saveText: {
    fontFamily: FontFamily.monoMedium,
    fontSize: FontSize.small,
    letterSpacing: Tracking.label,
    color: Colors.paper,
  },
});
