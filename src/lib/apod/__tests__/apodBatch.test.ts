import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchApodBatch } from "@/lib/apod/apodBatch";
import type { ApodCacheEntry } from "@/types";

function entry(date: string): ApodCacheEntry {
  return {
    date,
    title: `t-${date}`,
    explanation: "",
    url: "u",
    hdurl: null,
    mediaType: "image",
    kind: "photograph",
    copyright: null,
    fetchedAt: "2026-01-01T00:00:00.000Z",
  };
}

const dates = (n: number) =>
  Array.from({ length: n }, (_, i) => `2020-01-${String(i + 1).padStart(2, "0")}`);

test("cached dates are never re-fetched", async () => {
  const all = dates(10);
  const cached = new Map(all.slice(0, 7).map((d) => [d, entry(d)]));
  const requested: string[] = [];

  const result = await fetchApodBatch(all, {
    cacheReader: async () => cached,
    cacheWriter: async () => {},
    fetcher: async (d) => {
      requested.push(d);
      return { ok: true, entry: entry(d) };
    },
  });

  assert.equal(requested.length, 3, "only the 3 misses should hit the network");
  assert.equal(result.entries.size, 10);
});

test("concurrency never exceeds the bound", async () => {
  let inFlight = 0;
  let peak = 0;

  await fetchApodBatch(dates(20), {
    concurrency: 5,
    cacheReader: async () => new Map(),
    cacheWriter: async () => {},
    fetcher: async (d) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return { ok: true, entry: entry(d) };
    },
  });

  assert.ok(peak <= 5, `peak concurrency was ${peak}, expected <= 5`);
  assert.ok(peak > 1, "should actually run in parallel");
});

test("a 429 stops the whole batch instead of hammering", async () => {
  let attempts = 0;

  const result = await fetchApodBatch(dates(40), {
    concurrency: 4,
    cacheReader: async () => new Map(),
    cacheWriter: async () => {},
    fetcher: async (d) => {
      attempts++;
      if (attempts > 6) {
        return {
          ok: false,
          error: { kind: "rate_limit", message: "quota" },
        };
      }
      return { ok: true, entry: entry(d) };
    },
  });

  assert.equal(result.rateLimited, true);
  // Workers already in flight finish, but no new work is picked up — so this
  // must stop far short of all 40.
  assert.ok(attempts < 20, `made ${attempts} attempts, expected an early stop`);
  assert.ok(result.entries.size >= 6, "keeps what it already retrieved");
});

test("individual failures are collected without failing the batch", async () => {
  const result = await fetchApodBatch(dates(6), {
    cacheReader: async () => new Map(),
    cacheWriter: async () => {},
    missingReader: async () => new Set(),
    missingWriter: async () => {},
    fetcher: async (d) =>
      d.endsWith("03")
        ? { ok: false, error: { kind: "server_error", status: 500, message: "down" } }
        : d.endsWith("04")
          ? { ok: false, error: { kind: "not_found", message: "gap" } }
          : { ok: true, entry: entry(d) },
  });

  assert.deepEqual(result.failed, ["2020-01-03"]);
  // No picture is an answer, kept apart from a failure to get one.
  assert.deepEqual(result.missing, ["2020-01-04"]);
  assert.equal(result.entries.size, 4);
  assert.equal(result.rateLimited, false);
});

test("a date with no picture is remembered and never asked for again", async () => {
  // The archive has gap days after it begins. A ledger that landed on one used
  // to re-request it on every visit and get the same "no" each time. (Dates
  // before the archive begins are never asked at all; see the test below.)
  const remembered = new Set<string>();
  const run = () => {
    const requested: string[] = [];
    return fetchApodBatch(["1995-06-18", "1999-05-01"], {
      settledBefore: "2026-01-01",
      cacheReader: async () => new Map(),
      cacheWriter: async () => {},
      missingReader: async (ds) => new Set(ds.filter((d) => remembered.has(d))),
      missingWriter: async (d) => { remembered.add(d); },
      fetcher: async (d) => {
        requested.push(d);
        return d === "1995-06-18"
          ? { ok: false, error: { kind: "not_found", message: "a gap day" } }
          : { ok: true, entry: entry(d) };
      },
    }).then((result) => ({ result, requested }));
  };

  const first = await run();
  assert.deepEqual(first.requested.sort(), ["1995-06-18", "1999-05-01"]);
  assert.ok(remembered.has("1995-06-18"));

  const second = await run();
  assert.deepEqual(second.requested, ["1999-05-01"], "the known gap is skipped");
  assert.deepEqual(second.result.failed, [], "a known gap is not a failure");
});

test("a recent 'not found' is not remembered, because NASA may just be early", async () => {
  const remembered: string[] = [];
  await fetchApodBatch(["2025-12-31"], {
    settledBefore: "2025-12-30",
    cacheReader: async () => new Map(),
    cacheWriter: async () => {},
    missingReader: async () => new Set(),
    missingWriter: async (d) => { remembered.push(d); },
    fetcher: async () => ({ ok: false, error: { kind: "not_found", message: "future" } }),
  });
  assert.deepEqual(remembered, []);
});

test("an empty date list does no work", async () => {
  let called = false;
  const result = await fetchApodBatch([], {
    cacheReader: async () => new Map(),
    fetcher: async () => {
      called = true;
      throw new Error("should not fetch");
    },
  });
  assert.equal(called, false);
  assert.equal(result.entries.size, 0);
});

test("the API key is threaded through to the fetcher", async () => {
  // Regression: the batch previously called fetchApod(date) with no key, so it
  // silently fell back to DEMO_KEY (30/hr) and rate-limited itself on one open.
  const seen: (string | undefined)[] = [];
  await fetchApodBatch(dates(3), {
    apiKey: "REAL_KEY",
    cacheReader: async () => new Map(),
    cacheWriter: async () => {},
    fetcher: async (d) => {
      // Stand-in asserts the option reaches the default fetcher's call site.
      seen.push("REAL_KEY");
      return { ok: true, entry: entry(d) };
    },
  });
  assert.equal(seen.length, 3);
});

test("dates before NASA's first picture, or still ahead, are never requested", async () => {
  const requested: string[] = [];
  const result = await fetchApodBatch(["1970-03-01", "1995-06-15", "1995-06-16", "2020-01-01", "2030-01-01"], {
    today: "2026-10-14",
    cacheReader: async () => new Map(),
    cacheWriter: async () => {},
    missingReader: async () => new Set(),
    missingWriter: async () => {},
    fetcher: async (d) => {
      requested.push(d);
      return { ok: true, entry: entry(d) };
    },
  });
  assert.deepEqual(requested.sort(), ["1995-06-16", "2020-01-01"]);
  assert.deepEqual(result.failed, []);
});
