import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Colors, Spacing, Type, FontFamily, FontSize, sectionNumber } from "@/constants/theme";

/**
 * The repeating structural device: a zero-padded section number, a hairline
 * rule, and an uppercase mono label. Lifted from record sheets and printed
 * plate captions — it is what makes a stack of sections read as one document
 * rather than a pile of cards.
 */
export function SectionHeader({ n, label }: { n: number; label: string }) {
  return (
    <View style={styles.root}>
      <View style={styles.topLine}>
        <Text style={styles.number}>{sectionNumber(n)}</Text>
        <View style={styles.rule} />
      </View>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { marginBottom: Spacing.md },
  topLine: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  number: {
    fontFamily: FontFamily.monoMedium,
    fontSize: FontSize.label,
    color: Colors.signal,
  },
  rule: { flex: 1, height: 1, backgroundColor: Colors.ink },
  label: { ...Type.label, color: Colors.ink, marginTop: Spacing.sm },
});
