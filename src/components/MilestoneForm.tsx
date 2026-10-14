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
  DateTimePickerChangeEvent,
} from "@react-native-community/datetimepicker";
import { WheelDatePicker } from "./WheelDatePicker";
import * as Location from "expo-location";
import { useLocationStore } from "@/store/useLocationStore";
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
  Radius,
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
 * No pictograms. Labels are small uppercase Figtree, inputs are underlined
 * rather than boxed, and the selected chip is an ink fill. The emoji that used
 * to sit on the type chips were the single most generic element in the app and
 * rendered as tofu on some devices besides.
 *
 * Chip and button labels are sentence case. They were MONO CAPS, which made a
 * form for recording a birthday read like a terminal prompt.
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
  /**
   * A new record's starting type and date, from the first-run starts and from
   * "Save this date" on the tonight dial. Ignored when editing.
   */
  preset?: { type?: MilestoneType; date?: string };
  submitLabel: string;
  onSubmit: (values: MilestoneFormValues) => void;
  onCancel: () => void;
}

const TYPES: Array<{ value: MilestoneType; label: string }> = [
  { value: "birthday", label: "Birthday" },
  { value: "anniversary", label: "Anniversary" },
  { value: "graduation", label: "Graduation" },
  { value: "custom", label: "A day to remember" },
];

export function MilestoneForm({
  initial,
  preset,
  submitLabel,
  onSubmit,
  onCancel,
}: MilestoneFormProps) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [type, setType] = useState<MilestoneType>(initial?.type ?? preset?.type ?? "birthday");
  const [date, setDate] = useState<Date>(
    toLocalNoon(initial?.date ?? preset?.date ?? toDateString(new Date()))
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [titleError, setTitleError] = useState(false);

  const [location, setLocation] = useState<MilestoneLocation | null>(
    initial?.location ?? null
  );
  // Seeded from the saved label so an edit doesn't look like the location was lost.
  const [placeQuery, setPlaceQuery] = useState(initial?.location?.label ?? "");
  const [busy, setBusy] = useState<null | "gps" | "lookup" | "save">(null);
  const [lookupFailed, setLookupFailed] = useState(false);
  // The place came from the phone, so the phone's own zone rules are the real
  // offset there; a typed place only has its longitude to go on.
  const [placeFromDevice, setPlaceFromDevice] = useState(false);

  // `onValueChange` rather than the legacy `onChange`, which encoded selection
  // and dismissal in `event.type`. The old prop still works and still warns on
  // every mount. There is no dismissal to handle any more: both platforms draw
  // the wheel inline, so nothing opens and nothing closes.
  const handleDateSelected = useCallback(
    (_event: DateTimePickerChangeEvent, selected: Date) => {
      setDate(toLocalNoon(toDateString(selected)));
    },
    []
  );

  const commitLocation = (
    latitude: number,
    longitude: number,
    label: string,
    fromDevice = false
  ) => {
    setLocation({
      latitude,
      longitude,
      label,
      // Approximated from longitude, see approximateTimezoneOffsetMin. A place
      // from the phone is corrected to the phone's own offset on save.
      timezoneOffsetMin: approximateTimezoneOffsetMin(longitude),
    });
    setPlaceFromDevice(fromDevice);
    setLookupFailed(false);
  };

  // The same lookup Home and tonight's sky use, so a place found here is also
  // the place Home names on its next launch.
  const handleUseGPS = useCallback(async () => {
    setBusy("gps");
    try {
      const here = await useLocationStore.getState().refresh({ ask: true });
      if (!here) {
        Alert.alert(
          useLocationStore.getState().permission === "denied"
            ? "Location permission denied"
            : "Could not read location",
          "You can type a place instead, or save without one. Everything except the sky view still works."
        );
        return;
      }
      commitLocation(here.latitude, here.longitude, here.label, true);
      setPlaceQuery(here.label);
    } finally {
      setBusy(null);
    }
  }, []);

  /**
   * Resolves typed text to real coordinates.
   *
   * This is what makes location useful for HISTORICAL dates, which is nearly
   * all of them. GPS only ever describes where you are standing now; a birthday
   * from 1990 needs the place it happened. An earlier version stored typed
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

  /**
   * A TYPED PLACE IS NEVER DROPPED. Typing clears the resolved place until
   * "Find place" runs, and Save used to send whatever was resolved: type
   * "Lisbon", tap Save, and the record went in with no place at all, so no
   * tilt, no night facts and no sky, with nothing on screen to say so. Save
   * now finishes the lookup itself, and if it fails it asks rather than
   * guessing in either direction.
   */
  const handleSave = useCallback(async () => {
    if (!title.trim()) {
      setTitleError(true);
      return;
    }
    const submit = (place: MilestoneLocation | null) => {
      const dateStr = toDateString(date);
      const [y, m, d] = dateStr.split("-").map(Number);
      onSubmit({
        title: title.trim(),
        type,
        date: dateStr,
        notes: notes.trim() || undefined,
        // The phone's zone on the record's own date, so a winter birthday in a
        // summer-time country is not read an hour out.
        location:
          place && placeFromDevice
            ? { ...place, timezoneOffsetMin: -new Date(y, m - 1, d, 12).getTimezoneOffset() }
            : place,
      });
    };

    const q = placeQuery.trim();
    if (location || !q) {
      submit(location);
      return;
    }

    setBusy("save");
    let found: MilestoneLocation | null = null;
    try {
      const [hit] = await Location.geocodeAsync(q);
      if (hit) {
        found = {
          latitude: hit.latitude,
          longitude: hit.longitude,
          label: q,
          timezoneOffsetMin: approximateTimezoneOffsetMin(hit.longitude),
        };
      }
    } catch {
      // Offline, or the geocoder refused. Handled below as not found.
    } finally {
      setBusy(null);
    }
    if (found) {
      setLocation(found);
      submit(found);
      return;
    }
    setLookupFailed(true);
    Alert.alert(
      `Couldn't find "${q}"`,
      "Save without a place, or change what you typed. Without one the record has no tilt, no night facts and no sky view.",
      [
        { text: "Change it", style: "cancel" },
        { text: "Save without a place", onPress: () => submit(null) },
      ]
    );
  }, [title, type, date, notes, location, placeQuery, placeFromDevice, onSubmit]);

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
        <Text style={styles.label}>Title</Text>
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
        <Text style={[styles.label, styles.spaced]}>Type</Text>
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
        <Text style={[styles.label, styles.spaced]}>Date</Text>
        {/* iOS keeps UIDatePicker. Android used to open the Material calendar
            dialog from the line above, which is a different interaction on a
            screen that is otherwise one continuous scroll. See WheelDatePicker
            for why that one is written rather than installed. */}
        <View style={styles.pickerWrap}>
          {Platform.OS === "ios" ? (
            <DateTimePicker
              value={date}
              mode="date"
              display="spinner"
              onValueChange={handleDateSelected}
              maximumDate={new Date(2100, 11, 31)}
              minimumDate={new Date(1900, 0, 1)}
              themeVariant="light"
              accentColor={Colors.signal}
            />
          ) : (
            <WheelDatePicker
              value={date}
              onChange={(next) => setDate(toLocalNoon(toDateString(next)))}
              minimumYear={1900}
              maximumYear={2100}
            />
          )}
        </View>

        {/* ---- Notes ---- */}
        <Text style={[styles.label, styles.spaced]}>Notes, optional</Text>
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
        <Text style={[styles.label, styles.spaced]}>Location, optional</Text>
        <Text style={styles.help}>
          Needed for the moon&apos;s tilt, what that night was like, and the sky
          view. The rest works without it.
        </Text>

        <TextInput
          style={styles.input}
          value={placeQuery}
          onChangeText={(t) => {
            setPlaceQuery(t);
            setLocation(null);
            setPlaceFromDevice(false);
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
              <Text style={styles.outlineButtonText}>Find place</Text>
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
              <Text style={styles.outlineButtonText}>Use current</Text>
            )}
          </TouchableOpacity>
        </View>

        {location && (
          <View style={styles.resolved}>
            <Text style={styles.resolvedLabel}>Resolved</Text>
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
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.save}
          onPress={handleSave}
          disabled={busy !== null}
          accessibilityRole="button"
        >
          {busy === "save" ? (
            <ActivityIndicator size="small" color={Colors.paper} />
          ) : (
            <Text style={styles.saveText}>{submitLabel}</Text>
          )}
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
    fontFamily: FontFamily.serif,
    fontSize: FontSize.title,
    lineHeight: 38,
    color: Colors.ink,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.rule,
  },
  inputError: { borderBottomColor: Colors.danger },
  multiline: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.body,
    lineHeight: 24,
    minHeight: 72,
    textAlignVertical: "top",
  },
  error: { ...Type.small, color: Colors.danger, marginTop: Spacing.sm },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.sm, marginTop: Spacing.sm },
  chip: {
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.rule,
  },
  chipOn: { backgroundColor: Colors.ink, borderColor: Colors.ink },
  chipText: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.small,
    color: Colors.inkMuted,
  },
  chipTextOn: { color: Colors.paper },

  pickerWrap: { marginTop: Spacing.xs, alignItems: "center" },

  locationActions: { flexDirection: "row", gap: Spacing.sm, marginTop: Spacing.md },
  outlineButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46,
    borderRadius: Radius.pill,
    backgroundColor: Colors.paperDim,
  },
  outlineButtonText: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.small,
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
    fontFamily: FontFamily.mono,
    fontSize: FontSize.small,
    color: Colors.ink,
  },

  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.page,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.rule,
  },
  cancel: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    justifyContent: "center",
  },
  cancelText: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.body,
    color: Colors.inkMuted,
  },
  save: {
    flex: 1,
    backgroundColor: Colors.ink,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
  },
  saveText: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSize.body,
    color: Colors.paper,
  },
});
