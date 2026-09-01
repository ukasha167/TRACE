import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
} from "react-native";
import { router, type Href } from "expo-router";
import { Colors, Spacing, Type, FontFamily, FontSize, Tracking } from "@/constants/theme";
import { SectionHeader } from "./SectionHeader";
import { SkyCanvas } from "../SkyCanvas";
import type { MilestoneLocation } from "@/types";

const route = (path: string) => path as Href;

interface Props {
  n: number;
  milestoneId: string;
  date: Date;
  location: MilestoneLocation;
}

/**
 * The sky over that place, that night — the hero of the detail screen.
 *
 * This is the one thing in the app a global feed can never be: it is specific
 * to the user's own coordinates and instant. It renders only when a location
 * exists; without one the moon section leads instead (spec §10 — a missing
 * location is a first-class state, not an error).
 */
export function SkySection({ n, milestoneId, date, location }: Props) {
  const { width } = useWindowDimensions();
  const size = Math.min(width - Spacing.page * 2, 420);

  return (
    <View style={styles.section}>
      <SectionHeader n={n} label="The sky over that place" />

      <View style={styles.plate}>
        <SkyCanvas date={date} location={location} size={size} />
      </View>

      <View style={styles.metaRow}>
        <Text style={styles.metaKey}>OBSERVED FROM</Text>
        <Text style={styles.metaValue}>{location.label}</Text>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.metaKey}>COORDINATES</Text>
        <Text style={styles.metaValue}>
          {Math.abs(location.latitude).toFixed(2)}°
          {location.latitude >= 0 ? "N" : "S"}{"  "}
          {Math.abs(location.longitude).toFixed(2)}°
          {location.longitude >= 0 ? "E" : "W"}
        </Text>
      </View>

      <TouchableOpacity
        style={styles.immersiveLink}
        onPress={() => router.push(route(`/sky/${milestoneId}`))}
        accessibilityRole="button"
        accessibilityLabel="Open the full sky view"
      >
        <Text style={styles.immersiveText}>STAND UNDER THIS SKY</Text>
        <Text style={styles.immersiveArrow}>&#8594;</Text>
      </TouchableOpacity>

      <Text style={styles.footnote}>
        Zenith at centre, horizon on the rim, north up. Yale Bright Star Catalog
        to magnitude 4.6, with the naked-eye planets marked in red.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: Spacing.xl },
  plate: {
    backgroundColor: Colors.plate,
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: Spacing.md,
    paddingTop: Spacing.sm,
    marginTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.rule,
  },
  metaKey: { ...Type.label },
  metaValue: {
    fontFamily: FontFamily.monoMedium,
    fontSize: FontSize.small,
    color: Colors.ink,
    flexShrink: 1,
    textAlign: "right",
  },
  immersiveLink: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: Colors.ink,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.md,
  },
  immersiveText: {
    fontFamily: FontFamily.monoMedium,
    fontSize: FontSize.small,
    letterSpacing: Tracking.label,
    color: Colors.paper,
  },
  immersiveArrow: {
    fontFamily: FontFamily.regular,
    fontSize: 20,
    color: Colors.signal,
  },
  footnote: { ...Type.small, marginTop: Spacing.sm },
});
