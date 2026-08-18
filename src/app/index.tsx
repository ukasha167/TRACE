import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
} from "react-native";
import { Link, router, type Href } from "expo-router";
import { Colors, FontFamily, FontSize, Spacing } from "@/constants/theme";
import { useMilestonesStore } from "@/store/useMilestonesStore";
import { MilestoneListRow } from "@/components/MilestoneListRow";

// Typed routes are generated at dev-server startup. Cast until then.
const route = (path: string) => path as Href;

export default function HomeScreen() {
  const milestones = useMilestonesStore((s) => s.milestones);

  const isEmpty = milestones.length === 0;

  return (
    <View style={styles.root}>
      {/* Utility bar — quick links */}
      <View style={styles.utilityBar}>
        <Link href={route("/age-converter")} asChild>
          <TouchableOpacity style={styles.utilityButton} accessibilityRole="button">
            <Text style={styles.utilityButtonText}>🪐 Planetary Ages</Text>
          </TouchableOpacity>
        </Link>
        <Link href={route("/settings")} asChild>
          <TouchableOpacity style={styles.utilityButton} accessibilityRole="button">
            <Text style={styles.utilityButtonText}>⚙︎</Text>
          </TouchableOpacity>
        </Link>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          isEmpty && styles.scrollContentEmpty,
        ]}
        showsVerticalScrollIndicator={false}
      >
        {isEmpty ? (
          /* ---- Empty state ---- */
          <View style={styles.ledgerContainer}>
            <View style={styles.ledgerLine} />
            <View style={styles.emptyStateWrapper}>
              <View style={styles.moonGlyphPlaceholder}>
                <Text style={styles.moonGlyphText}>☽</Text>
              </View>
              <View style={styles.emptyTextBlock}>
                <Text style={styles.emptyHeadline}>No milestones yet</Text>
                <Text style={styles.emptyBody}>
                  Every important date in your life has a cosmic story — the moon's
                  phase, the NASA image featured that day, how far light has
                  traveled since you were born.
                </Text>
                <TouchableOpacity
                  style={styles.addButton}
                  accessibilityRole="button"
                  accessibilityLabel="Add your first milestone"
                  onPress={() => router.push(route("/milestone/new"))}
                >
                  <Text style={styles.addButtonText}>+ Add your first milestone</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : (
          /* ---- Milestone list ---- */
          <View style={styles.ledgerContainer}>
            {/* Count header */}
            <View style={styles.listHeader}>
              <Text style={styles.listCount}>
                {milestones.length} {milestones.length === 1 ? "milestone" : "milestones"}
              </Text>
              <Text style={styles.listSortLabel}>Most recent first</Text>
            </View>

            {/* Ledger line behind the rows */}
            <View style={styles.ledgerLine} />

            {/* Rows */}
            {milestones.map((milestone, index) => (
              <MilestoneListRow
                key={milestone.id}
                milestone={milestone}
                showLine={index < milestones.length - 1}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        accessibilityRole="button"
        accessibilityLabel="Add milestone"
        onPress={() => router.push(route("/milestone/new"))}
      >
        <Text style={styles.fabIcon}>☽</Text>
        <Text style={styles.fabLabel}>New</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.blueprint,
  },
  utilityBar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.cyanotype + "33",
  },
  utilityButton: {
    paddingHorizontal: Spacing.sm + 4,
    paddingVertical: Spacing.xs + 2,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.cyanotype + "55",
    backgroundColor: Colors.blueprintLight,
  },
  utilityButtonText: {
    fontFamily: FontFamily.sansMedium,
    fontSize: FontSize.sm,
    color: Colors.cyanotype,
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    paddingBottom: 120,
  },
  scrollContentEmpty: {
    flexGrow: 1,
  },

  // ---- Ledger container ---- (shared by empty and list states)
  ledgerContainer: {
    flex: 1,
    paddingLeft: Spacing.xs,
    position: "relative",
  },
  ledgerLine: {
    position: "absolute",
    left: 16,
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: Colors.cyanotype,
    opacity: 0.2,
  },

  // ---- Empty state ----
  emptyStateWrapper: {
    paddingLeft: Spacing.xl + Spacing.sm,
    paddingTop: Spacing.sm,
    alignItems: "flex-start",
  },
  moonGlyphPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.ember,
    backgroundColor: Colors.blueprintLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
    marginLeft: -(Spacing.xl + Spacing.sm) - 16 + 16, // align to ledger line
  },
  moonGlyphText: {
    fontSize: 16,
    color: Colors.starlight,
  },
  emptyTextBlock: {
    gap: Spacing.sm,
  },
  emptyHeadline: {
    fontFamily: FontFamily.displaySemiBold,
    fontSize: FontSize.xl,
    color: Colors.starlight,
    letterSpacing: -0.3,
  },
  emptyBody: {
    fontFamily: FontFamily.sans,
    fontSize: FontSize.md,
    color: Colors.cyanotype,
    lineHeight: 22,
    maxWidth: 300,
  },
  addButton: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.ember,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  addButtonText: {
    fontFamily: FontFamily.sansSemiBold,
    fontSize: FontSize.md,
    color: "#fff",
    letterSpacing: 0.2,
  },

  // ---- List header ----
  listHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: Spacing.md,
    paddingLeft: Spacing.xl + Spacing.sm,
  },
  listCount: {
    fontFamily: FontFamily.displaySemiBold,
    fontSize: FontSize.lg,
    color: Colors.starlight,
  },
  listSortLabel: {
    fontFamily: FontFamily.mono,
    fontSize: FontSize.xs,
    color: Colors.cyanotype,
    opacity: 0.6,
  },

  // ---- FAB ----
  fab: {
    position: "absolute",
    bottom: Spacing.xl + 8,
    right: Spacing.lg,
    backgroundColor: Colors.ember,
    borderRadius: 28,
    width: 72,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: Colors.ember,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: Spacing.md,
  },
  fabIcon: {
    fontSize: 18,
    color: "#fff",
  },
  fabLabel: {
    fontFamily: FontFamily.sansBold,
    fontSize: FontSize.sm,
    color: "#fff",
    letterSpacing: 0.3,
  },
});
