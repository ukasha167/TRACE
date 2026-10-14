import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Which records have their bell on. Only the ids live here; the words and the
 * dates are rebuilt from the records every time, so an edited title or date
 * can never leave a stale notification behind.
 */
interface RemindersState {
  enabled: string[];
  toggle: (id: string) => void;
  set: (id: string, on: boolean) => void;
  /** Drops ids whose record no longer exists. */
  prune: (existing: readonly string[]) => void;
}

export const useRemindersStore = create<RemindersState>()(
  persist(
    (set) => ({
      enabled: [],
      toggle: (id) =>
        set((s) => ({
          enabled: s.enabled.includes(id) ? s.enabled.filter((x) => x !== id) : [...s.enabled, id],
        })),
      set: (id, on) =>
        set((s) => ({
          enabled: on
            ? s.enabled.includes(id) ? s.enabled : [...s.enabled, id]
            : s.enabled.filter((x) => x !== id),
        })),
      prune: (existing) =>
        set((s) => {
          const keep = s.enabled.filter((id) => existing.includes(id));
          return keep.length === s.enabled.length ? s : { enabled: keep };
        }),
    }),
    {
      name: "reminders",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ enabled: s.enabled }),
    }
  )
);
