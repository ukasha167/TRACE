import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import {
  Colors,
  FontFamily,
  FontSize,
  Spacing,
  Radius,
  Type,
} from "@/constants/theme";
import { useSettingsStore } from "@/store/useSettingsStore";

/**
 * SETTINGS.
 *
 * This screen had drifted furthest from the system: it painted backgrounds with
 * Colors.rule (a hairline colour used as a fill), built translucency by
 * concatenating hex strings onto tokens, and mixed three button shapes. All of
 * it is now paper, paperDim, and the pill.
 */
export default function SettingsScreen() {
  const nasaApiKey = useSettingsStore((s) => s.nasaApiKey);
  const setNasaApiKey = useSettingsStore((s) => s.setNasaApiKey);

  // Local draft for the key input, only committed on save.
  const [keyDraft, setKeyDraft] = useState(nasaApiKey ?? "");
  const [keyVisible, setKeyVisible] = useState(false);
  const [keySaved, setKeySaved] = useState(false);

  const envKey =
    typeof process !== "undefined"
      ? process.env.EXPO_PUBLIC_NASA_API_KEY ?? null
      : null;

  // The active key (the stored override beats the env value).
  const activeKey = nasaApiKey || envKey || "DEMO_KEY";
  const usingEnv = !nasaApiKey && !!envKey;
  const usingDemo = !nasaApiKey && !envKey;

  const handleSaveKey = useCallback(() => {
    const trimmed = keyDraft.trim();
    if (!trimmed) {
      // Empty clears the override and falls back to env, then DEMO_KEY.
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
      "Clear your key?",
      usingEnv
        ? "TRACE will use the EXPO_PUBLIC_NASA_API_KEY from your environment."
        : "TRACE will fall back to DEMO_KEY, which allows 30 requests an hour.",
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
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ---- NASA API key ---- */}
        <Text style={styles.label}>NASA image key</Text>
        <Text style={styles.help}>
          The shared DEMO_KEY allows 30 requests an hour, which one life ledger
          exhausts on its own. A personal key is free at api.nasa.gov and allows
          1,000.
        </Text>

        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: usingDemo ? Colors.signal : Colors.ink },
            ]}
          />
          <Text style={styles.statusText}>
            {usingDemo
              ? "Using DEMO_KEY, rate limited"
              : usingEnv
              ? "Using the key from your environment"
              : "Using your own key"}
          </Text>
        </View>

        <View style={styles.inputRow}>
          <TextInput
            style={styles.keyInput}
            value={keyDraft}
            onChangeText={(t) => {
              setKeyDraft(t);
              setKeySaved(false);
            }}
            placeholder="Paste your key"
            placeholderTextColor={Colors.inkMuted}
            selectionColor={Colors.signal}
            secureTextEntry={!keyVisible}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            returnKeyType="done"
            onSubmitEditing={handleSaveKey}
            accessibilityLabel="NASA API key"
          />
          <Pressable
            style={styles.ghostButton}
            onPress={() => setKeyVisible((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={keyVisible ? "Hide key" : "Show key"}
          >
            <Text style={styles.ghostButtonText}>
              {keyVisible ? "Hide" : "Show"}
            </Text>
          </Pressable>
        </View>

        <View style={styles.keyActions}>
          <Pressable
            style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}
            onPress={handleSaveKey}
            accessibilityRole="button"
          >
            <Text style={styles.saveButtonText}>
              {keySaved ? "Saved" : "Save key"}
            </Text>
          </Pressable>
          {nasaApiKey && (
            <Pressable
              style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}
              onPress={handleClearKey}
              accessibilityRole="button"
            >
              <Text style={styles.clearButtonText}>Clear</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.activeKeyRow}>
          <Text style={styles.activeKeyLabel}>In use</Text>
          <Text style={styles.activeKeyValue}>
            {activeKey.length > 12
              ? `${activeKey.slice(0, 6)}••••${activeKey.slice(-4)}`
              : activeKey}
          </Text>
        </View>

        {/* ---- About ---- */}
        <Text style={[styles.label, styles.spaced]}>About</Text>
        <View style={styles.about}>
          <Text style={styles.aboutName}>TRACE</Text>
          <Text style={styles.aboutLine}>
            The sky keeps a schedule, and it happens to line up with the dates
            you care about.
          </Text>
          <View style={styles.aboutMeta}>
            <Text style={styles.aboutMetaRow}>Moon and sun · SunCalc 2</Text>
            <Text style={styles.aboutMetaRow}>
              Planets · astronomy-engine
            </Text>
            <Text style={styles.aboutMetaRow}>
              Stars · Yale Bright Star Catalog
            </Text>
            <Text style={styles.aboutMetaRow}>
              Lunar surface · NASA LRO
            </Text>
            <Text style={styles.aboutMetaRow}>Images · NASA APOD</Text>
          </View>
          <Text style={styles.aboutNote}>
            Everything except the NASA images is computed on this device. No
            account, no telemetry, and your locations never leave the phone.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.paper },
  content: {
    paddingHorizontal: Spacing.page,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  pressed: { opacity: 0.6 },

  label: { ...Type.label, color: Colors.ink },
  spaced: { marginTop: Spacing.xl },
  help: { ...Type.small, marginTop: Spacing.sm },

  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  statusDot: { width: 7, height: 7, borderRadius: Radius.pill },
  statusText: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.small,
    color: Colors.inkMuted,
  },

  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  keyInput: {
    flex: 1,
    backgroundColor: Colors.paperDim,
    borderRadius: Radius.plate,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontFamily: FontFamily.mono,
    fontSize: FontSize.small,
    color: Colors.ink,
  },
  ghostButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: Radius.pill,
    backgroundColor: Colors.paperDim,
  },
  ghostButtonText: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.small,
    color: Colors.inkMuted,
  },

  keyActions: { flexDirection: "row", gap: Spacing.sm, marginTop: Spacing.md },
  saveButton: {
    flex: 1,
    backgroundColor: Colors.ink,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  saveButtonText: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSize.body,
    color: Colors.paper,
  },
  clearButton: {
    paddingHorizontal: Spacing.lg,
    justifyContent: "center",
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.rule,
  },
  clearButtonText: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.small,
    color: Colors.danger,
  },

  activeKeyRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: Spacing.md,
    marginTop: Spacing.lg,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.rule,
  },
  activeKeyLabel: { ...Type.label },
  activeKeyValue: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.small,
    color: Colors.ink,
    flexShrink: 1,
    textAlign: "right",
  },

  about: {
    marginTop: Spacing.md,
    padding: Spacing.lg,
    backgroundColor: Colors.paperDim,
    borderRadius: Radius.plate,
    gap: Spacing.sm,
  },
  aboutName: {
    fontFamily: FontFamily.serifMedium,
    fontSize: FontSize.title,
    letterSpacing: 1,
    color: Colors.ink,
  },
  aboutLine: { ...Type.bodyMuted },
  aboutMeta: { gap: 3, marginTop: Spacing.sm },
  aboutMetaRow: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.label,
    lineHeight: 18,
    color: Colors.inkMuted,
  },
  aboutNote: { ...Type.small, marginTop: Spacing.sm },
});
