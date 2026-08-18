import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Colors, FontFamily, FontSize, Spacing } from "@/constants/theme";

/** Placeholder — Settings: NASA API key override, distance unit toggle, about/credits. */
export default function SettingsScreen() {
  return (
    <View style={styles.root}>
      <Text style={styles.label}>SETTINGS</Text>
      <Text style={styles.title}>Coming soon</Text>
      <Text style={styles.body}>
        NASA API key override, distance unit toggle (ly / km), and about/credits — Phase 2+.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.blueprint,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xl,
    alignItems: "center",
  },
  label: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.xs,
    color: Colors.cyanotype,
    letterSpacing: 2,
    marginBottom: Spacing.sm,
  },
  title: {
    fontFamily: FontFamily.displaySemiBold,
    fontSize: FontSize.xxl,
    color: Colors.starlight,
    marginBottom: Spacing.md,
  },
  body: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
    color: Colors.cyanotype,
    textAlign: "center",
    lineHeight: 22,
  },
});
