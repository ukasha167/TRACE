import type { ApodCacheEntry } from "@/types";
import { classifyApod } from "./apodClassify";
import { archivePageUrl, isPlaceholderApod, parseArchivePage } from "./apodArchive";

const BASE_URL = "https://api.nasa.gov/planetary/apod";

/**
 * NASA's first Astronomy Picture of the Day. Nothing before it exists, so a
 * date before it is never worth a request.
 */
export const FIRST_APOD_DATE = "1995-06-16";

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
 * Days old before a date is read from the archive first. The API is still
 * right for the last few days, and the new site files its pages late: in
 * October 2026 a date two weeks back still redirected to the APOD front page.
 * A date in that gap fails the archive's date check and falls through to the
 * API. Going to the archive first for older dates also keeps them off the
 * API's quota, which on the shared key is thirty an hour.
 */
const ARCHIVE_AFTER_DAYS = 14;

/**
 * Fetches one APOD entry, from the archive page or the API.
 *
 * - `dateStr` must be "YYYY-MM-DD" (local calendar date).
 * - `apiKey` falls back to "DEMO_KEY" (30 req/hr, 50/day). The archive needs none.
 * - Returns a discriminated union, so callers handle every error case.
 * - Does NOT touch the cache; see apodCache.ts for the caching layer.
 */
export async function fetchApod(
  dateStr: string,
  apiKey: string = "DEMO_KEY",
  now: Date = new Date()
): Promise<ApodFetchResult> {
  const [y, m, d] = dateStr.split("-").map(Number);
  const age = (now.getTime() - Date.UTC(y, m - 1, d)) / 86_400_000;
  if (age > ARCHIVE_AFTER_DAYS) {
    const archived = await fetchApodFromArchive(dateStr);
    // A page the parser could not use is NASA's filing, not an answer about
    // the date, so the API gets its turn.
    if (archived.ok || archived.error.kind !== "server_error") return archived;
  }
  return fetchApodFromApi(dateStr, apiKey);
}

async function fetchApodFromApi(dateStr: string, apiKey: string): Promise<ApodFetchResult> {
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

  // NASA's API now answers most past dates with its logo. Never cache that as
  // the day's picture; the archive has the real one (see apodArchive).
  if (isPlaceholderApod(raw)) {
    return { ok: false, error: { kind: "server_error", status: 200, message: "NASA's API sent its logo instead of the picture." } };
  }

  const entry: ApodCacheEntry = {
    date: raw.date,
    title: raw.title,
    explanation: raw.explanation,
    url: raw.url,
    hdurl: raw.hdurl ?? null,
    mediaType: raw.media_type,
    kind: classifyApod({
      mediaType: raw.media_type,
      explanation: raw.explanation ?? "",
    }),
    copyright: raw.copyright?.replace(/\n/g, " ").trim() ?? null,
    fetchedAt: new Date().toISOString(),
  };

  return { ok: true, entry };
}

/** The archive page for a date, read for its picture. See apodArchive. */
export async function fetchApodFromArchive(dateStr: string): Promise<ApodFetchResult> {
  let response: Response;
  try {
    response = await fetch(archivePageUrl(dateStr));
  } catch (err) {
    return {
      ok: false,
      error: { kind: "network", message: err instanceof Error ? err.message : "Network request failed" },
    };
  }
  if (response.status === 404) {
    return { ok: false, error: { kind: "not_found", message: "No APOD exists for this date." } };
  }
  if (!response.ok) {
    return {
      ok: false,
      error: { kind: "server_error", status: response.status, message: `NASA's archive returned ${response.status}` },
    };
  }

  const parsed = parseArchivePage(await response.text(), dateStr, response.url);
  if (!parsed.ok) {
    // No image is an answer about the date and can be remembered. The wrong
    // page is NASA's filing, which may change, so it is only a failure.
    return parsed.reason === "no-image"
      ? { ok: false, error: { kind: "not_found", message: "NASA's archive has no picture for this date." } }
      : { ok: false, error: { kind: "server_error", status: 200, message: "NASA's archive sent another day's page." } };
  }

  const entry: ApodCacheEntry = {
    date: dateStr,
    title: parsed.title,
    explanation: parsed.explanation,
    url: parsed.url,
    // The page links a 1280px rendition; the original sits at the path above it.
    hdurl: parsed.mediaType === "image" ? parsed.url.replace(/\/jcr:content\/renditions\/.*$/, "") : null,
    mediaType: parsed.mediaType,
    kind: classifyApod({ mediaType: parsed.mediaType, explanation: parsed.explanation }),
    copyright: parsed.copyrighted ? parsed.credit : null,
    fetchedAt: new Date().toISOString(),
  };
  return { ok: true, entry };
}
