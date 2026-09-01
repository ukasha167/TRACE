import * as SunCalc from "suncalc";
import type { MoonSnapshot, MoonPhaseName } from "@/types";

const PHASE_NAMES: MoonPhaseName[] = [
  "New Moon",
  "Waxing Crescent",
  "First Quarter",
  "Waxing Gibbous",
  "Full Moon",
  "Waning Gibbous",
  "Last Quarter",
  "Waning Crescent",
];

export const SYNODIC_MONTH_DAYS = 29.530589;

/** The four primary phases are instants, not ranges. Index -> target phase value. */
const PRIMARY_PHASE_TARGETS: Record<number, number> = {
  0: 0,     // New
  2: 0.25,  // First Quarter
  4: 0.5,   // Full
  6: 0.75,  // Last Quarter
};

/**
 * Signed distance from `phase` to `target` on the 0–1 circle, in (-0.5, 0.5].
 * Handles the wraparound at new moon, where phase runs 0.99 -> 0.01.
 */
function signedPhaseDelta(phase: number, target: number): number {
  return ((((phase - target + 0.5) % 1) + 1) % 1) - 0.5;
}

/**
 * Circular distance between two phase values, expressed in days.
 * Used by moonReturn.ts to measure how closely a sky repeats.
 */
export function phaseDistanceDays(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, 1 - d) * SYNODIC_MONTH_DAYS;
}

/**
 * Does the exact syzygy for this primary phase fall inside the given local day?
 *
 * Spec §6.2. This is the almanac convention: a "Full Moon" is the *instant* of
 * opposition, and a date is a full moon date only if that instant lands in it.
 * Without this check the 8-way bucket calls anything within +/-1.85 days of full
 * a "Full Moon" — down to ~87% illumination — which is how this app once told
 * its own author a 96% moon was full.
 */
function syzygyFallsInDay(dayStart: Date, phaseIndex: number): boolean {
  const target = PRIMARY_PHASE_TARGETS[phaseIndex];
  if (target === undefined) return false; // intermediate phases are ranges, not instants

  const STEP_MS = 10 * 60 * 1000; // 10 minutes is far finer than the ~2h precision we need
  const dayEnd = dayStart.getTime() + 24 * 60 * 60 * 1000;

  let previous = signedPhaseDelta(
    SunCalc.getMoonIllumination(dayStart).phase,
    target
  );
  for (let t = dayStart.getTime() + STEP_MS; t <= dayEnd; t += STEP_MS) {
    const current = signedPhaseDelta(
      SunCalc.getMoonIllumination(new Date(t)).phase,
      target
    );
    // The moon only ever advances, so the crossing is always negative -> positive.
    if (previous < 0 && current >= 0) return true;
    previous = current;
  }
  return false;
}

/**
 * Computes moon phase for a given instant.
 *
 * Pass an instant from toLocalNight() when you care how the moon LOOKED, or
 * toLocalNoon() for calendar-date identity. Never pass new Date("YYYY-MM-DD").
 *
 * @param date     the instant to evaluate
 * @param dayStart local midnight that begins the calendar day, for the
 *                 isTruePhase check. Defaults to midnight before `date`.
 */
export function getMoonPhase(
  date: Date,
  dayStart?: Date
): Pick<
  MoonSnapshot,
  "phaseFraction" | "phaseName" | "phaseIndex" | "isTruePhase" | "waxing"
> {
  const illumination = SunCalc.getMoonIllumination(date);
  // Map 0–1 phase value to one of 8 discrete states. phase 0 = New, 0.5 = Full.
  const phaseIndex = Math.round(illumination.phase * 8) % 8;

  const start =
    dayStart ??
    new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);

  return {
    phaseFraction: illumination.fraction,
    phaseName: PHASE_NAMES[phaseIndex],
    phaseIndex,
    isTruePhase: syzygyFallsInDay(start, phaseIndex),
    waxing: illumination.waxing,
  };
}

/**
 * Formats illuminated fraction as a percentage string.
 * Uses one decimal above 95% — at that end the difference between 96% and 99.9%
 * is the entire point, and rounding both to "100%" would be a false claim.
 */
export function formatIllumination(fraction: number): string {
  const pct = fraction * 100;
  if (pct >= 95 && pct < 100) return `${pct.toFixed(1)}%`;
  return `${Math.round(pct)}%`;
}

/**
 * Illumination at or beyond which "Full" / "New" is an honest label regardless
 * of which calendar day the exact syzygy fell on.
 *
 * WHY THIS EXISTS: isTruePhase alone is too strict for display. A moon at 99.9%
 * whose exact full instant lands at 08:00 the following morning is, to any
 * observer, a full moon — nobody can distinguish 99.9% from 100%. Labelling it
 * "Waxing Gibbous" understates reality exactly as badly as the 8-way bucket
 * overstated it by calling 96% "Full". The honest line is illumination, which
 * is what a person actually sees; isTruePhase stays as metadata for the
 * supplementary note (see describeSyzygyNote).
 */
export const FULL_ENOUGH = 0.99;
export const NEW_ENOUGH = 0.01;

/**
 * A phase description that neither overclaims nor understates. Spec §6.2 / §13.
 */
export function describePhase(
  snapshot: Pick<
    MoonSnapshot,
    "phaseName" | "phaseIndex" | "isTruePhase" | "phaseFraction" | "waxing"
  >
): string {
  const isPrimary = PRIMARY_PHASE_TARGETS[snapshot.phaseIndex] !== undefined;
  if (!isPrimary) return snapshot.phaseName;

  switch (snapshot.phaseIndex) {
    case 4:
      if (snapshot.phaseFraction >= FULL_ENOUGH || snapshot.isTruePhase) return "Full Moon";
      // NOTE: waxing must come from SunCalc, never from phaseIndex — in this
      // branch the index IS the primary value (exactly 4), so inferring
      // direction from it would call every near-full moon "waning".
      return snapshot.waxing ? "Waxing Gibbous" : "Waning Gibbous";
    case 0:
      if (snapshot.phaseFraction <= NEW_ENOUGH || snapshot.isTruePhase) return "New Moon";
      return snapshot.waxing ? "Waxing Crescent" : "Waning Crescent";
    case 2:
      return snapshot.isTruePhase ? "First Quarter" : "Near First Quarter";
    case 6:
      return snapshot.isTruePhase ? "Last Quarter" : "Near Last Quarter";
    default:
      return snapshot.phaseName;
  }
}

/**
 * Supplementary honesty: when we call it a Full/New Moon on illumination alone,
 * say where the exact instant actually fell. Returns null when there is nothing
 * to disclose.
 */
export function describeSyzygyNote(
  snapshot: Pick<MoonSnapshot, "phaseIndex" | "isTruePhase" | "phaseFraction">
): string | null {
  if (snapshot.isTruePhase) return null;
  if (snapshot.phaseIndex === 4 && snapshot.phaseFraction >= FULL_ENOUGH) {
    return "Exact full moon fell just outside this date";
  }
  if (snapshot.phaseIndex === 0 && snapshot.phaseFraction <= NEW_ENOUGH) {
    return "Exact new moon fell just outside this date";
  }
  return null;
}
