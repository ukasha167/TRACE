import { useCallback, useEffect, useRef, useState } from "react";
import type { ApodCacheEntry } from "@/types";
import { fetchApodBatch } from "@/lib/apod/apodBatch";
import { useSettingsStore } from "@/store/useSettingsStore";

export interface ApodBatchState {
  /** Fills in progressively — render from this on every change. */
  entries: Map<string, ApodCacheEntry>;
  loading: boolean;
  fetched: number;
  total: number;
  rateLimited: boolean;
  failed: string[];
  /** Dates NASA has no picture for. */
  missing: string[];
}

/**
 * Drives fetchApodBatch for a list of dates, repainting as each arrives.
 *
 * The consumer must be able to render a complete screen with an EMPTY map —
 * the ledger's moon data is local and instant, and thumbnails are decoration
 * that lands later. Never gate the screen on this hook's loading flag.
 */
export function useApodBatch(dates: string[]): ApodBatchState & { retry: () => void } {
  const nasaApiKey = useSettingsStore((s) => s.nasaApiKey);
  const [state, setState] = useState<ApodBatchState>({
    entries: new Map(),
    loading: false,
    fetched: 0,
    total: 0,
    rateLimited: false,
    failed: [],
    missing: [],
  });

  // Join the dates so the effect re-runs on content change, not identity change.
  const key = dates.join(",");
  const [attempt, setAttempt] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (dates.length === 0) return;

    const controller = new AbortController();
    abortRef.current = controller;
    let alive = true;

    setState((prev) => ({ ...prev, loading: true, rateLimited: false }));

    fetchApodBatch(dates, {
      apiKey:
        nasaApiKey ||
        (typeof process !== "undefined" && process.env.EXPO_PUBLIC_NASA_API_KEY) ||
        undefined,
      signal: controller.signal,
      onProgress: ({ entry, fetched, total }) => {
        if (!alive) return;
        setState((prev) => {
          const entries = new Map(prev.entries);
          entries.set(entry.date, entry);
          return { ...prev, entries, fetched, total };
        });
      },
    })
      .then((result) => {
        if (!alive) return;
        setState((prev) => ({
          // Merge rather than replace: progress callbacks already delivered
          // most of these, and the cached set arrives here in one go.
          entries: new Map([...prev.entries, ...result.entries]),
          loading: false,
          fetched: prev.fetched,
          total: prev.total,
          rateLimited: result.rateLimited,
          failed: result.failed,
          missing: result.missing,
        }));
      })
      .catch(() => {
        if (alive) setState((prev) => ({ ...prev, loading: false }));
      });

    return () => {
      alive = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt, nasaApiKey]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { ...state, retry };
}
