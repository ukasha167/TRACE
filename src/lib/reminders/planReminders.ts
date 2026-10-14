import type { Milestone } from "@/types";
import { getMoonPhase, formatIllumination } from "@/lib/astronomy/moonPhase";
import { getMoonReturns } from "@/lib/astronomy/moonReturn";
import { daysBetween } from "@/lib/astronomy/anniversary";
import { shortPlace } from "@/lib/astronomy/nightFacts";
import {
  parseDateString,
  toLocalNight,
  toLocalDayStart,
} from "@/lib/astronomy/dateUtils";

/**
 * WHAT THE PHONE SAYS ON THE DAY. Pure, so the words can be tested before any
 * of them reach a lock screen.
 *
 * The text is written ahead for each year rather than at delivery, because a
 * scheduled local notification cannot run code when it fires. That is also why
 * the plan covers a few years per record and is rebuilt on every launch, edit
 * and delete: iOS keeps at most 64 pending requests, and a plan written once
 * would go stale the moment a record changed.
 */

export interface PlannedReminder {
  /** Stable per record and year, so a rebuild can tell what it already scheduled. */
  key: string;
  milestoneId: string;
  /** "YYYY-MM-DD", delivered at REMINDER_HOUR on the phone's clock that day. */
  date: string;
  title: string;
  body: string;
}

/** Early evening: late enough to be about the night, early enough to go and look. */
export const REMINDER_HOUR = 19;

/** Leaves room under iOS's 64 for anything else the app schedules. */
export const REMINDER_LIMIT = 60;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** The figure always ships with the name (CLAUDE.md, rule 1). */
function pastTense(fraction: number): string {
  if (fraction >= 0.99) return `full, ${formatIllumination(fraction)} lit`;
  if (fraction <= 0.01) return `new, ${formatIllumination(fraction)} lit`;
  return `${formatIllumination(fraction)} lit`;
}

/**
 * @param returnYears The years the moon comes back to the record's phase. The
 *                    plan passes them in so the search runs once per record
 *                    rather than once per year it writes.
 */
export function reminderBody(
  milestone: Pick<Milestone, "date" | "location">,
  year: number,
  returnYears?: ReadonlySet<number>
): string {
  const tz = milestone.location?.timezoneOffsetMin;
  const source = parseDateString(milestone.date);
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${year}-${pad(source.month)}-${pad(source.day)}`;

  const tonight = getMoonPhase(toLocalNight(date, tz), toLocalDayStart(date, tz));
  const where = milestone.location ? ` over ${shortPlace(milestone.location.label)}` : "";
  const lead = `Tonight's moon${where} is ${formatIllumination(tonight.phaseFraction)} lit.`;
  if (year === source.year) return lead;

  const then = getMoonPhase(toLocalNight(milestone.date, tz)).phaseFraction;
  let body = `${lead} On this night in ${source.year} it was ${pastTense(then)}.`;
  const returns =
    returnYears ?? new Set(getMoonReturns(milestone.date, { tzOffsetMin: tz }).map((r) => r.year));
  // "Back to that night's phase", not "the same moon": a return is within a
  // day of the phase, which can still be a point or two of light apart.
  if (returns.has(year)) body += ` The moon is back to that night's phase, ${year - source.year} years on.`;
  return body;
}

/**
 * Every reminder to schedule, soonest first.
 *
 * @param today       "YYYY-MM-DD" on the phone's calendar.
 * @param yearsAhead  How many upcoming anniversaries per record.
 */
export function planReminders(
  milestones: Pick<Milestone, "id" | "title" | "date" | "location">[],
  enabledIds: readonly string[],
  today: string,
  yearsAhead = 3,
  limit = REMINDER_LIMIT
): PlannedReminder[] {
  const enabled = new Set(enabledIds);
  const pad = (n: number) => String(n).padStart(2, "0");
  const plan: PlannedReminder[] = [];
  const now = parseDateString(today);

  for (const m of milestones) {
    if (!enabled.has(m.id)) continue;
    const source = parseDateString(m.date);
    const returnYears = new Set(
      getMoonReturns(m.date, { tzOffsetMin: m.location?.timezoneOffsetMin }).map((r) => r.year)
    );
    let year = Math.max(now.year, source.year);
    let added = 0;
    // A Feb 29 record needs up to eight calendar years to find three leap ones.
    for (let guard = 0; added < yearsAhead && guard < yearsAhead * 4 + 8; guard++, year++) {
      if (source.month === 2 && source.day === 29 && !isLeapYear(year)) continue;
      const date = `${year}-${pad(source.month)}-${pad(source.day)}`;
      if (daysBetween(today, date) < 0) continue;
      plan.push({
        key: `${m.id}:${year}`,
        milestoneId: m.id,
        date,
        title: m.title,
        body: reminderBody(m, year, returnYears),
      });
      added++;
    }
  }

  plan.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return plan.slice(0, limit);
}
