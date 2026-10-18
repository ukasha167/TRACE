import React, { useCallback } from "react";
import { router, useLocalSearchParams, type Href } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  MilestoneForm,
  type MilestoneFormValues,
} from "@/components/MilestoneForm";
import { useMilestonesStore } from "@/store/useMilestonesStore";
import { useRevealStore } from "@/store/useRevealStore";

const TYPES = ["birthday", "anniversary", "graduation", "custom"] as const;

export default function NewMilestoneScreen() {
  const params = useLocalSearchParams<{ type?: string; date?: string }>();
  const preset = {
    type: TYPES.find((t) => t === params.type),
    date: params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : undefined,
  };
  const addMilestone = useMilestonesStore((s) => s.addMilestone);

  // Saving starts the reveal, closes the form and opens the record under it, so
  // the moon of that night is the first thing saving shows. It used to go back
  // to the list.
  const handleSubmit = useCallback(
    (values: MilestoneFormValues) => {
      const saved = addMilestone(values);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      useRevealStore.getState().show(saved.id);
      router.back();
      router.push(`/milestone/${saved.id}` as Href);
    },
    [addMilestone]
  );

  return (
    <MilestoneForm
      preset={preset}
      submitLabel="Save date"
      onSubmit={handleSubmit}
      onCancel={() => router.back()}
    />
  );
}
