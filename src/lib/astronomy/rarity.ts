import * as SunCalc from "suncalc";
import type { RarityStat } from "@/types";
import { parseDateString, toLocalNight } from "./dateUtils";

/**
 * RARITY — measured, never asserted. Spec §6.4.
 *
 * The rule this module exists to enforce: never use an adjective where a number
 * will do. "Rare" is not a claim this app is allowed to make; "1 in 16.5" is.
 *
 * The global frequency is computed empirically by walking days, not hardcoded,
 * so it stays correct if the sampling convention ever changes. It is a physical
 * constant — independent of the user — so it is memoised per threshold.
 */

const MEASURE_START_YEAR = 1980;
const MEASURE_END_YEAR = 2060;
const DAY_MS = 86_400_000;

const frequencyCache = new Map<number, number>();

/**
 * Fraction of all days whose moon is at least `thresholdPct` illuminated.
 *
 * Reference values over 1980-2060 (29,220 days):
 *   >=90%   20.19%   ~1 in 5
 *   >=95%   13.99%   ~1 in 7
 *   >=97%   10.86%   ~1 in 9
 *   >=99%    6.06%   ~1 in 16.5
 *   >=99.5%  3.94%   ~1 in 25
 */
export function measureFrequency(thresholdPct: number): number {
  const cached = frequencyCache.get(thresholdPct);
  if (cached !== undefined) return cached;

  const threshold = thresholdPct / 100;
  let matches = 0;
  let total = 0;

  // Sample at a fixed hour so every day is measured at the same point in its
  // cycle; the choice of hour shifts individual days but not the frequency.
  const start = Date.UTC(MEASURE_START_YEAR, 0, 1, 19, 0, 0);
  const end = Date.UTC(MEASURE_END_YEAR, 0, 1, 19, 0, 0);
  for (let t = start; t < end; t += DAY_MS) {
    if (SunCalc.getMoonIllumination(new Date(t)).fraction >= threshold) matches++;
    total++;
  }

  const frequency = matches / total;
  frequencyCache.set(thresholdPct, frequency);
  return frequency;
}

export interface RarityOptions {
  /** How many anniversaries to check, starting from the source year. */
  throughYear?: number;
  tzOffsetMin?: number;
}

/**
 * Combines the global frequency with the personal one.
 *
 * The personal number is the stronger of the two and the reason this function
 * takes a date at all: "2 of your 22 birthdays have had a moon this full" lands
 * in a way "1 in 16.5" never does, and it is just as true.
 */
export function getRarityStat(
  dateString: string,
  thresholdPct: number,
  options: RarityOptions = {}
): RarityStat {
  const { year: sourceYear, month, day } = parseDateString(dateString);
  const throughYear = options.throughYear ?? new Date().getFullYear();
  const pad = (n: number) => String(n).padStart(2, "0");
  const threshold = thresholdPct / 100;

  const matchingYears: number[] = [];
  let totalYears = 0;

  for (let year = sourceYear; year <= throughYear; year++) {
    if (month === 2 && day === 29 && !isLeapYear(year)) continue;
    totalYears++;
    const target = `${year}-${pad(month)}-${pad(day)}`;
    const fraction = SunCalc.getMoonIllumination(
      toLocalNight(target, options.tzOffsetMin)
    ).fraction;
    if (fraction >= threshold) matchingYears.push(year);
  }

  const frequency = measureFrequency(thresholdPct);

  return {
    thresholdPct,
    frequency,
    oneInN: 1 / frequency,
    matchingYears,
    totalYears,
  };
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}
