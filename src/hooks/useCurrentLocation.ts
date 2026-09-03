import { useState, useEffect } from "react";
import * as Location from "expo-location";
import type { MilestoneLocation } from "@/types";

export function useCurrentLocation(): {
  location: MilestoneLocation | null;
  loading: boolean;
} {
  const [location, setLocation] = useState<MilestoneLocation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function fetchLocation() {
      try {
        let { status } = await Location.getForegroundPermissionsAsync();
        if (status !== "granted") {
          const res = await Location.requestForegroundPermissionsAsync();
          status = res.status;
        }

        if (status !== "granted") {
          if (active) setLoading(false);
          return;
        }

        // Try fast cached position first
        const last = await Location.getLastKnownPositionAsync();
        if (last && active) {
          setLocation({
            latitude: last.coords.latitude,
            longitude: last.coords.longitude,
            label: "Current Location",
            timezoneOffsetMin: -new Date().getTimezoneOffset(),
          });
        }

        // Get fresh position
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        if (!active) return;
        const { latitude, longitude } = pos.coords;
        let label = `${latitude.toFixed(2)}°, ${longitude.toFixed(2)}°`;

        try {
          const [geo] = await Location.reverseGeocodeAsync({
            latitude,
            longitude,
          });
          if (geo) {
            const parts = [geo.city, geo.region, geo.country].filter(Boolean);
            if (parts.length) label = parts.join(", ");
          }
        } catch {
          // Reverse geocoding is a nicety; coordinates are the payload
        }

        if (active) {
          setLocation({
            latitude,
            longitude,
            label,
            timezoneOffsetMin: -new Date().getTimezoneOffset(),
          });
        }
      } catch {
        // Location unavailable
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchLocation();

    return () => {
      active = false;
    };
  }, []);

  return { location, loading };
}
