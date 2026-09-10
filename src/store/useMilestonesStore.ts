import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { Milestone, MilestoneType, MilestoneLocation } from "@/types";

// ---- Actions ----
interface MilestonesActions {
  addMilestone: (input: {
    title: string;
    type: MilestoneType;
    date: string;
    notes?: string;
    location?: MilestoneLocation | null;
  }) => Milestone;
  updateMilestone: (id: string, updates: Partial<Omit<Milestone, "id" | "createdAt">>) => void;
  deleteMilestone: (id: string) => void;
  getMilestone: (id: string) => Milestone | undefined;
}

// ---- State ----
interface MilestonesState {
  milestones: Milestone[];
}

// ---- Store ----
export const useMilestonesStore = create<MilestonesState & MilestonesActions>()(
  persist(
    (set, get) => ({
      milestones: [],

      addMilestone: (input) => {
        const milestone: Milestone = {
          id: Crypto.randomUUID(),
          title: input.title.trim(),
          type: input.type,
          date: input.date,
          location: input.location ?? null,
          notes: input.notes?.trim(),
          createdAt: new Date().toISOString(),
        };
        set((state) => ({
          milestones: [milestone, ...state.milestones],
        }));
        return milestone;
      },

      updateMilestone: (id, updates) => {
        set((state) => ({
          milestones: state.milestones.map((m) =>
            m.id === id ? { ...m, ...updates } : m
          ),
        }));
      },

      deleteMilestone: (id) => {
        set((state) => ({
          milestones: state.milestones.filter((m) => m.id !== id),
        }));
      },

      /**
       * NOT a subscription. Reaching for this from a screen leaves that screen
       * showing whatever the record was when it mounted — see `useMilestone`,
       * which is what a screen wants.
       */
      getMilestone: (id) => {
        return get().milestones.find((m) => m.id === id);
      },
    }),
    {
      name: "milestones",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

/**
 * Subscribe to ONE record.
 *
 * WHY THIS EXISTS. Four screens did this:
 *
 *   const getMilestone = useMilestonesStore((s) => s.getMilestone);
 *   const milestone = getMilestone(id);
 *
 * which reads correctly and subscribes to nothing. The selector returns the
 * ACTION, and an action's identity never changes, so the store notifying its
 * listeners could never re-render those screens. Saving an edit popped back to
 * a detail screen still showing the old title, date and moon; going home and
 * opening the record again remounted it and "fixed" it, which is what made the
 * bug look like a navigation problem rather than a subscription one.
 *
 * The selector has to touch the state the screen depends on. `find` returns the
 * same object identity while the record is untouched, and `updateMilestone`
 * spreads a new object for the one record it changes, so this re-renders
 * exactly the screens showing the record that moved and none of the others.
 */
export function useMilestone(id: string | undefined): Milestone | undefined {
  return useMilestonesStore((s) =>
    id === undefined ? undefined : s.milestones.find((m) => m.id === id)
  );
}
