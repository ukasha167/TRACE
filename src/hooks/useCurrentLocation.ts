import { useEffect } from "react";
import {
  useLocationStore,
  type LocationPermission,
} from "@/store/useLocationStore";
import type { MilestoneLocation } from "@/types";

let refreshedThisSession = false;

/**
 * Where "here" is until the phone says otherwise: before anyone has allowed
 * location, after they refused it, or while the first fix has not landed.
 * Without it Home named no place and tonight's sky opened on a request for one.
 * UTC+5 all year, so the offset is exact.
 *
 * It lives here and not in the store, so the store still holds only what the
 * phone reported, and a new record never starts at a place nobody chose.
 */
export const DEFAULT_PLACE: MilestoneLocation = {
  latitude: 31.5204,
  longitude: 74.3587,
  label: "Lahore, Punjab, Pakistan",
  timezoneOffsetMin: 300,
};

/**
 * The phone's place, for screens that show "here".
 *
 * It starts from the place remembered from the last launch and refreshes it
 * quietly once a session, only if permission was already granted. It never opens
 * the permission dialog on its own. `request()` does that, and belongs behind a
 * tap on something that says it will use the location. See useLocationStore for
 * what the per-screen version of this hook used to cost.
 */
export function useCurrentLocation(): {
  location: MilestoneLocation;
  /** `location` is DEFAULT_PLACE, not the phone's own. */
  isDefault: boolean;
  permission: LocationPermission;
  locating: boolean;
  request: () => Promise<MilestoneLocation | null>;
} {
  const place = useLocationStore((s) => s.place);
  const permission = useLocationStore((s) => s.permission);
  const locating = useLocationStore((s) => s.locating);
  const refresh = useLocationStore((s) => s.refresh);

  useEffect(() => {
    if (refreshedThisSession) return;
    refreshedThisSession = true;
    refresh({ ask: false });
  }, [refresh]);

  return {
    location: place ?? DEFAULT_PLACE,
    isDefault: place == null,
    permission,
    locating,
    request: () => refresh({ ask: true }),
  };
}
