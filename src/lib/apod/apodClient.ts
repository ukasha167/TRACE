import type { ApodCacheEntry } from "@/types";

const BASE_URL = "https://api.nasa.gov/planetary/apod";

interface ApodApiResponse {
  title: string;
  date: string;
  explanation: string;
  url: string;
  hdurl?: string;
  media_type: "image" | "video";
  copyright?: string;
  service_version: string;
}

export type ApodFetchError =
  | { kind: "network"; message: string }
  | { kind: "not_found"; message: string }       // pre-1995, gap days
  | { kind: "rate_limit"; message: string }       // HTTP 429
  | { kind: "server_error"; status: number; message: string };

export type ApodFetchResult =
  | { ok: true; entry: ApodCacheEntry }
  | { ok: false; error: ApodFetchError };

/**
 * Fetches one APOD entry from the NASA API.
 *
 * - `dateStr` must be "YYYY-MM-DD" (local calendar date).
 * - `apiKey` falls back to "DEMO_KEY" (30 req/hr, 50/day).
 * - Returns a discriminated union — callers handle all error cases explicitly.
 * - Does NOT touch the cache; see apodCache.ts for the caching layer.
 */
export async function fetchApod(
  dateStr: string,
  apiKey: string = "DEMO_KEY"
): Promise<ApodFetchResult> {
  const url = `${BASE_URL}?date=${dateStr}&thumbs=true&api_key=${apiKey}`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    return {
      ok: false,
      error: {
        kind: "network",
        message: err instanceof Error ? err.message : "Network request failed",
      },
    };
  }

  if (response.status === 429) {
    return {
      ok: false,
      error: { kind: "rate_limit", message: "NASA API rate limit reached. Try again in an hour." },
    };
  }

  if (response.status === 404 || response.status === 400) {
    // NASA returns 400 for dates before 1995-06-16 or gap days
    return {
      ok: false,
      error: {
        kind: "not_found",
        message: "No APOD exists for this date.",
      },
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: {
        kind: "server_error",
        status: response.status,
        message: `NASA API returned ${response.status}`,
      },
    };
  }

  let raw: ApodApiResponse;
  try {
    raw = await response.json();
  } catch {
    return {
      ok: false,
      error: { kind: "server_error", status: 200, message: "Invalid JSON from NASA API" },
    };
  }

  const entry: ApodCacheEntry = {
    date: raw.date,
    title: raw.title,
    explanation: raw.explanation,
    url: raw.url,
    hdurl: raw.hdurl ?? null,
    mediaType: raw.media_type,
    copyright: raw.copyright?.replace(/\n/g, " ").trim() ?? null,
    fetchedAt: new Date().toISOString(),
  };

  return { ok: true, entry };
}
