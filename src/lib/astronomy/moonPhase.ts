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

/**
 * Computes moon phase for a given date.
 * `date` MUST be constructed via toLocalNoon() — never pass new Date("YYYY-MM-DD").
 *
 * Returns phase data excluding brightLimbAngleDeg (that needs location — Phase 8).
 */
export function getMoonPhase(
  date: Date
): Pick<MoonSnapshot, "phaseFraction" | "phaseName" | "phaseIndex"> {
  const illumination = SunCalc.getMoonIllumination(date);
  // Map 0–1 phase value to one of 8 discrete states
  // phase 0 = New Moon, 0.5 = Full Moon
  const phaseIndex = Math.round(illumination.phase * 8) % 8;

  return {
    phaseFraction: illumination.fraction,
    phaseName: PHASE_NAMES[phaseIndex],
    phaseIndex,
  };
}

/**
 * Formats illuminated fraction as a percentage string.
 * e.g. 0.777 → "78%"
 */
export function formatIllumination(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}
