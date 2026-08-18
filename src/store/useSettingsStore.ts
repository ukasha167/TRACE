import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppSettings } from "@/types";

interface SettingsState extends AppSettings {
  setNasaApiKey: (key: string | null) => void;
  setDistanceUnit: (unit: "ly" | "km") => void;
  setHasCompletedOnboarding: (value: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      nasaApiKey: null,
      distanceUnit: "ly",
      hasCompletedOnboarding: false,

      setNasaApiKey: (key) => set({ nasaApiKey: key }),
      setDistanceUnit: (unit) => set({ distanceUnit: unit }),
      setHasCompletedOnboarding: (value) => set({ hasCompletedOnboarding: value }),
    }),
    {
      name: "app-settings",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
