import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { Milestone, MilestoneType } from "@/types";
import { Colors, FontFamily, FontSize, Spacing } from "@/constants/theme";
import { useMilestonesStore } from "@/store/useMilestonesStore";

// Type display config
const TYPE_CONFIG: Record<MilestoneType, { label: string; symbol: string }> = {
  birthday:    { label: "Birthday",    symbol: "🎂" },
  anniversary: { label: "Anniversary", symbol: "💫" },
  graduation:  { label: "Graduation",  symbol: "🎓" },
  custom:      { label: "Custom",      symbol: "✦"  },
};

interface MilestoneListRowProps {
  milestone: Milestone;
  /** Whether to show the ledger line below this row */
  showLine?: boolean;
}

export function MilestoneListRow({ milestone, showLine = true }: MilestoneListRowProps) {
  const deleteMilestone = useMilestonesStore((s) => s.deleteMilestone);
  const config = TYPE_CONFIG[milestone.type];

  const handlePress = () => {
    // Phase 3 will route to the full Cosmic Card detail
    // For now, show a quick action sheet
    Alert.alert(
      milestone.title,
      formatDate(milestone.date),
      [
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Delete milestone?",
              `"${milestone.title}" will be permanently removed.`,
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: () => deleteMilestone(milestone.id),
                },
              ]
            );
          },
        },
        { text: "Dismiss", style: "cancel" },
      ]
    );
  };

  return (
    <View style={styles.wrapper}>
      {/* Ledger node — sits on the vertical line */}
      <View style={styles.ledgerNode}>
        {/* Moon phase placeholder — Phase 3 will replace with computed glyph */}
        <View style={styles.phaseGlyph}>
          <Text style={styles.phaseGlyphText}>☽</Text>
        </View>
        {showLine && <View style={styles.ledgerLineSegment} />}
      </View>

      {/* Card */}
      <TouchableOpacity
        style={styles.card}
        onPress={handlePress}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={`${milestone.title}, ${formatDate(milestone.date)}`}
      >
        {/* Type badge */}
        <View style={styles.badgeRow}>
          <View style={styles.typeBadge}>
            <Text style={styles.typeBadgeText}>
              {config.symbol} {config.label}
            </Text>
          </View>
        </View>

        {/* Title + date */}
        <Text style={styles.title}>{milestone.title}</Text>
        <Text style={styles.date}>{formatDate(milestone.date)}</Text>

        {/* Notes preview */}
        {milestone.notes ? (
          <Text style={styles.notes} numberOfLines={2}>
            {milestone.notes}
          </Text>
        ) : null}
      </TouchableOpacity>
    </View>
  );
}

function formatDate(dateStr: string): string {
  // Parse manually to avoid timezone shift — same principle as toLocalNoon
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: "row",
    marginBottom: Spacing.md,
  },

  // ---- Ledger column ----
  ledgerNode: {
    width: 32,
    alignItems: "center",
  },
  phaseGlyph: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.ember,
    backgroundColor: Colors.blueprintLight,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  phaseGlyphText: {
    fontSize: 15,
    color: Colors.starlight,
  },
  ledgerLineSegment: {
    flex: 1,
    width: 1,
    backgroundColor: Colors.cyanotype,
    opacity: 0.25,
    marginTop: 2,
  },

  // ---- Card ----
  card: {
    flex: 1,
    marginLeft: Spacing.md,
    backgroundColor: Colors.blueprintLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cyanotype + "44",
    padding: Spacing.md,
    marginBottom: 4,
  },
  badgeRow: {
    flexDirection: "row",
    marginBottom: Spacing.xs + 2,
  },
  typeBadge: {
    backgroundColor: Colors.blueprint,
    borderRadius: 4,
    paddingHorizontal: Spacing.xs + 2,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.cyanotype + "55",
  },
  typeBadgeText: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.xs,
    color: Colors.cyanotype,
    letterSpacing: 0.5,
  },
  title: {
    fontFamily: FontFamily.displaySemiBold,
    fontSize: FontSize.lg,
    color: Colors.starlight,
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  date: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.sm,
    color: Colors.cyanotype,
  },
  notes: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.sm,
    color: Colors.cyanotype,
    opacity: 0.7,
    marginTop: Spacing.xs,
    lineHeight: 18,
  },
});
