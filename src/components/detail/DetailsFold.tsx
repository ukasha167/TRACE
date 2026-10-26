import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import Animated, { FadeIn, ReduceMotion } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Colors, Spacing, Type, FontFamily, FontSize, Motion } from "@/constants/theme";
import { lenis } from "@/lib/glide";

interface Props {
  rows: { label: string; value: string }[];
}

/**
 * THE NUMBERS, folded away.
 *
 * Tilt in degrees, the time zone, the note about where the exact full fell:
 * every one is true and stays on the page, because rule 1 is that the figures
 * are there for anyone who wants to check them. They just no longer lead. The
 * page opens on what the night was like, and the instrument readings are one
 * tap down.
 */
export function DetailsFold({ rows }: Props) {
  const [open, setOpen] = useState(false);
  const Icon = open ? ChevronUp : ChevronDown;

  return (
    <View style={styles.section}>
      <Pressable
        onPress={() => {
          Haptics.selectionAsync();
          setOpen((o) => !o);
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.toggle, pressed && { opacity: 0.6 }]}
      >
        <Text style={styles.toggleText}>The numbers</Text>
        <Icon size={18} color={Colors.inkMuted} strokeWidth={2} />
      </Pressable>
      {open && (
        <Animated.View entering={FadeIn.duration(Motion.duration).easing(lenis).reduceMotion(ReduceMotion.System)}>
          {rows.map((row) => (
            <View key={row.label} style={styles.row}>
              <Text style={styles.label}>{row.label}</Text>
              <Text style={styles.value}>{row.value}</Text>
            </View>
          ))}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: Spacing.lg },
  toggle: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.rule,
  },
  toggleText: { fontFamily: FontFamily.medium, fontSize: FontSize.body, color: Colors.ink },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: Spacing.md,
    paddingVertical: Spacing.sm + 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.rule,
  },
  label: { ...Type.small, flexShrink: 0, maxWidth: "48%" },
  value: { ...Type.small, color: Colors.ink, flexShrink: 1, textAlign: "right" },
});
