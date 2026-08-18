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
} from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { router } from "expo-router";
import { MilestoneType } from "@/types";
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
  const [date, setDate] = useState<Date>(
    toLocalNoon(toDateString(new Date()))
  );
  const [notes, setNotes] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(Platform.OS === "ios");
  const [titleError, setTitleError] = useState(false);

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

  const handleSave = useCallback(() => {
    if (!title.trim()) {
      setTitleError(true);
      return;
    }
    addMilestone({
      title: title.trim(),
      type,
      date: toDateString(date),
      notes: notes.trim() || undefined,
      location: null, // Phase 8
    });
    router.back();
  }, [title, type, date, notes, addMilestone]);

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

        {/* ---- Location note ---- */}
        <View style={styles.locationNote}>
          <Text style={styles.locationNoteText}>
            📍 Location can be added in Phase 8 to enable moon-orientation rendering.
          </Text>
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

  // ---- Location note ----
  locationNote: {
    backgroundColor: Colors.cyanotype + "18",
    borderRadius: Radius.sm,
    padding: Spacing.sm,
    borderLeftWidth: 2,
    borderLeftColor: Colors.cyanotype + "66",
  },
  locationNoteText: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    color: Colors.cyanotype,
    lineHeight: 18,
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
