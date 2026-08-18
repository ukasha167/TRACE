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
