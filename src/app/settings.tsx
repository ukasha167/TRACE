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
  const setNasaApiKey = useSettingsStore((s) => s.setNasaApiKey);

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
                    ? Colors.signal
                    : Colors.ink,
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
              placeholderTextColor={Colors.inkMuted + "88"}
              selectionColor={Colors.signal}
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
            <Text style={styles.activeKeyValue}>
              {activeKey.length > 12
                ? `${activeKey.slice(0, 6)}••••${activeKey.slice(-4)}`
                : activeKey}
            </Text>
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
    backgroundColor: Colors.paper,
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
    fontSize: FontSize.label,
    color: Colors.inkMuted,
    letterSpacing: 2,
    marginBottom: Spacing.sm,
  },
  sectionDesc: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.small,
    color: Colors.inkMuted,
    lineHeight: 20,
    opacity: 0.75,
    marginBottom: Spacing.md,
  },
  link: {
    color: Colors.inkMuted,
    textDecorationLine: "underline",
  },
  divider: {
    height: 1,
    backgroundColor: Colors.inkMuted,
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
    fontSize: FontSize.label,
    color: Colors.inkMuted,
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
    backgroundColor: Colors.rule,
    borderWidth: 1,
    borderColor: Colors.inkMuted + "44",
    borderRadius: Radius.plate,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 4,
    fontFamily: FontFamily.mono,
    fontSize: FontSize.small,
    color: Colors.ink,
    letterSpacing: 0.5,
  },
  visibilityToggle: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm + 4,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.inkMuted + "44",
    backgroundColor: Colors.rule,
  },
  visibilityToggleText: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.small,
    color: Colors.inkMuted,
  },
  keyActions: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  saveKeyButton: {
    flex: 1,
    backgroundColor: Colors.signal,
    borderRadius: Radius.sm,
    paddingVertical: Spacing.sm + 2,
    alignItems: "center",
  },
  saveKeyButtonSaved: {
    backgroundColor: Colors.inkMuted,
  },
  saveKeyButtonText: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.small,
    color: Colors.paper,
    letterSpacing: 0.3,
  },
  clearKeyButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.signal + "66",
    alignItems: "center",
  },
  clearKeyButtonText: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.small,
    color: Colors.signal,
  },
  activeKeyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.rule,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.inkMuted + "33",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  activeKeyLabel: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.label,
    color: Colors.inkMuted,
    letterSpacing: 1.5,
    opacity: 0.6,
  },
  activeKeyValue: {
    flex: 1,
    fontFamily: FontFamily.mono,
    fontSize: FontSize.small,
    color: Colors.ink,
    textAlign: "right",
  },

  // ---- Distance unit ----

  // ---- About ----
  aboutCard: {
    backgroundColor: Colors.rule,
    borderRadius: Radius.plate,
    borderWidth: 1,
    borderColor: Colors.inkMuted + "33",
    padding: Spacing.lg,
    alignItems: "center",
    gap: Spacing.xs,
  },
  aboutAppName: {
    fontFamily: FontFamily.bold,
    fontSize: 32,
    color: Colors.ink,
    letterSpacing: 6,
  },
  aboutTagline: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.body,
    color: Colors.inkMuted,
    marginBottom: Spacing.sm,
  },
  aboutMeta: {
    gap: 4,
    alignItems: "center",
  },
  aboutMetaRow: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.label,
    color: Colors.inkMuted,
    opacity: 0.5,
    letterSpacing: 0.3,
  },
});
