import type { MilestoneLocation, MoonPhaseName } from "@/types";
import { getMoonPhase } from "./moonPhase";
import { getBrightLimbAngle, getLunarNorthRotation } from "./brightLimb";
import { getMoonReturns } from "./moonReturn";
import { placeOf } from "./place";
import { anniversaryOn, toLocalNight, parseDateString } from "./dateUtils";

/**
 * THE LIFE LEDGER — one row per year, spec §2.
 *
 * The whole life on a single vertical axis: for each anniversary, the moon that
 * actually hung there, at its true phase and true tilt. Two of them being full
 * is a fact the reader discovers by scrolling, not a claim the app makes.
 *
 * Every field here is local computation. Nothing in this module touches the
 * network — the APOD thumbnails are layered on afterwards and fill in
 * progressively, so the ledger is complete and readable offline the instant it
 * opens. That ordering is the point (spec §8.5).
 */

export interface LedgerYear {
  year: number;
  age: number;
  date: string; // "YYYY-MM-DD"
  phaseFraction: number;
  phaseIndex: number;
  phaseName: MoonPhaseName;
  waxing: boolean;
  brightLimbAngleDeg: number | null;
  /**
   * Screen rotation of the Moon's north pole, which orients the lunar
   * photograph independently of the terminator. Carried on the row because the
   * ledger draws 20-40 real moons and each needs its own libration.
   */
  northAngleDeg: number | null;
  /** This year's moon returns to the source phase (spec §6.3). */
  isReturn: boolean;
  /** Why, when isReturn — "Metonic cycle (19 years)". */
  cycleLabel: string | null;
}

export interface LifeLedgerOptions {
  throughYear?: number;
  location?: MilestoneLocation | null;
}

export function getLifeLedger(
  dateString: string,
  options: LifeLedgerOptions = {}
): LedgerYear[] {
  const { year: sourceYear } = parseDateString(dateString);
  const throughYear = options.throughYear ?? new Date().getFullYear();
  const location = options.location ?? null;
  const tzOffsetMin = location?.timezoneOffsetMin;

  // Index returns by year so each row can flag itself without re-searching.
  const returnsByYear = new Map(
    getMoonReturns(dateString, { tzOffsetMin }).map((r) => [r.year, r])
  );

  const place = placeOf(location);

  const rows: LedgerYear[] = [];

  for (let year = sourceYear; year <= throughYear; year++) {
    const date = anniversaryOn(dateString, year);
    if (date === null) continue;
    const night = toLocalNight(date, tzOffsetMin);
    const phase = getMoonPhase(night);
    const hit = returnsByYear.get(year);

    rows.push({
      year,
      age: year - sourceYear,
      date,
      phaseFraction: phase.phaseFraction,
      phaseIndex: phase.phaseIndex,
      phaseName: phase.phaseName,
      waxing: phase.waxing,
      brightLimbAngleDeg: place ? getBrightLimbAngle(night, place) : null,
      northAngleDeg: place ? getLunarNorthRotation(night, place) : null,
      isReturn: hit !== undefined,
      cycleLabel: hit?.cycleLabel ?? null,
    });
  }

  return rows;
}

/** The brightest moons in the ledger, for a "your fullest skies" summary. */
export function brightestYears(rows: LedgerYear[], count = 3): LedgerYear[] {
  return [...rows]
    .sort((a, b) => b.phaseFraction - a.phaseFraction)
    .slice(0, count);
}
