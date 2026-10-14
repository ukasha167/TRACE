import * as SunCalc from "suncalc";
import type { RarityStat } from "@/types";
import { parseDateString, toLocalNight, todayDateString } from "./dateUtils";

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

/** Days in the measurement window, 1980-01-01 to 2060-01-01. */
export const MEASURED_DAYS = 29_220;

/**
 * THE WALK'S RESULTS, KEPT.
 *
 * `measureFrequency` walks all 29,220 days, and the record screen used to run
 * that walk inside its first render: 136 ms per threshold under V8 on a laptop,
 * and several times that under Hermes on a phone, spent before the page could
 * paint. The answer is a property of the Moon, not of the record, so it is
 * stored as the count of qualifying days the walk found.
 *
 * Still measured, never asserted: a test re-walks every threshold and fails if
 * any count here drifts from what SunCalc produces. Thresholds not listed fall
 * back to walking.
 */
export const MEASURED_DAY_COUNTS: Readonly<Record<number, number>> = {
  90: 5_899,
  95: 4_087,
  97: 3_172,
  99: 1_770,
  99.5: 1_151,
};

const frequencyCache = new Map<number, number>(
  Object.entries(MEASURED_DAY_COUNTS).map(([pct, days]) => [
    Number(pct),
    days / MEASURED_DAYS,
  ])
);

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

  const { matches, total } = walkDays(thresholdPct);
  const frequency = matches / total;
  frequencyCache.set(thresholdPct, frequency);
  return frequency;
}

/**
 * Counts the days in the window whose moon clears `thresholdPct`, every time it
 * is called. MEASURED_DAY_COUNTS is this function's output, and the test calls
 * it directly to prove the two still agree.
 */
export function walkDays(thresholdPct: number): { matches: number; total: number } {
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
  return { matches, total };
}

export interface RarityOptions {
  /** How many anniversaries to check, starting from the source year. */
  throughYear?: number;
  tzOffsetMin?: number;
  /**
   * "YYYY-MM-DD" on the phone's calendar. Anniversaries after it have not
   * happened, so they are not counted among the ones "so far".
   */
  today?: string;
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
  const today = options.today ?? todayDateString();
  const throughYear = options.throughYear ?? parseDateString(today).year;
  const pad = (n: number) => String(n).padStart(2, "0");
  const threshold = thresholdPct / 100;

  const matchingYears: number[] = [];
  const matchingDetails: { year: number; illuminationPct: number }[] = [];
  let totalYears = 0;

  for (let year = sourceYear; year <= throughYear; year++) {
    if (month === 2 && day === 29 && !isLeapYear(year)) continue;
    const target = `${year}-${pad(month)}-${pad(day)}`;
    // This year's date may still be ahead, and "so far" means so far.
    if (target > today) break;
    totalYears++;
    const fraction = SunCalc.getMoonIllumination(
      toLocalNight(target, options.tzOffsetMin)
    ).fraction;

    // THE THRESHOLD ALONE. Years within a point of the record's own moon used
    // to count too, so a 98.9% year went into "3 of the 12 birthdays so far
    // have had one" under a heading of 99.5% or more. The sentence and the
    // count have to describe the same set.
    if (fraction >= threshold) {
      matchingYears.push(year);
      matchingDetails.push({
        year,
        // Unrounded. Rounding here to one decimal turned a 99.96% moon into a
        // stored 100, which the screen then printed as a full moon.
        illuminationPct: fraction * 100,
      });
    }
  }

  const frequency = measureFrequency(thresholdPct);

  return {
    thresholdPct,
    frequency,
    oneInN: 1 / frequency,
    matchingYears,
    matchingDetails,
    totalYears,
  };
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}
