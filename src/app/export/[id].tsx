import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Colors, FontFamily, FontSize, Spacing } from "@/constants/theme";

/** Placeholder — Phase 7 will build the full Skia export card renderer. */
export default function ExportScreen() {
  return (
    <View style={styles.root}>
      <Text style={styles.label}>COMING IN PHASE 7</Text>
      <Text style={styles.title}>Export Card</Text>
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
  },
});
