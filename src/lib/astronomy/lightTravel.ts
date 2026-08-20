import type { LightTravelObject } from "@/types";
import { SORTED_OBJECTS } from "./lightTravelDataset";

// ---- Physical constants ----
const KM_PER_LIGHT_YEAR = 9.4607e12;
const SECONDS_PER_YEAR = 365.25 * 24 * 3600;
const MINUTES_PER_YEAR = 365.25 * 24 * 60;
const HOURS_PER_YEAR = 365.25 * 24;

export interface LightTravelFact {
  distanceLightYears: number;
  distanceKm: number;
  /** Human-readable distance in the user's chosen unit */
  formattedDistance: string;
  /** The closest landmark the light has passed (or null for sub-moon distances) */
  landmark: LightTravelObject | null;
  /** The next landmark the light is heading toward (for context) */
  nextLandmark: LightTravelObject | null;
  /** Full single-sentence fact */
  sentence: string;
}

/**
 * Given a milestone date and today, computes how far light has traveled
 * since the milestone and returns a curated cosmic landmark comparison.
 *
 * `milestoneDate` MUST be constructed via toLocalNoon() — never raw Date("YYYY-MM-DD").
 */
export function getLightTravelFact(
  milestoneDate: Date,
  today: Date,
  unit: "ly" | "km"
): LightTravelFact {
  const ageMs = today.getTime() - milestoneDate.getTime();
  // Guard: future dates return zero distance
  const ageMsPositive = Math.max(0, ageMs);
  const ageYears = ageMsPositive / (1000 * SECONDS_PER_YEAR);
  const distanceLy = ageYears; // by definition: 1 year of travel = 1 light-year
  const distanceKm = distanceLy * KM_PER_LIGHT_YEAR;

  const formattedDistance = formatDistance(distanceLy, unit);
  const { landmark, nextLandmark } = findLandmarks(distanceLy);
  const sentence = buildSentence(formattedDistance, landmark, nextLandmark, distanceLy);

  return { distanceLightYears: distanceLy, distanceKm, formattedDistance, landmark, nextLandmark, sentence };
}

// ---- Formatting ----

function formatDistance(distanceLy: number, unit: "ly" | "km"): string {
  if (unit === "km") {
    return formatKm(distanceLy * KM_PER_LIGHT_YEAR);
  }
  return formatLy(distanceLy);
}

function formatLy(ly: number): string {
  if (ly === 0) return "0 km";

  const asSeconds = ly * SECONDS_PER_YEAR;
  const asMinutes = ly * MINUTES_PER_YEAR;
  const asHours   = ly * HOURS_PER_YEAR;
  const asDays    = ly * 365.25;

  if (asSeconds < 60) return `${asSeconds.toFixed(1)} light-seconds`;
  if (asMinutes < 60) return `${asMinutes.toFixed(1)} light-minutes`;
  if (asHours   < 24) return `${asHours.toFixed(1)} light-hours`;
  if (asDays    < 365) return `${Math.round(asDays)} light-days`;
  if (ly        < 1000) return `${ly.toFixed(2)} light-years`;
  if (ly        < 1e6)  return `${(ly / 1000).toFixed(1)}k light-years`;
  return `${(ly / 1e6).toFixed(2)} million light-years`;
}

function formatKm(km: number): string {
  if (km < 1_000) return `${Math.round(km).toLocaleString()} km`;
  if (km < 1e6)   return `${(km / 1e3).toFixed(0).toLocaleString()} thousand km`;
  if (km < 1e9)   return `${(km / 1e6).toFixed(1)} million km`;
  if (km < 1e12)  return `${(km / 1e9).toFixed(1)} billion km`;
  if (km < 1e15)  return `${(km / 1e12).toFixed(2)} trillion km`;
  return `${(km / 1e15).toFixed(2)} quadrillion km`;
}

// ---- Landmark lookup ----

function findLandmarks(distanceLy: number): {
  landmark: LightTravelObject | null;
  nextLandmark: LightTravelObject | null;
} {
  let landmark: LightTravelObject | null = null;
  let nextLandmark: LightTravelObject | null = null;

  for (let i = 0; i < SORTED_OBJECTS.length; i++) {
    const obj = SORTED_OBJECTS[i];
    if (obj.distanceLightYears <= distanceLy) {
      landmark = obj;
    } else {
      nextLandmark = obj;
      break;
    }
  }

  return { landmark, nextLandmark };
}

// ---- Sentence builder ----

function buildSentence(
  formattedDistance: string,
  landmark: LightTravelObject | null,
  nextLandmark: LightTravelObject | null,
  distanceLy: number
): string {
  const base = `Light from this date has traveled ${formattedDistance}`;

  if (!landmark) {
    // Still in the sub-Moon region — very recent dates
    if (nextLandmark) {
      return `${base} — on its way toward ${nextLandmark.name}.`;
    }
    return `${base} through the inner solar system.`;
  }

  // If we're very close to the next landmark (within 10%), mention it
  if (nextLandmark) {
    const fractionToNext =
      (distanceLy - landmark.distanceLightYears) /
      (nextLandmark.distanceLightYears - landmark.distanceLightYears);

    if (fractionToNext > 0.85) {
      return `${base} — approaching ${nextLandmark.name}.`;
    }
  }

  return `${base} — past ${landmark.name}.`;
}
