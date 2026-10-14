import type { Milestone, MoonReturn } from "@/types";
import { getMoonPhase } from "./moonPhase";
import { getMoonReturns } from "./moonReturn";
import { parseDateString, toLocalNight, toLocalDayStart } from "./dateUtils";

/**
 * THE NEXT TIME THE DATE COMES ROUND, and the moon it will bring.
 *
 * Home sorts by this and the record page leads with it, because "in 41 days"
 * is the reason to open the app again and "25 October 2007" on its own is not.
 *
 * The moon is sampled exactly as the record's own night is: local midnight at
 * the END of the date, in the record's timezone, so the forecast and the
 * original are the same measurement a year apart. A forecast sampled at noon
 * would disagree with the record by up to a percent and a half near the
 * quarters, and "the same moon as then" would be a claim about two different
 * instants.
 */

const DAY_MS = 86_400_000;

export interface Anniversary {
  /** "YYYY-MM-DD" of the next occurrence, today included. */
  date: string;
  year: number;
  /** 0 when it is today. */
  daysLeft: number;
  /** Years since the source date. 0 when the record itself is still ahead. */
  age: number;
  phase: ReturnType<typeof getMoonPhase>;
  /** The moon comes back to the source phase this year. */
  moonReturn: MoonReturn | null;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Whole calendar days from `from` to `to`, both "YYYY-MM-DD". */
export function daysBetween(from: string, to: string): number {
  const a = parseDateString(from);
  const b = parseDateString(to);
  return Math.round(
    (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / DAY_MS
  );
}

/**
 * When the date next comes round, and nothing about the moon. Home sorts every
 * record by this, and the moon half of nextAnniversary costs a return search
 * per record that only the first card on Home ever shows.
 */
export function anniversaryDate(
  milestone: Pick<Milestone, "date">,
  today: string
): Pick<Anniversary, "date" | "year" | "daysLeft" | "age"> {
  const source = parseDateString(milestone.date);
  const now = parseDateString(today);

  // Feb 29 skips common years, the same rule getMoonReturns follows. Sliding
  // to Mar 1 would forecast a different sky and call it the anniversary.
  const exists = (year: number) =>
    !(source.month === 2 && source.day === 29 && !isLeapYear(year));

  let year = Math.max(now.year, source.year);
  const dateIn = (y: number) => `${y}-${pad(source.month)}-${pad(source.day)}`;
  while (!exists(year) || daysBetween(today, dateIn(year)) < 0) year++;

  const date = dateIn(year);
  return { date, year, daysLeft: daysBetween(today, date), age: year - source.year };
}

/**
 * @param today "YYYY-MM-DD" in the phone's own calendar. Passed in rather than
 *              read, so the tests can stand on a fixed day.
 */
export function nextAnniversary(
  milestone: Pick<Milestone, "date" | "type" | "location">,
  today: string
): Anniversary {
  const source = parseDateString(milestone.date);
  const tzOffsetMin = milestone.location?.timezoneOffsetMin;
  const { date, year, daysLeft, age } = anniversaryDate(milestone, today);
  const phase = getMoonPhase(
    toLocalNight(date, tzOffsetMin),
    toLocalDayStart(date, tzOffsetMin)
  );

  const moonReturn =
    year === source.year
      ? null
      : getMoonReturns(milestone.date, { tzOffsetMin }).find((r) => r.year === year) ?? null;

  return { date, year, daysLeft, age, phase, moonReturn };
}

/** "Tonight", "Tomorrow", "In 41 days". */
export function countdownLabel(daysLeft: number): string {
  if (daysLeft === 0) return "Tonight";
  if (daysLeft === 1) return "Tomorrow";
  return `In ${daysLeft} days`;
}

/**
 * The moon that night, said forward. Full and new are named only on the same
 * illumination line describePhase uses, and the figure always ships with them.
 */
export function describeComingMoon(
  phase: Pick<ReturnType<typeof getMoonPhase>, "phaseFraction" | "waxing">,
  formatted: string
): string {
  if (phase.phaseFraction >= 0.99) return `The moon will be full, ${formatted} lit.`;
  if (phase.phaseFraction <= 0.01) return `The moon will be new, ${formatted} lit.`;
  return `The moon will be ${formatted} lit, ${phase.waxing ? "waxing" : "waning"}.`;
}

/** "27th birthday", "19th anniversary", "8 years on". */
export function occasionLabel(type: Milestone["type"], age: number): string {
  if (age === 0) return type === "birthday" ? "The day itself" : "The date itself";
  if (type === "birthday") return `${ordinal(age)} birthday`;
  if (type === "anniversary") return `${ordinal(age)} anniversary`;
  return `${age} ${age === 1 ? "year" : "years"} on`;
}

export function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "Wednesday 20 January 2027", built by hand so no engine adds a comma. */
export function formatWeekdayDate(dateString: string): string {
  const { year, month, day } = parseDateString(dateString);
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${weekday} ${day} ${MONTHS[month - 1]} ${year}`;
}

/** "Sat 3 October", on the phone's own calendar. */
export function formatDeviceDay(at: Date): string {
  return `${WEEKDAYS[at.getDay()].slice(0, 3)} ${at.getDate()} ${MONTHS[at.getMonth()]}`;
}

/** "YYYY-MM-DD" plus `days`, calendar arithmetic only. */
export function addDays(dateString: string, days: number): string {
  const { year, month, day } = parseDateString(dateString);
  const t = new Date(Date.UTC(year, month - 1, day) + days * DAY_MS);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
