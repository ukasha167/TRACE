import type { ApodCacheEntry } from "@/types";
import {
  fetchApod,
  FIRST_APOD_DATE,
  type ApodFetchError,
  type ApodFetchResult,
} from "./apodClient";
import {
  getCachedApodBatch,
  setCachedApod,
  getMissingApodBatch,
  markApodMissing,
} from "./apodCache";
import { toDateString } from "@/lib/astronomy/dateUtils";

/**
 * The latest date whose "not found" can be believed. NASA publishes on US
 * Eastern time and refuses dates it has not reached, so anything within two days
 * of now might only be early rather than missing.
 */
export function settledBefore(now: Date = new Date()): string {
  return toDateString(new Date(now.getTime() - 2 * 86_400_000));
}

/**
 * BATCH APOD FETCH — spec §8.5.
 *
 * The life ledger needs one APOD per year of a life: 20-40 requests at once.
 * This is the app's real engineering problem, and the rules that matter are:
 *
 *   1. CACHE FIRST, in ONE round trip. A date fetched once is free forever
 *      (the cache never expires — §9), so a second visit issues zero requests.
 *   2. BOUNDED CONCURRENCY. Forty parallel fetches would burst the rate limit
 *      and stall the UI thread. Five in flight keeps it quick and civil.
 *   3. FAIL THE BATCH ON 429, NOT EACH ITEM. Once the quota is gone every
 *      remaining request is guaranteed to fail; hammering makes it worse and
 *      delays recovery. Stop, report, keep what we already have.
 *   4. REPORT PROGRESS. Rows are already on screen from local moon data, so
 *      each arrival should paint immediately rather than waiting for the set.
 */

const DEFAULT_CONCURRENCY = 5;

export interface ApodBatchProgress {
  entry: ApodCacheEntry;
  fetched: number;
  total: number;
}

export interface ApodBatchResult {
  entries: Map<string, ApodCacheEntry>;
  /** Dates that failed individually (server error, a network drop). */
  failed: string[];
  /** Dates with no picture at all: already known, or found to be so now. */
  missing: string[];
  /** Set when the batch stopped early because the quota ran out. */
  rateLimited: boolean;
}

export interface ApodBatchOptions {
  /**
   * NASA key. MUST be threaded through — fetchApod defaults to DEMO_KEY, which
   * is capped at 30 requests/hour. A 23-row ledger exhausts that on first open,
   * so omitting this looks exactly like "the network is flaky" while actually
   * being a self-inflicted rate limit.
   */
  apiKey?: string;
  concurrency?: number;
  onProgress?: (progress: ApodBatchProgress) => void;
  signal?: AbortSignal;
  /**
   * Seams for tests. The concurrency bound and the 429 circuit breaker are the
   * parts of this module worth proving, and neither is observable without
   * being able to stand in for the network.
   */
  fetcher?: (date: string) => Promise<ApodFetchResult>;
  cacheReader?: (dates: string[]) => Promise<Map<string, ApodCacheEntry>>;
  cacheWriter?: (entry: ApodCacheEntry) => Promise<void>;
  /** Dates already known to have no picture. They are neither fetched nor failed. */
  missingReader?: (dates: string[]) => Promise<Set<string>>;
  missingWriter?: (date: string) => Promise<void>;
  /** "YYYY-MM-DD". A "not found" is only remembered for dates before this. */
  settledBefore?: string;
  /** "YYYY-MM-DD". Dates after it have no picture yet and are not asked for. */
  today?: string;
}

export async function fetchApodBatch(
  dates: string[],
  options: ApodBatchOptions = {}
): Promise<ApodBatchResult> {
  const {
    apiKey,
    concurrency = DEFAULT_CONCURRENCY,
    onProgress,
    signal,
    fetcher = (date: string) => fetchApod(date, apiKey),
    cacheReader = getCachedApodBatch,
    cacheWriter = setCachedApod,
    missingReader = getMissingApodBatch,
    missingWriter = markApodMissing,
    settledBefore: settled = settledBefore(),
    today = toDateString(new Date()),
  } = options;

  // A life that began in 1970 has twenty-five anniversaries before NASA's first
  // picture. Each used to cost a request on the first visit, and on the shared
  // key, at thirty an hour, they spent the quota before any real year was asked.
  const askable = dates.filter((d) => d >= FIRST_APOD_DATE && d <= today);
  const entries = await cacheReader(askable);
  const uncached = askable.filter((d) => !entries.has(d));
  const known = await missingReader(uncached);
  const misses = uncached.filter((d) => !known.has(d));
  const failed: string[] = [];
  const missing: string[] = [...known];
  let rateLimited = false;
  let fetched = 0;

  if (misses.length === 0) return { entries, failed, missing, rateLimited };

  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, misses.length) },
    async () => {
      while (cursor < misses.length) {
        // Stop the whole batch, not just this worker, once the quota is gone
        // or the screen has gone away.
        if (rateLimited || signal?.aborted) return;

        const date = misses[cursor++];
        const result = await fetcher(date);

        if (result.ok) {
          entries.set(date, result.entry);
          await cacheWriter(result.entry);
          fetched++;
          onProgress?.({ entry: result.entry, fetched, total: misses.length });
        } else if (isRateLimit(result.error)) {
          rateLimited = true;
          return;
        } else if (result.error.kind === "not_found") {
          // An answer about the date, not a failure to get one.
          missing.push(date);
          if (date < settled) await missingWriter(date);
        } else {
          failed.push(date);
        }
      }
    }
  );

  await Promise.all(workers);
  return { entries, failed, missing, rateLimited };
}

function isRateLimit(error: ApodFetchError): boolean {
  return error.kind === "rate_limit";
}
