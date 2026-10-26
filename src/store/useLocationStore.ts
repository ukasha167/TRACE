import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import type { MilestoneLocation } from "@/types";

/**
 * WHERE THE PHONE IS, READ ONCE AND REMEMBERED.
 *
 * This used to be a hook with its own effect, and Home and the sky screen each
 * mounted a copy: two permission requests, two GPS fixes and two reverse
 * geocodes for one question. Worse, Home asked for permission the moment the
 * app opened, so the first thing a new person saw was a system dialog about a
 * screen they had not seen yet.
 *
 * Now there is one store. The last place found is persisted, so Home names it on
 * the first frame of every later launch. A quiet refresh runs at most once a
 * session and only if permission was already granted. The system dialog appears
 * only when someone asks for their location by tapping something that says so.
 */

export type LocationPermission = "unknown" | "granted" | "denied";

interface LocationState {
  /** The last place this phone was found at. Persisted. */
  place: MilestoneLocation | null;
  permission: LocationPermission;
  locating: boolean;
  /**
   * Finds the phone. `ask: true` may show the system permission dialog, so only
   * pass it from something the person tapped. Returns the place, or null when
   * permission is missing or the fix failed.
   */
  refresh: (options?: { ask?: boolean }) => Promise<MilestoneLocation | null>;
}

let inFlight: Promise<MilestoneLocation | null> | null = null;

export const useLocationStore = create<LocationState>()(
  persist(
    (set, get) => ({
      place: null,
      permission: "unknown",
      locating: false,

      refresh: ({ ask = false } = {}) => {
        if (inFlight) return inFlight;
        inFlight = (async () => {
          try {
            let { status } = await Location.getForegroundPermissionsAsync();
            if (status !== "granted" && ask) {
              status = (await Location.requestForegroundPermissionsAsync()).status;
            }
            if (status !== "granted") {
              set({ permission: status === "denied" ? "denied" : "unknown" });
              return null;
            }
            set({ permission: "granted", locating: true });

            const pos = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            const { latitude, longitude } = pos.coords;

            // Keep the previous name if the geocoder fails and the phone has not
            // moved far. Coordinates are the payload; the label is a courtesy.
            const previous = get().place;
            const near =
              previous &&
              Math.abs(previous.latitude - latitude) < 0.05 &&
              Math.abs(previous.longitude - longitude) < 0.05;
            let label = near
              ? previous.label
              : `${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°`;
            try {
              const [geo] = await Location.reverseGeocodeAsync({ latitude, longitude });
              const parts = geo ? [geo.city, geo.region, geo.country].filter(Boolean) : [];
              if (parts.length) label = parts.join(", ");
            } catch {
              // Offline, or the geocoder is rate limited. The fallback stands.
            }

            const place: MilestoneLocation = {
              latitude,
              longitude,
              label,
              // The phone's own offset, which for "here, tonight" is exact.
              timezoneOffsetMin: -new Date().getTimezoneOffset(),
            };
            // The same spot again keeps the same object. A fresh object for a
            // fix within 0.01 degrees (about 1 km) rebuilt an open sky and
            // re-rendered Home; the moon's parallax across 1 km is half an
            // arcsecond.
            const latest = get().place;
            if (
              latest &&
              Math.abs(latest.latitude - latitude) < 0.01 &&
              Math.abs(latest.longitude - longitude) < 0.01 &&
              latest.label === place.label &&
              latest.timezoneOffsetMin === place.timezoneOffsetMin
            ) {
              return latest;
            }
            set({ place });
            return place;
          } catch {
            return get().place;
          } finally {
            set({ locating: false });
            inFlight = null;
          }
        })();
        return inFlight;
      },
    }),
    {
      name: "current-place",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ place: s.place }),
    }
  )
);
