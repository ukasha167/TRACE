/**
 * Converts a "YYYY-MM-DD" date string to a Date object at local noon.
 *
 * WHY THIS EXISTS: `new Date("YYYY-MM-DD")` parses the string as UTC midnight,
 * which silently shifts to the *previous* calendar day in any timezone behind UTC
 * (e.g., UTC-5 sees 1990-04-15 become Apr 14 at 7pm). This app is nothing but
 * date math — this bug must be caught once, here, and nowhere else.
 *
 * Noon is chosen because SunCalc moon phase results are essentially identical
 * at any time of day for a calendar-date purpose, and noon avoids DST edge cases
 * at midnight vs. 1am.
 */
export function toLocalNoon(dateString: string): Date {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
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
