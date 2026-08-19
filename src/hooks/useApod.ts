import { useState, useEffect, useCallback } from "react";
import type { ApodCacheEntry } from "@/types";
import { fetchApod, type ApodFetchError } from "@/lib/apod/apodClient";
import { getCachedApod, setCachedApod } from "@/lib/apod/apodCache";
import { useSettingsStore } from "@/store/useSettingsStore";

// ---- State shape ----
export type ApodStatus =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: ApodCacheEntry }
  | { status: "video"; data: ApodCacheEntry }    // media_type === "video" — distinct UI state
  | { status: "error"; error: ApodFetchError };

/**
 * Manages the full APOD data lifecycle for a single date:
 *   1. Immediate cache read (synchronous-ish via useEffect)
 *   2. Network fetch on cache miss, using the user's API key if set
 *   3. Write to cache on success
 *   4. Expose a `retry` function for error states
 *
 * Separates `"video"` from `"success"` so callers render distinct UI
 * without conditional branching on `data.mediaType`.
 */
export function useApod(dateStr: string | null): ApodStatus & { retry: () => void } {
  const nasaApiKey = useSettingsStore((s) => s.nasaApiKey);
  const [state, setState] = useState<ApodStatus>({ status: "idle" });
  const [fetchTrigger, setFetchTrigger] = useState(0);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setFetchTrigger((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!dateStr) return;

    let cancelled = false;

    const load = async () => {
      setState({ status: "loading" });

      // 1. Check cache — avoids any network call on re-visits
      const cached = await getCachedApod(dateStr);
      if (cached) {
        if (cancelled) return;
        setState(
          cached.mediaType === "video"
            ? { status: "video", data: cached }
            : { status: "success", data: cached }
        );
        return;
      }

      // 2. Cache miss — fetch from NASA
      // Prefer user's custom key, then env var, then DEMO_KEY
      const apiKey =
        nasaApiKey ||
        (typeof process !== "undefined" && process.env.EXPO_PUBLIC_NASA_API_KEY) ||
        "DEMO_KEY";

      const result = await fetchApod(dateStr, apiKey);
      if (cancelled) return;

      if (!result.ok) {
        setState({ status: "error", error: result.error });
        return;
      }

      // 3. Write to cache before updating state
      await setCachedApod(result.entry);
      if (cancelled) return;

      setState(
        result.entry.mediaType === "video"
          ? { status: "video", data: result.entry }
          : { status: "success", data: result.entry }
      );
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [dateStr, nasaApiKey, fetchTrigger]);

  return { ...state, retry };
}
