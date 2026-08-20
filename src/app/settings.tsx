import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { Colors, FontFamily, FontSize, Spacing, Radius } from "@/constants/theme";
import { useSettingsStore } from "@/store/useSettingsStore";

export default function SettingsScreen() {
  const nasaApiKey = useSettingsStore((s) => s.nasaApiKey);
  const distanceUnit = useSettingsStore((s) => s.distanceUnit);
  const setNasaApiKey = useSettingsStore((s) => s.setNasaApiKey);
  const setDistanceUnit = useSettingsStore((s) => s.setDistanceUnit);

  // Local draft for the key input — only committed on Save
  const [keyDraft, setKeyDraft] = useState(nasaApiKey ?? "");
  const [keyVisible, setKeyVisible] = useState(false);
  const [keySaved, setKeySaved] = useState(false);

  const envKey =
    typeof process !== "undefined"
      ? process.env.EXPO_PUBLIC_NASA_API_KEY ?? null
      : null;

  // The active key (store overrides env)
  const activeKey = nasaApiKey || envKey || "DEMO_KEY";
  const usingEnv = !nasaApiKey && !!envKey;
  const usingDemo = !nasaApiKey && !envKey;

  const handleSaveKey = useCallback(() => {
    const trimmed = keyDraft.trim();
    if (!trimmed) {
      // Empty = clear override, fall back to env / DEMO_KEY
      setNasaApiKey(null);
      setKeyDraft("");
    } else {
      setNasaApiKey(trimmed);
    }
    setKeySaved(true);
    setTimeout(() => setKeySaved(false), 2000);
  }, [keyDraft, setNasaApiKey]);

  const handleClearKey = useCallback(() => {
    Alert.alert(
      "Clear custom key?",
      usingEnv
        ? "The app will use your EXPO_PUBLIC_NASA_API_KEY environment variable."
        : "The app will fall back to DEMO_KEY (30 req/hr).",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: () => {
            setNasaApiKey(null);
            setKeyDraft("");
          },
        },
      ]
    );
  }, [usingEnv, setNasaApiKey]);

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

        {/* ---- NASA API Key ---- */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>NASA API KEY</Text>
          <Text style={styles.sectionDesc}>
            The free DEMO_KEY allows 30 requests/hour and 50/day.{"\n"}
            Your personal key (free at{" "}
            <Text style={styles.link}>api.nasa.gov</Text>
            ) allows 1,000/hour.
          </Text>

          {/* Status pill */}
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor: usingDemo
                    ? Colors.ember
                    : Colors.starlight,
                },
              ]}
            />
            <Text style={styles.statusText}>
              {usingDemo
                ? "Using DEMO_KEY — limited rate"
                : usingEnv
                ? "Using EXPO_PUBLIC_NASA_API_KEY from .env"
                : "Using custom key"}
            </Text>
          </View>

          {/* Key input */}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.keyInput}
              value={keyDraft}
              onChangeText={(t) => {
                setKeyDraft(t);
                setKeySaved(false);
              }}
              placeholder="Paste your API key here"
              placeholderTextColor={Colors.cyanotype + "88"}
              selectionColor={Colors.ember}
              secureTextEntry={!keyVisible}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              returnKeyType="done"
              onSubmitEditing={handleSaveKey}
              accessibilityLabel="NASA API key input"
            />
            <TouchableOpacity
              style={styles.visibilityToggle}
              onPress={() => setKeyVisible((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={keyVisible ? "Hide key" : "Show key"}
            >
              <Text style={styles.visibilityToggleText}>
                {keyVisible ? "Hide" : "Show"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Save / Clear buttons */}
          <View style={styles.keyActions}>
            <TouchableOpacity
              style={[styles.saveKeyButton, keySaved && styles.saveKeyButtonSaved]}
              onPress={handleSaveKey}
              accessibilityRole="button"
            >
              <Text style={styles.saveKeyButtonText}>
                {keySaved ? "✓ Saved" : "Save Key"}
              </Text>
            </TouchableOpacity>
            {nasaApiKey && (
              <TouchableOpacity
                style={styles.clearKeyButton}
                onPress={handleClearKey}
                accessibilityRole="button"
              >
                <Text style={styles.clearKeyButtonText}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Active key preview */}
          <View style={styles.activeKeyRow}>
            <Text style={styles.activeKeyLabel}>ACTIVE KEY</Text>
            <Text style={styles.activeKeyValue} numberOfLines={1}>
              {activeKey.length > 12
                ? `${activeKey.slice(0, 6)}••••${activeKey.slice(-4)}`
                : activeKey}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* ---- Distance Unit ---- */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>DISTANCE UNIT</Text>
          <Text style={styles.sectionDesc}>
            Used in Phase 6 light-travel facts.
          </Text>

          <View style={styles.unitToggleRow}>
            <TouchableOpacity
              style={[
                styles.unitChip,
                distanceUnit === "ly" && styles.unitChipSelected,
              ]}
              onPress={() => setDistanceUnit("ly")}
              accessibilityRole="radio"
              accessibilityState={{ checked: distanceUnit === "ly" }}
            >
              <Text
                style={[
                  styles.unitChipText,
                  distanceUnit === "ly" && styles.unitChipTextSelected,
                ]}
              >
                Light-years
              </Text>
              <Text style={styles.unitChipSub}>ly</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.unitChip,
                distanceUnit === "km" && styles.unitChipSelected,
              ]}
              onPress={() => setDistanceUnit("km")}
              accessibilityRole="radio"
              accessibilityState={{ checked: distanceUnit === "km" }}
            >
              <Text
                style={[
                  styles.unitChipText,
                  distanceUnit === "km" && styles.unitChipTextSelected,
                ]}
              >
                Kilometres
              </Text>
              <Text style={styles.unitChipSub}>km</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.divider} />

        {/* ---- About ---- */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ABOUT</Text>
          <View style={styles.aboutCard}>
            <Text style={styles.aboutAppName}>TRACE</Text>
            <Text style={styles.aboutTagline}>
              Every date has a cosmic story.
            </Text>
            <View style={styles.aboutMeta}>
              <Text style={styles.aboutMetaRow}>
                Moon phase · SunCalc 2
              </Text>
              <Text style={styles.aboutMetaRow}>
                Astronomy images · NASA APOD API
              </Text>
              <Text style={styles.aboutMetaRow}>
                Planetary ages · Sidereal orbital periods
              </Text>
            </View>
          </View>
        </View>

      </ScrollView>
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
    paddingBottom: Spacing.xxl,
  },

  // ---- Sections ----
  section: {
    marginBottom: Spacing.lg,
  },
  sectionLabel: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.xs,
    color: Colors.cyanotype,
    letterSpacing: 2,
    marginBottom: Spacing.sm,
  },
  sectionDesc: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    color: Colors.cyanotype,
    lineHeight: 20,
    opacity: 0.75,
    marginBottom: Spacing.md,
  },
  link: {
    color: Colors.cyanotype,
    textDecorationLine: "underline",
  },
  divider: {
    height: 1,
    backgroundColor: Colors.cyanotype,
    opacity: 0.15,
    marginBottom: Spacing.lg,
  },

  // ---- API Key ----
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.xs,
    color: Colors.cyanotype,
    letterSpacing: 0.3,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  keyInput: {
    flex: 1,
    backgroundColor: Colors.blueprintLight,
    borderWidth: 1,
    borderColor: Colors.cyanotype + "44",
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 4,
    fontFamily: FontFamily.mono,
    fontSize: FontSize.sm,
    color: Colors.starlight,
    letterSpacing: 0.5,
  },
  visibilityToggle: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm + 4,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.cyanotype + "44",
    backgroundColor: Colors.blueprintLight,
  },
  visibilityToggleText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    color: Colors.cyanotype,
  },
  keyActions: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  saveKeyButton: {
    flex: 1,
    backgroundColor: Colors.ember,
    borderRadius: Radius.sm,
    paddingVertical: Spacing.sm + 2,
    alignItems: "center",
  },
  saveKeyButtonSaved: {
    backgroundColor: Colors.cyanotype,
  },
  saveKeyButtonText: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.sm,
    color: "#fff",
    letterSpacing: 0.3,
  },
  clearKeyButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.ember + "66",
    alignItems: "center",
  },
  clearKeyButtonText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    color: Colors.ember,
  },
  activeKeyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.blueprintLight,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.cyanotype + "33",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  activeKeyLabel: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.xs,
    color: Colors.cyanotype,
    letterSpacing: 1.5,
    opacity: 0.6,
  },
  activeKeyValue: {
    flex: 1,
    fontFamily: FontFamily.mono,
    fontSize: FontSize.sm,
    color: Colors.starlight,
    textAlign: "right",
  },

  // ---- Distance unit ----
  unitToggleRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  unitChip: {
    flex: 1,
    backgroundColor: Colors.blueprintLight,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.cyanotype + "44",
    paddingVertical: Spacing.md,
    alignItems: "center",
    gap: 2,
  },
  unitChipSelected: {
    borderColor: Colors.ember,
    backgroundColor: Colors.ember + "22",
  },
  unitChipText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    color: Colors.cyanotype,
  },
  unitChipTextSelected: {
    color: Colors.ember,
  },
  unitChipSub: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.xs,
    color: Colors.cyanotype,
    opacity: 0.5,
    letterSpacing: 1,
  },

  // ---- About ----
  aboutCard: {
    backgroundColor: Colors.blueprintLight,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.cyanotype + "33",
    padding: Spacing.lg,
    alignItems: "center",
    gap: Spacing.xs,
  },
  aboutAppName: {
    fontFamily: FontFamily.displayBold,
    fontSize: 32,
    color: Colors.starlight,
    letterSpacing: 6,
  },
  aboutTagline: {
    fontFamily: FontFamily.displayItalic,
    fontSize: FontSize.md,
    color: Colors.cyanotype,
    marginBottom: Spacing.sm,
  },
  aboutMeta: {
    gap: 4,
    alignItems: "center",
  },
  aboutMetaRow: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.xs,
    color: Colors.cyanotype,
    opacity: 0.5,
    letterSpacing: 0.3,
  },
});
