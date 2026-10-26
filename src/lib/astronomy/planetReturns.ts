import * as Astronomy from "astronomy-engine";
import { lru } from "@/lib/memo";

/**
 * JUPITER AND SATURN COME BACK TOO.
 *
 * The moon's return is the app's thesis; the two slow planets make the same
 * point on longer clocks. Jupiter takes 11.86 years to go round the sky and
 * Saturn 29.46, so a night's Jupiter stands in front of the same stars again
 * about twelve years later, and its Saturn about thirty.
 *
 * GEOCENTRIC, because "the same stars" is what a person on Earth would see.
 * Heliocentric longitude returns once per orbit and cleanly, but it describes
 * the planet's place around the Sun, which nobody can look up and check.
 * The price is retrograde motion: near opposition the planet loops back and
 * can cross the same longitude three times in a few months. A return is the
 * FIRST crossing of each lap, and the search jumps most of an orbit ahead
 * before looking for the next one, so a loop is never counted as three returns.
 */

const DAY_MS = 86_400_000;
const YEAR_MS = 365.25 * DAY_MS;

export type ReturningPlanet = "Jupiter" | "Saturn";

const PERIOD_YEARS: Record<ReturningPlanet, number> = {
  Jupiter: 11.862,
  Saturn: 29.457,
};

export interface PlanetReturns {
  planet: ReturningPlanet;
  /** The constellation it stood in that night, J2000 boundaries. */
  constellation: string;
  /** Every return up to `until`, in order, then the first after it (if searched). */
  returns: Date[];
}

/** Where the planet stands among the stars as seen from Earth, degrees [0, 360). */
export function geocentricLongitude(planet: ReturningPlanet, date: Date): number {
  const v = Astronomy.GeoVector(Astronomy.Body[planet], date, true);
  return Astronomy.Ecliptic(v).elon;
}

/** Signed angle a - b folded into (-180, 180]. */
function wrap(d: number): number {
  const n = ((d % 360) + 360) % 360;
  return n > 180 ? n - 360 : n;
}

function firstCrossing(
  planet: ReturningPlanet,
  target: number,
  from: number,
  to: number
): Date | null {
  const step = 4 * DAY_MS;
  let t0 = from;
  let d0 = wrap(geocentricLongitude(planet, new Date(t0)) - target);
  for (let t1 = from + step; t1 <= to; t1 += step) {
    const d1 = wrap(geocentricLongitude(planet, new Date(t1)) - target);
    // A crossing, and not the fold at ±180 on the far side of the sky.
    if (d0 < 0 !== d1 < 0 && Math.abs(d1 - d0) < 90) {
      let lo = t0, hi = t1, dlo = d0;
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        const dm = wrap(geocentricLongitude(planet, new Date(mid)) - target);
        if (dlo < 0 !== dm < 0) hi = mid;
        else { lo = mid; dlo = dm; }
      }
      return new Date((lo + hi) / 2);
    }
    t0 = t1;
    d0 = d1;
  }
  return null;
}

/**
 * The returns of one planet to where it stood at `at`, through `until` and one
 * beyond, so the page can say when the next one comes.
 */
const returnsCache = lru<PlanetReturns>(8);

/**
 * planetReturns, once per planet, night and day of asking. Keyed on the UTC
 * day of `until` rather than its instant, so the record screen's "now" hits.
 */
export function planetReturnsFor(planet: ReturningPlanet, at: Date, until: Date): PlanetReturns {
  const key = `${planet}|${at.getTime()}|${until.toISOString().slice(0, 10)}`;
  return returnsCache.through(key, () => Object.freeze(planetReturns(planet, at, until)));
}

export function planetReturns(planet: ReturningPlanet, at: Date, until: Date): PlanetReturns {
  const target = geocentricLongitude(planet, at);
  const eq = Astronomy.Equator(
    Astronomy.Body[planet],
    at,
    new Astronomy.Observer(0, 0, 0),
    false,
    true
  );
  const constellation = Astronomy.Constellation(eq.ra, eq.dec).name;

  const period = PERIOD_YEARS[planet] * YEAR_MS;
  const returns: Date[] = [];
  for (let lap = 1; lap < 12; lap++) {
    // Search a window around each lap. Eccentricity moves the return by up to
    // about eight months either side of the mean period.
    const centre = at.getTime() + lap * period;
    const hit = firstCrossing(planet, target, centre - 1.2 * YEAR_MS, centre + 1.2 * YEAR_MS);
    if (!hit) continue;
    returns.push(hit);
    if (hit.getTime() > until.getTime()) break;
  }
  return { planet, constellation, returns };
}
