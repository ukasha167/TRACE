import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ApodCacheEntry } from "@/types";
import { classifyApod } from "./apodClassify";
import { isPlaceholderApod } from "./apodArchive";

/**
 * Backfills `kind` on entries cached before the §8.3 classifier existed.
 *
 * Without this, every pre-classifier entry reads back with `kind === undefined`,
 * which fails the `kind === "photograph"` check in LedgerRow and renders an
 * empty placeholder over a perfectly good cached image URL. The cache never
 * expires by design (§9), so those entries would stay broken forever.
 *
 * Classification is a regex over text we already hold, so doing it on read is
 * cheaper than a write-back and keeps reads side-effect free.
 */
function hydrate(entry: ApodCacheEntry): ApodCacheEntry {
  if (entry.kind) return entry;
  return {
    ...entry,
    kind: classifyApod({
      mediaType: entry.mediaType,
      explanation: entry.explanation ?? "",
    }),
  };
}

/**
 * Cache key pattern: `apod-cache:YYYY-MM-DD`
 * Cache NEVER expires — APOD data for a historical date doesn't change.
 * Written once on first fetch; read on all subsequent accesses.
 */
const cacheKey = (dateStr: string) => `apod-cache:${dateStr}`;

/**
 * Reads a cached APOD entry for the given date.
 * Returns null if not cached or if JSON parsing fails (treat as cache miss).
 */
export async function getCachedApod(dateStr: string): Promise<ApodCacheEntry | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(dateStr));
    if (!raw) return null;
    const entry = JSON.parse(raw) as ApodCacheEntry;
    // NASA's logo, cached while the API was handing it out for every date.
    // Read as a miss, so the next fetch finds the real picture and replaces it.
    if (isPlaceholderApod(entry)) return null;
    return hydrate(entry);
  } catch {
    // Corrupt cache entry — treat as miss
    return null;
  }
}

/**
 * Writes an APOD entry to the cache.
 * Silently swallows write errors — a failed cache write is not fatal.
 */
export async function setCachedApod(entry: ApodCacheEntry): Promise<void> {
  try {
    await AsyncStorage.setItem(cacheKey(entry.date), JSON.stringify(entry));
  } catch {
    // Non-fatal — device may be out of storage; next fetch will try again
  }
}

/**
 * Dates NASA has answered "no picture" for, remembered so they are not asked
 * again. APOD starts on 16 June 1995 and has gaps, so a ledger for anyone born
 * before that re-requested every one of those years on every visit, spending the
 * shared key's thirty an hour on answers that cannot change.
 *
 * Callers only record dates that are safely in the past. NASA also says "no" to
 * dates it has not reached yet, and remembering one of those would hide a
 * picture that turns up next week.
 */
const missingKey = (dateStr: string) => `apod-missing:${dateStr}`;

export async function markApodMissing(dateStr: string): Promise<void> {
  try {
    await AsyncStorage.setItem(missingKey(dateStr), "1");
  } catch {
    // Non-fatal. The worst case is one more request next time.
  }
}

/** Which of these dates are known to have no picture, in one round trip. */
export async function getMissingApodBatch(dateStrs: string[]): Promise<Set<string>> {
  const missing = new Set<string>();
  if (dateStrs.length === 0) return missing;
  try {
    const pairs = await AsyncStorage.multiGet(dateStrs.map(missingKey));
    pairs.forEach(([, value], i) => {
      if (value) missing.add(dateStrs[i]);
    });
  } catch {
    // Unreadable means unknown, and unknown dates simply get requested.
  }
  return missing;
}

/**
 * Reads many cached entries in one AsyncStorage round trip.
 *
 * The life ledger asks for 20-40 dates at once; issuing that many individual
 * getItem calls is the difference between one bridge crossing and forty.
 * Corrupt entries are dropped silently and simply read as cache misses.
 */
export async function getCachedApodBatch(
  dateStrs: string[]
): Promise<Map<string, ApodCacheEntry>> {
  const found = new Map<string, ApodCacheEntry>();
  if (dateStrs.length === 0) return found;
  try {
    const pairs = await AsyncStorage.multiGet(dateStrs.map(cacheKey));
    for (const [, raw] of pairs) {
      if (!raw) continue;
      try {
        const entry = JSON.parse(raw) as ApodCacheEntry;
        // See getCachedApod: the cached logo is a miss, not a picture.
        if (entry?.date && !isPlaceholderApod(entry)) found.set(entry.date, hydrate(entry));
      } catch {
        // Corrupt entry — treat as a miss.
      }
    }
  } catch {
    // Whole read failed — every date is simply a miss.
  }
  return found;
}
