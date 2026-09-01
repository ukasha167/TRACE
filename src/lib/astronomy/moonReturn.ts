import * as SunCalc from "suncalc";
import type { MoonReturn } from "@/types";
import { phaseDistanceDays, SYNODIC_MONTH_DAYS } from "./moonPhase";
import { parseDateString, toLocalNight } from "./dateUtils";

/**
 * MOON RETURN — the app's core feature. Spec §6.3.
 *
 * Finds the anniversaries on which the moon returns to the same phase it had
 * on the source date.
 *
 * THE ASTRONOMY: 19 tropical years = 6939.60 days; 235 synodic months =
 * 6939.69 days. They differ by about two hours, so the moon comes back to
 * nearly the same phase on the same calendar date every 19 years — the Metonic
 * cycle. Weaker near-repeats sit at 8 years (~1.6 days of drift) and 11 years
 * (~1.5 days, drifting the other way). Because those errors have opposite
 * signs, 8 + 11 = 19 cancels them — which is why 19 is the good one, and why
 * sums like 30 (11+19) and 38 (19+19) also land.
 *
 * This is not a coincidence detector. It is a cycle detector, and saying so is
 * the point: the sky is on a schedule, and the date is on it.
 */

/** A hit counts as a "return" when the phase is within this many days. */
export const RETURN_THRESHOLD_DAYS = 1.0;

/** The recurrence intervals worth naming, best first. */
const CYCLES: { years: number; name: string }[] = [
  { years: 19, name: "Metonic cycle" },
  { years: 11, name: "11-year cycle" },
  { years: 8, name: "8-year cycle" },
];

/**
 * Expresses an interval as a sum of 19/11/8-year cycles, preferring the fewest
 * terms and, on a tie, the most 19s (the most accurate component).
 */
export function describeCycle(offsetYears: number): string {
  let best: { a: number; b: number; c: number } | null = null;
  for (let a = 0; a * 19 <= offsetYears; a++) {
    for (let b = 0; a * 19 + b * 11 <= offsetYears; b++) {
      const remainder = offsetYears - a * 19 - b * 11;
      if (remainder % 8 !== 0) continue;
      const c = remainder / 8;
      const terms = a + b + c;
      if (
        best === null ||
        terms < best.a + best.b + best.c ||
        (terms === best.a + best.b + best.c && a > best.a)
      ) {
        best = { a, b, c };
      }
    }
  }

  if (!best) return `${offsetYears} years`;
  if (best.a === 1 && best.b === 0 && best.c === 0) return "Metonic cycle (19 years)";
  if (best.a === 0 && best.b === 1 && best.c === 0) return "11-year cycle";
  if (best.a === 0 && best.b === 0 && best.c === 1) return "8-year cycle";

  const parts: string[] = [];
  for (const { years, name } of CYCLES) {
    const count = years === 19 ? best.a : years === 11 ? best.b : best.c;
    if (count === 1) parts.push(name.replace(" cycle", ""));
    else if (count > 1) parts.push(`${count}x ${name.replace(" cycle", "")}`);
  }
  return parts.join(" + ");
}

export interface MoonReturnOptions {
  /** Years to search either side of the source date. */
  searchYears?: number;
  /** Max phase distance, in days, for a year to count as a return. */
  thresholdDays?: number;
  /** Timezone offset of the milestone's location, minutes from UTC. */
  tzOffsetMin?: number;
}

/**
 * @param dateString source date, "YYYY-MM-DD"
 * @returns every anniversary whose moon returns to the source phase, ordered by year.
 *          The source year itself is excluded.
 */
export function getMoonReturns(
  dateString: string,
  options: MoonReturnOptions = {}
): MoonReturn[] {
  const {
    searchYears = 60,
    thresholdDays = RETURN_THRESHOLD_DAYS,
    tzOffsetMin,
  } = options;

  const { year: sourceYear, month, day } = parseDateString(dateString);
  const pad = (n: number) => String(n).padStart(2, "0");

  const sourcePhase = SunCalc.getMoonIllumination(
    toLocalNight(dateString, tzOffsetMin)
  ).phase;

  const results: MoonReturn[] = [];

  for (let year = sourceYear - searchYears; year <= sourceYear + searchYears; year++) {
    if (year === sourceYear) continue;

    // Feb 29 sources have no anniversary in common years. Skip rather than
    // silently sliding to Mar 1, which would be a different sky.
    if (month === 2 && day === 29 && !isLeapYear(year)) continue;

    const target = `${year}-${pad(month)}-${pad(day)}`;
    const illumination = SunCalc.getMoonIllumination(
      toLocalNight(target, tzOffsetMin)
    );
    const offsetDays = phaseDistanceDays(illumination.phase, sourcePhase);
    if (offsetDays >= thresholdDays) continue;

    const offsetYears = Math.abs(year - sourceYear);
    results.push({
      year,
      age: year - sourceYear,
      offsetYears,
      phaseOffsetDays: offsetDays,
      phaseFraction: illumination.fraction,
      direction: year < sourceYear ? "past" : "future",
      cycleLabel: describeCycle(offsetYears),
    });
  }

  return results;
}

/** The most recent past return and the next future one, relative to `fromYear`. */
export function getNearestReturns(
  returns: MoonReturn[],
  fromYear: number
): { previous: MoonReturn | null; next: MoonReturn | null } {
  let previous: MoonReturn | null = null;
  let next: MoonReturn | null = null;
  for (const r of returns) {
    if (r.year <= fromYear) previous = r;
    else if (next === null) next = r;
  }
  return { previous, next };
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export { SYNODIC_MONTH_DAYS };
