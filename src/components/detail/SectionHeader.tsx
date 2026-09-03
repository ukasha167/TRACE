import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Colors, Spacing, Type } from "@/constants/theme";

/**
 * The repeating structural device: a hairline across the page, then a small
 * uppercase label beneath it. Repeating it is what makes a long scroll read as
 * one document rather than a pile of cards.
 *
 * It used to open with a zero-padded section number in signal red (001, 002).
 * The number was assigned at render time from whichever sections happened to
 * qualify, so it encoded nothing a reader could rely on, and it was the loudest
 * element in a screen that should stay quiet. Gone.
 */
export function SectionHeader({ label }: { label: string }) {
  return (
    <View style={styles.root}>
      <View style={styles.rule} />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { marginBottom: Spacing.md },
  rule: { height: 1, backgroundColor: Colors.rule },
  label: { ...Type.label, marginTop: Spacing.md },
});
