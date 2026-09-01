import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Pressable,
} from "react-native";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { Colors, FontFamily, FontSize, Spacing } from "@/constants/theme";
import { PLANET_ORDER, getAllPlanetaryAges } from "@/lib/astronomy/planetaryAge";
import { PlanetAgeRow } from "@/components/PlanetAgeRow";
import { toLocalNoon, toDateString } from "@/lib/astronomy/dateUtils";

/**
 * Planetary Age Converter — Phase 1
 *
 * Phase 1 spec: zero APIs, zero storage, zero async.
 * Enter (or pick) any date → see exact age on all 8 planets.
 * "Today" quick-fill button.
 */
export default function AgeConverterScreen() {
  const today = new Date();
  const [birthDate, setBirthDate] = useState<Date>(
    // Default: 25 years ago today, for a compelling initial result
    new Date(today.getFullYear() - 25, today.getMonth(), today.getDate(), 12, 0, 0)
  );
  const [showPicker, setShowPicker] = useState(Platform.OS === "ios");

  const ages = getAllPlanetaryAges(birthDate, today);

  const handleDateChange = useCallback(
    (_event: DateTimePickerEvent, selected?: Date) => {
      if (Platform.OS === "android") {
        setShowPicker(false);
      }
      if (selected) {
        // Normalize to noon to avoid timezone drift (spec §6.4)
        const normalized = toLocalNoon(toDateString(selected));
        setBirthDate(normalized);
      }
    },
    []
  );

  const handleToday = useCallback(() => {
    setBirthDate(toLocalNoon(toDateString(today)));
  }, []);

  const formattedDate = birthDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header section */}
        <View style={styles.header}>
          <Text style={styles.headerLabel}>REFERENCE DATE</Text>
          <Text style={styles.headerDate}>{formattedDate}</Text>
          <Text style={styles.headerSub}>
            Age in years across our solar system
          </Text>
        </View>

        {/* Date picker */}
        <View style={styles.pickerCard}>
          {Platform.OS === "android" && (
            <TouchableOpacity
              style={styles.androidPickerTrigger}
              onPress={() => setShowPicker(true)}
              accessibilityRole="button"
              accessibilityLabel="Choose date"
            >
              <Text style={styles.androidPickerLabel}>📅 Choose date</Text>
              <Text style={styles.androidPickerValue}>{formattedDate}</Text>
            </TouchableOpacity>
          )}

          {showPicker && (
            <DateTimePicker
              value={birthDate}
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={handleDateChange}
              maximumDate={today}
              minimumDate={new Date(1800, 0, 1)}
              style={Platform.OS === "ios" ? styles.iosPicker : undefined}
              themeVariant="dark"
            />
          )}

          <TouchableOpacity
            style={styles.todayButton}
            onPress={handleToday}
            accessibilityRole="button"
            accessibilityLabel="Set to today"
          >
            <Text style={styles.todayButtonText}>Set to today</Text>
          </TouchableOpacity>
        </View>

        {/* Divider */}
        <View style={styles.sectionDivider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerLabel}>PLANETARY AGES</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Planet rows */}
        <View style={styles.planetsContainer}>
          {PLANET_ORDER.map((planet) => (
            <PlanetAgeRow key={planet} planet={planet} ageYears={ages[planet]} />
          ))}
        </View>

        {/* Footer note */}
        <Text style={styles.footerNote}>
          Based on sidereal orbital periods. Mercury year: 87.97 Earth days.
          Neptune year: 164.79 Earth years.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.paper,
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxl + 16,
  },

  // ---- Header ----
  header: {
    marginBottom: Spacing.lg,
  },
  headerLabel: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.label,
    color: Colors.inkMuted,
    letterSpacing: 2,
    marginBottom: Spacing.xs,
  },
  headerDate: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSize.title,
    color: Colors.ink,
    letterSpacing: -0.5,
    lineHeight: 34,
  },
  headerSub: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.body,
    color: Colors.inkMuted,
    marginTop: Spacing.xs,
  },

  // ---- Picker card ----
  pickerCard: {
    backgroundColor: Colors.rule,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.inkMuted + "44",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
    alignItems: "center",
  },
  iosPicker: {
    width: "100%",
  },
  androidPickerTrigger: {
    width: "100%",
    paddingVertical: Spacing.sm,
  },
  androidPickerLabel: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.small,
    color: Colors.inkMuted,
    marginBottom: 4,
  },
  androidPickerValue: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSize.lead,
    color: Colors.ink,
  },
  todayButton: {
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.signal,
    alignSelf: "center",
  },
  todayButtonText: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.small,
    color: Colors.signal,
  },

  // ---- Section divider ----
  sectionDivider: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.inkMuted,
    opacity: 0.3,
  },
  dividerLabel: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.label,
    color: Colors.inkMuted,
    letterSpacing: 2,
  },

  // ---- Planets ----
  planetsContainer: {
    gap: 0, // PlanetAgeRow has its own marginBottom
  },

  // ---- Footer ----
  footerNote: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.label,
    color: Colors.inkMuted,
    opacity: 0.6,
    textAlign: "center",
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.md,
    lineHeight: 18,
  },
});
