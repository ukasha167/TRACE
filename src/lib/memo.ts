/**
 * A small least-recently-used cache keyed by a string. Pure: no React, no RN.
 *
 * Everything this app computes about a night is a pure function of its date
 * and place, so a result is cached in memory and rebuilt on the next run rather
 * than read back from disk. Rebuilding takes milliseconds; a disk read on a cold
 * launch takes longer than that. The only disk cache is NASA's pictures, which
 * come over the network.
 */
export interface Lru<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): T;
  /** The cached value for `key`, computing and storing it on a miss. */
  through(key: string, compute: () => T): T;
  keys(): string[];
}

export function lru<T>(capacity: number): Lru<T> {
  // A Map iterates in insertion order, so deleting and re-inserting on a hit
  // keeps the least recently used entry first.
  const map = new Map<string, T>();
  const cache: Lru<T> = {
    get(key) {
      if (!map.has(key)) return undefined;
      const value = map.get(key) as T;
      map.delete(key);
      map.set(key, value);
      return value;
    },
    set(key, value) {
      map.delete(key);
      map.set(key, value);
      while (map.size > capacity) map.delete(map.keys().next().value as string);
      return value;
    },
    through(key, compute) {
      const hit = cache.get(key);
      return hit !== undefined ? hit : cache.set(key, compute());
    },
    keys: () => [...map.keys()],
  };
  return cache;
}
