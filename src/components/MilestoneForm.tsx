import React, { useState, useCallback, useEffect } from "react";
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
  Keyboard,
} from "react-native";
import Animated, { FadeIn, LinearTransition, ReduceMotion } from "react-native-reanimated";
import { lenis } from "@/lib/glide";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import DateTimePicker, {
  DateTimePickerChangeEvent,
} from "@react-native-community/datetimepicker";
import { WheelDatePicker } from "./WheelDatePicker";
import * as Location from "expo-location";
import { useLocationStore } from "@/store/useLocationStore";
import { inferOccasion } from "@/lib/occasion";
import { nightFactsFor } from "@/lib/astronomy/nightFacts";
import { placeOf } from "@/lib/astronomy/place";
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
  formatLongDate,
} from "@/constants/theme";
import {
  toLocalNoon,
  toDateString,
  approximateTimezoneOffsetMin,
} from "@/lib/astronomy/dateUtils";

/** Create and edit share the form so place resolution cannot drift between them. */

/**
 * The place as it will be saved. A place from the phone takes the phone's zone
 * on the record's own date, so a winter birthday in a summer-time country is
 * not read an hour out. Save and the night-facts prewarm both go through here,
 * or the prewarm computes under a key the reveal never asks for.
 */
function savedLocation(place: MilestoneLocation | null, dateStr: string, fromDevice: boolean): MilestoneLocation | null {
  if (!place || !fromDevice) return place;
  const [y, m, d] = dateStr.split("-").map(Number);
  return { ...place, timezoneOffsetMin: -new Date(y, m - 1, d, 12).getTimezoneOffset(), fromDevice: true };
}

/** How long the date and place sit still before the prewarm runs. */
const PREWARM_MS = 500;

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


export function MilestoneForm({
  initial,
  preset,
  submitLabel,
  onSubmit,
  onCancel,
}: MilestoneFormProps) {
  const [title, setTitle] = useState(initial?.title ?? "");
  // No type question. The title decides when it names one, otherwise the start
  // button or the saved date does, and "custom" is the neutral fallback.
  const type: MilestoneType =
    inferOccasion(title) ?? initial?.type ?? preset?.type ?? "custom";
  const [date, setDate] = useState<Date>(
    toLocalNoon(initial?.date ?? preset?.date ?? toDateString(new Date()))
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [titleError, setTitleError] = useState(false);
  const [dateExpanded, setDateExpanded] = useState(false);
  const [notesExpanded, setNotesExpanded] = useState(Boolean(initial?.notes));

  // A new date starts at the phone's last known place, read from the store and
  // never by asking: most dates people add happened where they live. Only when
  // permission is already granted, so opening the form never shows a dialog.
  const [prefill] = useState(() => {
    if (initial) return null;
    const { place, permission } = useLocationStore.getState();
    return permission === "granted" && place ? place : null;
  });
  const [location, setLocation] = useState<MilestoneLocation | null>(
    initial?.location ?? prefill
  );
  // Seeded from the saved label so an edit doesn't look like the location was lost.
  const [placeQuery, setPlaceQuery] = useState(initial?.location?.label ?? prefill?.label ?? "");
  const [busy, setBusy] = useState<null | "gps" | "lookup" | "save">(null);
  const [lookupFailed, setLookupFailed] = useState(false);
  // The place came from the phone, so the phone's own zone rules are the real
  // offset there; a typed place only has its longitude to go on.
  const [placeFromDevice, setPlaceFromDevice] = useState(
    prefill !== null || initial?.location?.fromDevice === true
  );

  // `onValueChange` rather than the legacy `onChange`, which encoded selection
  // and dismissal in `event.type` and warns on every mount.
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
  // The night's facts, computed while the title is being typed. Their eclipse
  // search was most of the pause between Save and the reveal; with this the
  // reveal reads them from nightFactsFor's cache.
  useEffect(() => {
    const dateStr = toDateString(date);
    const place = placeOf(savedLocation(location, dateStr, placeFromDevice));
    if (!place) return;
    let task: number | null = null;
    const timer = setTimeout(() => {
      task = requestIdleCallback(() => {
        nightFactsFor(dateStr, place, place.timezoneOffsetMin);
      });
    }, PREWARM_MS);
    return () => {
      clearTimeout(timer);
      if (task != null) cancelIdleCallback(task);
    };
  }, [date, location, placeFromDevice]);

  const handleSave = useCallback(async () => {
    if (!title.trim()) {
      setTitleError(true);
      return;
    }
    const submit = (place: MilestoneLocation | null) => {
      const dateStr = toDateString(date);
      onSubmit({
        title: title.trim(),
        type,
        date: dateStr,
        notes: notes.trim() || undefined,
        location: savedLocation(place, dateStr, placeFromDevice),
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
      "Save without a place, or change what you typed. Without one, this date has no sky to stand under.",
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
          placeholder="Name this date"
          placeholderTextColor={Colors.inkMuted}
          selectionColor={Colors.signal}
          returnKeyType="next"
          maxLength={80}
          accessibilityLabel="Title"
        />
        {titleError && <Text style={styles.error}>A title is required.</Text>}

        {/* ---- Date ---- */}
        <Text style={[styles.label, styles.spaced]}>Date</Text>
        <Pressable onPress={() => { Keyboard.dismiss(); setDateExpanded((open) => !open); }}
          accessibilityRole="button" accessibilityState={{ expanded: dateExpanded }}
          accessibilityLabel={`Date, ${formatLongDate(toDateString(date))}`}
          accessibilityHint={dateExpanded ? "Close the date picker" : "Change the date"}
          style={styles.dateSummary}>
          <Text style={styles.dateValue}>{formatLongDate(toDateString(date))}</Text>
          {dateExpanded ? <ChevronUp color={Colors.signal} size={20} /> : <ChevronDown color={Colors.signal} size={20} />}
        </Pressable>
        {/* Closed by default: an open wheel sat in the scroll path, and a swipe
            meant for the form changed the month without anyone noticing. */}
        {dateExpanded && (
          <Animated.View
            entering={FadeIn.duration(180).easing(lenis).reduceMotion(ReduceMotion.System)}
            layout={LinearTransition.duration(220).easing(lenis).reduceMotion(ReduceMotion.System)}
            style={styles.pickerWrap}
          >
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
          <Pressable accessibilityRole="button" onPress={() => setDateExpanded(false)} style={styles.pickerDone}>
            <Text style={styles.outlineButtonText}>Done</Text>
          </Pressable>
        </Animated.View>
        )}
        <Text style={styles.help}>The moon on the evening of this date.</Text>

        {/* ---- Location ---- */}
        <Text style={[styles.label, styles.spaced]}>Where</Text>
        <Text style={styles.help}>
          {prefill && location === prefill
            ? "Where you are now. Change it if it happened somewhere else."
            : "Add a place to see that night's sky."}
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
              <Text style={styles.outlineButtonText}>Use my location</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* The field already shows the name, so this only confirms the find. */}
        {location && location !== prefill && (
          <Text style={[styles.resolvedLabel, styles.found]}>Place found</Text>
        )}
        {lookupFailed && (
          <Text style={styles.error}>
            Couldn&apos;t find that place. Try a city and country, or save without
            a location.
          </Text>
        )}
        <Pressable onPress={() => setNotesExpanded((open) => !open)} accessibilityRole="button"
          accessibilityState={{ expanded: notesExpanded }} style={styles.pickerDone}>
          <Text style={styles.outlineButtonText}>{notesExpanded ? "Hide note" : "Add a note"}</Text>
        </Pressable>
        {notesExpanded && (
          <View>
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
          </View>
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

  dateSummary: { flexDirection: "row", alignItems: "center", gap: Spacing.md, minHeight: 54, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.rule },
  dateValue: { ...Type.heading, flex: 1 },
  pickerDone: { alignSelf: "flex-end", padding: Spacing.md, minHeight: 44 },
  pickerWrap: { marginTop: Spacing.xs },

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

  resolvedLabel: { ...Type.label, color: Colors.signal },
  found: { marginTop: Spacing.sm },

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
