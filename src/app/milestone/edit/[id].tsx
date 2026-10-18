import React, { useCallback } from "react";
import { View, Text, StyleSheet } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  MilestoneForm,
  type MilestoneFormValues,
} from "@/components/MilestoneForm";
import { useMilestone, useMilestonesStore } from "@/store/useMilestonesStore";
import { Colors, Spacing, Type } from "@/constants/theme";

export default function EditMilestoneScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const updateMilestone = useMilestonesStore((s) => s.updateMilestone);
  const milestone = useMilestone(id);

  const handleSubmit = useCallback(
    (values: MilestoneFormValues) => {
      updateMilestone(id, values);
      router.back();
    },
    [id, updateMilestone]
  );

  if (!milestone) {
    return (
      <View style={styles.root}>
        <Text style={styles.error}>Date not found.</Text>
      </View>
    );
  }

  return (
    <MilestoneForm
      initial={milestone}
      submitLabel="Save changes"
      onSubmit={handleSubmit}
      onCancel={() => router.back()}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.paper },
  error: { ...Type.body, padding: Spacing.page },
});
