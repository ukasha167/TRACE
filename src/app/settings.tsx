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
import Constants from "expo-constants";
import {
  Colors,
  FontFamily,
  FontSize,
  Spacing,
  Radius,
  Type,
} from "@/constants/theme";
import { Arrive } from "@/components/Arrive";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useBackup } from "@/hooks/useBackup";
import { sendTestReminder } from "@/hooks/useReminders";

/**
 * SETTINGS, which is mostly a colophon.
 *
 * WHAT WAS WRONG WITH IT. The screen opened on "NASA image key", a masked
 * secure field, a status dot, and a paragraph about a 30-requests-an-hour rate
 * limit. All of that is true and almost none of it is addressed to the person
 * using the app. Someone who came here to find out what TRACE is met a
 * configuration form for a service they have never heard of, in the vocabulary
 * of the people who wrote it.
 *
 * There is exactly one setting in this app. A screen with one setting is not a
 * settings screen, it is an about page that happens to hold a key, so it is
 * built as one: what the app does, what stays on the phone, how to keep the
 * records and try a reminder, where the numbers come from, and then the key,
 * folded away.
 *
 * THE KEY STILL HAS TO ANNOUNCE ITSELF. Burying it completely would be the
 * opposite mistake: the shared key really does run out, and when it does the
 * ledger quietly stops filling in pictures. So the row states which key is in
 * use in plain words, and says so most plainly in the case that can actually
 * bite. Disclosure is not concealment.
 *
 * The old screen also painted backgrounds with Colors.rule (a hairline colour
 * used as a fill) and built translucency by concatenating hex onto tokens. It
 * is all paper, paperDim and the pill now.
 */
export default function SettingsScreen() {
  const nasaApiKey = useSettingsStore((s) => s.nasaApiKey);
  const setNasaApiKey = useSettingsStore((s) => s.setNasaApiKey);

  // Local draft for the key input, only committed on save.
  const [keyDraft, setKeyDraft] = useState(nasaApiKey ?? "");
  const [keyVisible, setKeyVisible] = useState(false);
  const [keySaved, setKeySaved] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false);

  const envKey =
    typeof process !== "undefined"
      ? process.env.EXPO_PUBLIC_NASA_API_KEY ?? null
      : null;

  // The active key (the stored override beats the env value).
  const activeKey = nasaApiKey || envKey || "DEMO_KEY";
  const usingEnv = !nasaApiKey && !!envKey;
  const usingDemo = !nasaApiKey && !envKey;

  const version = Constants.expoConfig?.version ?? null;
  const backup = useBackup();
  const [testSent, setTestSent] = useState<null | "sent" | "blocked" | "unavailable">(null);

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
      "Remove your key?",
      usingEnv
        ? "TRACE will go back to the key set in your environment."
        : "TRACE will use the shared key for recent pictures. Older pictures use NASA's archive.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
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
        {/* ---- What this is ---- */}
        <Arrive>
          <Text style={styles.thesis}>
            The sky keeps a schedule, and it happens to line up with the dates
            you care about.
          </Text>
        </Arrive>

        {/* ---- What stays on the phone ---- */}
        <Arrive delay={80}>
          <Text style={[styles.label, styles.spaced]}>On this phone</Text>
          <View style={styles.block}>
            <Text style={styles.blockLead}>
              The moon, its tilt, how rare that sky was and the years it comes
              back are all worked out here, on the device, from the date you
              gave it. None of it needs a signal.
            </Text>
            <View style={styles.factRow}>
              <Text style={styles.factKey}>Account</Text>
              <Text style={styles.factValue}>None</Text>
            </View>
            <View style={styles.factRow}>
              <Text style={styles.factKey}>Tracking</Text>
              <Text style={styles.factValue}>None</Text>
            </View>
            {/* Said exactly. This row used to read "Your dates and places:
                never leave the phone", and both do leave it, each for one
                purpose the person asked for. */}
            <View style={styles.factRow}>
              <Text style={styles.factKey}>Your dates</Text>
              <Text style={styles.factValue}>Kept on this phone only</Text>
            </View>
            <View style={styles.factRow}>
              <Text style={styles.factKey}>A place you search for</Text>
              <Text style={styles.factValue}>Sent to Apple or Google to find it</Text>
            </View>
            <View style={styles.factRow}>
              <Text style={styles.factKey}>Your location</Text>
              <Text style={styles.factValue}>Sent to Apple or Google for its name</Text>
            </View>
            <View style={styles.factRow}>
              <Text style={styles.factKey}>A saved date</Text>
              <Text style={styles.factValue}>Sent to NASA for that day's picture</Text>
            </View>
          </View>
        </Arrive>

        {/* ---- Keeping them ---- */}
        <Arrive delay={120}>
          <Text style={[styles.label, styles.spaced]}>Keeping your dates</Text>
          <Text style={styles.sectionNote}>
            They live only on this phone, so a lost phone or a deleted app takes
            them with it. A backup is one small file you keep wherever you keep
            files. Restoring adds the dates that are missing and leaves the
            ones already here as they are.
          </Text>
          <View style={styles.actionRow}>
            <Pressable
              style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
              onPress={backup.save}
              disabled={backup.busy !== null}
              accessibilityRole="button"
            >
              <Text style={styles.actionText}>
                {backup.busy === "save" ? "Saving" : "Save a backup"}
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
              onPress={backup.restore}
              disabled={backup.busy !== null}
              accessibilityRole="button"
            >
              <Text style={styles.actionText}>
                {backup.busy === "restore" ? "Reading" : "Restore"}
              </Text>
            </Pressable>
          </View>

          <Text style={[styles.label, styles.spaced]}>Reminders</Text>
          <Text style={styles.sectionNote}>
            A date with its bell on sends one notification at 19:00 on its
            date. This sends the soonest one now, ten seconds from the tap, so
            you can see what arrives.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.actionButton, styles.actionSingle, pressed && styles.pressed]}
            onPress={async () => setTestSent(await sendTestReminder())}
            accessibilityRole="button"
          >
            <Text style={styles.actionText}>
              {testSent === "sent"
                ? "Sent. It arrives in ten seconds"
                : testSent === "blocked"
                  ? "Notifications are off for TRACE"
                  : testSent === "unavailable"
                    ? "Not available in Expo Go on Android"
                    : "Send a test reminder"}
            </Text>
          </Pressable>
        </Arrive>

        {/* ---- Where the numbers come from ---- */}
        <Arrive delay={160}>
          <Text style={[styles.label, styles.spaced]}>
            Where the numbers come from
          </Text>
          <View style={styles.sources}>
            <SourceRow subject="Moon and sun" source="SunCalc 2" />
            <SourceRow subject="Planets" source="astronomy-engine" />
            <SourceRow subject="Stars" source="Yale Bright Star Catalog" />
            <SourceRow subject="Star names" source="IAU WGSN" />
            <SourceRow subject="Constellation lines" source="d3-celestial" />
            <SourceRow subject="Lunar surface" source="NASA LRO" />
            <SourceRow subject="Daily picture" source="NASA APOD" />
          </View>
          {/* The Free Art License requires this credit to stay visible in the
              app. See assets/constellations/ATTRIBUTION.md. */}
          <Text style={styles.license}>
            Constellation drawings by Johan Meuris for Stellarium, under the Free
            Art License 1.3 at artlibre.org. Their placement data comes from the
            Stellarium team under CC BY-SA 4.0.
          </Text>
        </Arrive>

        {/* ---- The one setting ---- */}
        <Arrive delay={240}>
          <Text style={[styles.label, styles.spaced]}>Pictures from NASA</Text>

          <Pressable
            style={({ pressed }) => [styles.disclosure, pressed && styles.pressed]}
            onPress={() => setKeyOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: keyOpen }}
            accessibilityLabel="NASA picture key settings"
          >
            <View style={styles.disclosureText}>
              <Text style={styles.disclosureTitle}>
                {usingDemo
                  ? "Using the shared key"
                  : usingEnv
                  ? "Using the key from your environment"
                  : "Using your own key"}
              </Text>
              <Text style={styles.disclosureNote}>
                {usingDemo
                  ? "Recent pictures use a shared key with a request limit. Older pictures come from the archive and do not need a key."
                  : "This key is used for recent pictures and when the archive cannot answer."}
              </Text>
            </View>
            <Text style={styles.disclosureChevron}>{keyOpen ? "−" : "+"}</Text>
          </Pressable>

          {keyOpen && (
            <View style={styles.keyPanel}>
              <Text style={styles.help}>
                Keys are free at api.nasa.gov. TRACE only ever sends it to NASA,
                and it is stored on this phone.
              </Text>

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
                  style={({ pressed }) => [
                    styles.saveButton,
                    pressed && styles.pressed,
                  ]}
                  onPress={handleSaveKey}
                  accessibilityRole="button"
                >
                  <Text style={styles.saveButtonText}>
                    {keySaved ? "Saved" : "Save key"}
                  </Text>
                </Pressable>
                {nasaApiKey && (
                  <Pressable
                    style={({ pressed }) => [
                      styles.clearButton,
                      pressed && styles.pressed,
                    ]}
                    onPress={handleClearKey}
                    accessibilityRole="button"
                  >
                    <Text style={styles.clearButtonText}>Remove</Text>
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
            </View>
          )}
        </Arrive>

        {/* ---- Colophon ---- */}
        <Arrive delay={320}>
          <View style={styles.colophon}>
            <Text style={styles.colophonName}>TRACE</Text>
            {version && <Text style={styles.colophonVersion}>{version}</Text>}
          </View>
        </Arrive>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** One credit line. The subject reads as prose, the source as a proper noun. */
function SourceRow({ subject, source }: { subject: string; source: string }) {
  return (
    <View style={styles.sourceRow}>
      <Text style={styles.sourceSubject}>{subject}</Text>
      <Text style={styles.sourceName}>{source}</Text>
    </View>
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
  help: { ...Type.small },

  // The screen opens on the app's own sentence, in its own voice, at a size
  // that makes it the subject rather than a caption.
  thesis: {
    fontFamily: FontFamily.serif,
    fontSize: FontSize.heading,
    lineHeight: 32,
    letterSpacing: -0.2,
    color: Colors.ink,
  },

  block: {
    marginTop: Spacing.md,
    padding: Spacing.lg,
    backgroundColor: Colors.paperDim,
    borderRadius: Radius.plate,
  },
  blockLead: { ...Type.bodyMuted },
  factRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: Spacing.md,
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.rule,
  },
  factKey: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.small,
    color: Colors.inkMuted,
    flexShrink: 1,
  },
  factValue: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.small,
    color: Colors.ink,
    flexShrink: 1,
    textAlign: "right",
  },

  sectionNote: { ...Type.small, marginTop: Spacing.sm },
  actionRow: { flexDirection: "row", gap: Spacing.sm, marginTop: Spacing.md },
  actionButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    backgroundColor: Colors.paperDim,
  },
  actionSingle: { marginTop: Spacing.md },
  actionText: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.small,
    color: Colors.ink,
    textAlign: "center",
  },

  sources: { marginTop: Spacing.sm },
  license: { ...Type.small, marginTop: Spacing.md },
  sourceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.rule,
  },
  sourceSubject: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.small,
    color: Colors.inkMuted,
    flexShrink: 1,
  },
  sourceName: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.small,
    color: Colors.ink,
    flexShrink: 1,
    textAlign: "right",
  },

  disclosure: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.md,
    marginTop: Spacing.md,
    padding: Spacing.lg,
    backgroundColor: Colors.paperDim,
    borderRadius: Radius.plate,
  },
  disclosureText: { flex: 1, gap: Spacing.xs },
  disclosureTitle: {
    fontFamily: FontFamily.medium,
    fontSize: FontSize.body,
    color: Colors.ink,
  },
  disclosureNote: { ...Type.small },
  disclosureChevron: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.lead,
    lineHeight: 22,
    color: Colors.inkMuted,
  },

  keyPanel: { marginTop: Spacing.md, gap: Spacing.md },

  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
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

  keyActions: { flexDirection: "row", gap: Spacing.sm },
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

  colophon: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: Spacing.md,
    marginTop: Spacing.xl,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.rule,
  },
  colophonName: {
    fontFamily: FontFamily.serifMedium,
    fontSize: FontSize.lead,
    letterSpacing: 1,
    color: Colors.ink,
  },
  colophonVersion: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.label,
    color: Colors.inkMuted,
  },
});
