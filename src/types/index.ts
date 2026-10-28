// ---- Milestone ----
export type MilestoneType = "birthday" | "anniversary" | "graduation" | "custom";

export interface MilestoneLocation {
  latitude: number;
  longitude: number;
  label: string; // human-readable, e.g. "Lisbon, Portugal" — reverse-geocoded or manually entered
  /**
   * Minutes from UTC at the milestone's own date (not today's offset).
   * Spec §6.1 — this is what lets a user viewing from another country still
   * see the sky as it was over the milestone's actual location.
   * Optional for backwards compatibility with milestones saved before this field existed.
   */
  timezoneOffsetMin?: number;
  /**
   * The phone supplied this place, so the offset follows the phone's own zone
   * rules for the record's date. Kept so an edit that moves the date moves the
   * offset too: a London record moved from July to January kept UTC+1.
   */
  fromDevice?: true;
}

export interface Milestone {
  id: string;                        // UUID v4 — use expo-crypto's randomUUID()
  title: string;                     // user-provided, e.g. "My Birthday"
  type: MilestoneType;
  date: string;                      // "YYYY-MM-DD" — ALWAYS date-only, no time component
  location: MilestoneLocation | null; // null = sky render + tilt unavailable; everything else still works
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
  /**
   * Spec §6.2. True only when the exact syzygy instant for a PRIMARY phase
   * (New / First Quarter / Full / Last Quarter) falls inside this local day.
   * The 8-way phaseName bucket labels anything within ±1.85 days of full as
   * "Full Moon" — down to ~87% illumination. Never present phaseName as a
   * precise claim without checking this flag.
   */
  isTruePhase: boolean;
  /** True while waxing (new -> full), false while waning. From SunCalc, not inferred. */
  waxing: boolean;
  brightLimbAngleDeg: number | null; // null unless a location was available
  altitudeDeg: number | null;        // peak altitude that night, null without location
  riseLocal: string | null;          // "HH:mm", null without location
  setLocal: string | null;           // "HH:mm", null without location
}

// ---- Recurrence (spec §6.3) ----
export interface MoonReturn {
  year: number;
  age: number;                 // years since the source date
  offsetYears: number;         // 11, 19, 30, 38 ... the recurrence interval
  phaseOffsetDays: number;     // circular distance from the source phase, in days
  phaseFraction: number;       // illuminated fraction on that anniversary
  direction: "past" | "future";
  /** Why this year recurs — "Metonic cycle", "11-year cycle", "11 + 19 years". */
  cycleLabel: string;
}

export interface RarityYearMatch {
  year: number;
  illuminationPct: number;
}

export interface RarityStat {
  thresholdPct: number;        // e.g. 99
  frequency: number;           // measured fraction of days meeting it
  oneInN: number;              // 1 / frequency, for display
  matchingYears: number[];     // which of THIS person's anniversaries qualified
  matchingDetails?: RarityYearMatch[];
  totalYears: number;
}

// ---- Sky (spec §7) ----
export interface Star {
  hr: number;       // Bright Star Catalog number
  ra: number;       // right ascension, degrees, J2000
  dec: number;      // declination, degrees, J2000
  mag: number;      // visual magnitude
  name?: string;    // Bayer/Flamsteed designation from the catalog
  proper?: string;  // IAU-approved proper name, where one exists (333 of them)
  bv?: number;      // B-V colour index, magnitudes. Absent where the catalogue has none.
}

/** Anything placed on the sky by altitude and azimuth. */
export interface SkyPoint {
  id: string;
  label: string;
  altitudeDeg: number;
  azimuthDeg: number;   // north-based clockwise
  magnitude: number;
}

/** A body of the solar system, with what it takes to draw it at its true size. */
export interface SkyBody extends SkyPoint {
  /** From the observer, AU. With radiusKm, the body's true angular size. */
  distanceAu: number;
  /** Equatorial radius, km. */
  radiusKm: number;
  /** Polar flattening, (equatorial - polar) / equatorial. 0 for a sphere. */
  flattening: number;
  /** Lit fraction of the disc, 0 to 1, and the Sun-body-observer angle. */
  phaseFraction: number;
  phaseAngleDeg: number;
  /** Where the body's north pole points, horizon frame. Null where none is published. */
  pole: { altitudeDeg: number; azimuthDeg: number } | null;
  /** Saturn only: the rings' opening angle seen from Earth, degrees. Positive shows the north face. */
  ringTiltDeg?: number;
}

// ---- NASA APOD (cached) ----
/**
 * Spec §8.3. "illustrative" = the day's pick is a diagram/chart/map/artist's
 * concept rather than an image of the sky. Roughly 1 in 20 dates.
 */
export type ApodKind = "photograph" | "illustrative" | "video";

export interface ApodCacheEntry {
  date: string;                      // "YYYY-MM-DD" — also the cache key
  title: string;
  explanation: string;
  url: string;                       // standard-res — use for all in-app display
  hdurl: string | null;              // high-res — ONLY for the final export card, fetched on demand
  mediaType: "image" | "video";
  kind: ApodKind;                    // classified at the fetch boundary
  copyright: string | null;          // null = public domain
  fetchedAt: string;                 // ISO datetime — for debugging only, NOT a TTL (cache never expires)
}

// ---- Settings ----
export interface AppSettings {
  nasaApiKey: string | null; // null = fall back to DEMO_KEY with an in-app rate-limit warning
  hasCompletedOnboarding: boolean;
  /** The sky view's "drag to look around" tip has been seen once. */
  hasSeenDragHint: boolean;
  /** The sky view's first-visit guide has been played through or skipped. */
  hasSeenSkyGuide: boolean;
}

export interface MoonCarouselItem {
  offset: number;
  date: string;
  phase: Pick<MoonSnapshot, "phaseFraction" | "phaseName" | "phaseIndex" | "waxing">;
  brightLimbAngleDeg: number | null;
  northAngleDeg: number | null;
}
