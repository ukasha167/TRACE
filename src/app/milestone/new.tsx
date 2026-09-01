import React, { useCallback } from "react";
import { router } from "expo-router";
import {
  MilestoneForm,
  type MilestoneFormValues,
} from "@/components/MilestoneForm";
import { useMilestonesStore } from "@/store/useMilestonesStore";

export default function NewMilestoneScreen() {
  const addMilestone = useMilestonesStore((s) => s.addMilestone);

  const handleSubmit = useCallback(
    (values: MilestoneFormValues) => {
      addMilestone(values);
      router.back();
    },
    [addMilestone]
  );

  return (
    <MilestoneForm
      submitLabel="SAVE RECORD"
      onSubmit={handleSubmit}
      onCancel={() => router.back()}
    />
  );
}
