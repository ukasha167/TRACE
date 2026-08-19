import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ApodCacheEntry } from "@/types";

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
    return JSON.parse(raw) as ApodCacheEntry;
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
