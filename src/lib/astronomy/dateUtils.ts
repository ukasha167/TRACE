/**
 * Converts a "YYYY-MM-DD" date string to a Date object at local noon.
 *
 * WHY THIS EXISTS: `new Date("YYYY-MM-DD")` parses the string as UTC midnight,
 * which silently shifts to the *previous* calendar day in any timezone behind UTC
 * (e.g., UTC-5 sees 1990-04-15 become Apr 14 at 7pm). This app is nothing but
 * date math — this bug must be caught once, here, and nowhere else.
 *
 * Use this for calendar-date identity (cache keys, display, age arithmetic).
 * For anything describing how the moon actually LOOKED, use toLocalNight()
 * instead — see the note there.
 */
export function toLocalNoon(dateString: string): Date {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

/**
 * The instant of local midnight at the END of the given date — i.e. 00:00 on
 * the following day.
 *
 * WHY: "the moon on October 27th" means the moon you'd see on the evening of
 * the 27th, which runs past midnight into the 28th. Local noon is the wrong
 * sample point for appearance — the moon's illuminated fraction moves up to
 * ~1.2%/hour near the quarters, so noon vs. night can differ by well over a
 * percentage point, and near the terminator the phase NAME can flip outright.
 *
 * Spec §6.1. Use this for every appearance-related computation (illumination,
 * bright-limb tilt, the sky render) so the convention lives in one place.
 *
 * @param tzOffsetMin Minutes from UTC at the milestone's location and date.
 *                    Omit to use the device's local timezone.
 */
export function toLocalNight(dateString: string, tzOffsetMin?: number): Date {
  const [year, month, day] = dateString.split("-").map(Number);
  if (tzOffsetMin === undefined) {
    // Day + 1 with day-of-month overflow handled by the Date constructor.
    return new Date(year, month - 1, day + 1, 0, 0, 0);
  }
  return new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0) - tzOffsetMin * 60_000);
}

/**
 * The instant of local midnight that BEGINS the given date.
 * Needed for the isTruePhase syzygy check, which asks whether an instant falls
 * inside a specific calendar day.
 */
export function toLocalDayStart(dateString: string, tzOffsetMin?: number): Date {
  const [year, month, day] = dateString.split("-").map(Number);
  if (tzOffsetMin === undefined) {
    return new Date(year, month - 1, day, 0, 0, 0);
  }
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - tzOffsetMin * 60_000);
}

/**
 * Formats a Date object to "YYYY-MM-DD" string for storage and cache keys.
 * Always uses the local calendar date, not UTC.
 */
export function toDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Returns today as a "YYYY-MM-DD" string in local time.
 */
export function todayDateString(): string {
  return toDateString(new Date());
}

/** Splits "YYYY-MM-DD" into numeric parts. */
export function parseDateString(dateString: string): {
  year: number;
  month: number;
  day: number;
} {
  const [year, month, day] = dateString.split("-").map(Number);
  return { year, month, day };
}

/**
 * Formats an instant as "HH:mm" in the given timezone offset (or device local).
 */
export function formatLocalTime(date: Date, tzOffsetMin?: number): string {
  if (tzOffsetMin === undefined) {
    return `${String(date.getHours()).padStart(2, "0")}:${String(
      date.getMinutes()
    ).padStart(2, "0")}`;
  }
  const shifted = new Date(date.getTime() + tzOffsetMin * 60_000);
  return `${String(shifted.getUTCHours()).padStart(2, "0")}:${String(
    shifted.getUTCMinutes()
  ).padStart(2, "0")}`;
}

/**
 * Approximates a location's UTC offset from its longitude.
 *
 * WHY AN APPROXIMATION: real timezone boundaries are political, and resolving
 * them properly needs a tz database keyed by date (offsets move — DST rules
 * change, countries re-zone). Bundling that is far more weight than this app's
 * use of the value justifies.
 *
 * The value only picks WHICH INSTANT we sample as "that night" (spec §6.1).
 * Being an hour out shifts the sample by an hour, which moves illuminated
 * fraction by well under a percent and never changes a phase name. Solar-time
 * offsets are correct to the hour for most of the world; the known bad cases
 * are countries spanning many degrees on one political offset (western China is
 * ~2h out) and half-hour zones like India (30 min out).
 *
 * It is NOT used for displaying clock times, where that error would matter.
 */
export function approximateTimezoneOffsetMin(longitude: number): number {
  const hours = Math.round(longitude / 15);
  // Math.round returns -0 for small negative inputs, and -0 is not strictly
  // equal to 0. Normalise so callers comparing offsets never get a surprise.
  return hours === 0 ? 0 : hours * 60;
}
