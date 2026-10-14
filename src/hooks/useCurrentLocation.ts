import { useEffect } from "react";
import {
  useLocationStore,
  type LocationPermission,
} from "@/store/useLocationStore";
import type { MilestoneLocation } from "@/types";

let refreshedThisSession = false;

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
  location: MilestoneLocation | null;
  permission: LocationPermission;
  locating: boolean;
  request: () => Promise<MilestoneLocation | null>;
} {
  const location = useLocationStore((s) => s.place);
  const permission = useLocationStore((s) => s.permission);
  const locating = useLocationStore((s) => s.locating);
  const refresh = useLocationStore((s) => s.refresh);

  useEffect(() => {
    if (refreshedThisSession) return;
    refreshedThisSession = true;
    refresh({ ask: false });
  }, [refresh]);

  return {
    location,
    permission,
    locating,
    request: () => refresh({ ask: true }),
  };
}
