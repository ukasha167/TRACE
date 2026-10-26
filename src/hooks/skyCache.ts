import { buildSkySphere, type SkySphere } from "@/lib/astronomy/skySphere";
import { lru } from "@/lib/memo";
import catalogJson from "@/data/bsc.json";
import type { MilestoneLocation, Star } from "@/types";

export const CATALOG = catalogJson as Star[];

/**
 * STAR DENSITY: the 75th percentile of the bundled catalogue.
 *
 * The catalogue runs to magnitude 6.5 and 8,404 stars, which is roughly what a
 * perfect eye sees from a perfect site. On a phone that reads as noise: the
 * faintest quarter carries no shape a person can recognise, and it fogs the
 * bright stars that make the sky legible as constellations. Cutting at 6.2
 * keeps 6,331 of them, exactly 75%, and leaves every star anyone has a name
 * for. The catalogue keeps the rest, so raising this line brings them back.
 */
export const MAG_LIMIT = 6.2;

/**
 * Tonight's sky is built for the twenty-minute step containing the moment it
 * opened, not for that moment, so the prewarm on Home and the sky it opens
 * agree on a key. The moon image uses the same step; scrubbing already did.
 * The sphere loses nothing by it: it is a pure rotation of the catalogue about
 * the pole, so the sky turns it by `siderealDelta(step, now)` and the stars
 * land exactly where a sphere built for `now` would put them (decision 34).
 */
export const MOON_STEP_MS = 1_200_000;
export const moonStepOf = (ms: number) => Math.round(ms / MOON_STEP_MS) * MOON_STEP_MS;

const spheres = lru<SkySphere>(4);

/** The sphere for a place at `anchorMs`, built once while it stays among the last four. */
export function skySphereFor(place: Pick<MilestoneLocation, "latitude" | "longitude">, anchorMs: number): SkySphere {
  const key = `${place.latitude.toFixed(4)},${place.longitude.toFixed(4)},${anchorMs}`;
  return spheres.through(key, () => buildSkySphere(CATALOG, place, new Date(anchorMs), MAG_LIMIT));
}
