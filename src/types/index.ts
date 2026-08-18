// ---- Milestone ----
export type MilestoneType = "birthday" | "anniversary" | "graduation" | "custom";

export interface MilestoneLocation {
  latitude: number;
  longitude: number;
  label: string; // human-readable, e.g. "Lahore, Pakistan" — reverse-geocoded or manually entered
}

export interface Milestone {
  id: string;                        // UUID v4 — use expo-crypto's randomUUID()
  title: string;                     // user-provided, e.g. "My Birthday"
  type: MilestoneType;
  date: string;                      // "YYYY-MM-DD" — ALWAYS date-only, no time component
  location: MilestoneLocation | null; // null = angle rendering unavailable; everything else still works
  notes?: string;
  createdAt: string;                 // ISO 8601 datetime
}

// ---- Moon ----
export type MoonPhaseName =
  | "New Moon" | "Waxing Crescent" | "First Quarter" | "Waxing Gibbous"
  | "Full Moon" | "Waning Gibbous" | "Last Quarter" | "Waning Crescent";

export interface MoonSnapshot {
  phaseFraction: number;             // 0.0–1.0, illuminated fraction
  phaseName: MoonPhaseName;
  phaseIndex: number;                // 0–7, for icon/glyph lookup
  brightLimbAngleDeg: number | null; // null unless a location was available
}

// ---- NASA APOD (cached) ----
export interface ApodCacheEntry {
  date: string;                      // "YYYY-MM-DD" — also the cache key
  title: string;
  explanation: string;
  url: string;                       // standard-res — use for all in-app display
  hdurl: string | null;              // high-res — ONLY for the final export card, fetched on demand
  mediaType: "image" | "video";
  copyright: string | null;          // null = public domain
  fetchedAt: string;                 // ISO datetime — for debugging only, NOT a TTL (cache never expires)
}

// ---- Light-travel dataset (bundled, static) ----
export interface LightTravelObject {
  id: string;
  name: string;                          // "Ring Nebula (M57)"
  distanceLightYears: number;            // best-estimate midpoint
  distanceUncertaintyNote: string;       // REQUIRED — every object must state its uncertainty
  source: string;                        // REQUIRED — where the number came from
  category: "nebula" | "galaxy" | "star" | "star_cluster" | "planet_moon";
}

// ---- Hubble/JWST curated dataset (bundled, static, Phase 9) ----
export interface HubbleJwstImage {
  id: string;
  title: string;
  telescope: "Hubble" | "JWST";
  observationDate: string;   // "YYYY-MM-DD" — real, sourced date, never estimated
  imageUrl: string;
  source: string;            // REQUIRED — the release page this was sourced from
}

// ---- Settings ----
export interface AppSettings {
  nasaApiKey: string | null; // null = fall back to DEMO_KEY with an in-app rate-limit warning
  distanceUnit: "ly" | "km";
  hasCompletedOnboarding: boolean;
}
