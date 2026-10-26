import type { Milestone } from "@/types";
import { getMoonPhase, formatIllumination, FULL_ENOUGH, NEW_ENOUGH } from "@/lib/astronomy/moonPhase";
import { getMoonReturns } from "@/lib/astronomy/moonReturn";
import { daysBetween } from "@/lib/astronomy/anniversary";
import { shortPlace } from "@/lib/astronomy/nightFacts";
import { anniversaryOn, parseDateString, toLocalNight } from "@/lib/astronomy/dateUtils";

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

/** The figure always ships with the name (CLAUDE.md, rule 1). */
function pastTense(fraction: number): string {
  if (fraction >= FULL_ENOUGH) return `full, ${formatIllumination(fraction)} lit`;
  if (fraction <= NEW_ENOUGH) return `new, ${formatIllumination(fraction)} lit`;
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
  // Callers pass only years that have the date (planReminders, nextAnniversary).
  const date = `${year}${milestone.date.slice(4)}`;

  const tonight = getMoonPhase(toLocalNight(date, tz));
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
      const date = anniversaryOn(m.date, year);
      if (date === null || daysBetween(today, date) < 0) continue;
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

/**
 * Every pending notification this app owns carries this prefix, and nothing
 * else is ever cancelled. The rest of the identifier is the record, the year
 * and a hash of the words, so an edit that changes the text changes the id and
 * the old request is replaced rather than left to fire with yesterday's title.
 */
export const REMINDER_PREFIX = "trace:";

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function reminderId(p: PlannedReminder): string {
  return `${REMINDER_PREFIX}${p.key}:${hash(p.title + p.body)}`;
}

/**
 * What to cancel and what to schedule to bring the phone's pending requests in
 * line with the plan. Pure so it can be tested: an identifier that drifted
 * between runs once cancelled and rescheduled every reminder on every launch,
 * and the only symptom was reminders that never arrived.
 */
export function diffReminders(
  scheduledIds: readonly string[],
  plan: readonly PlannedReminder[]
): { cancel: string[]; schedule: { identifier: string; reminder: PlannedReminder }[] } {
  const wanted = new Map(plan.map((p) => [reminderId(p), p]));
  const have = new Set<string>();
  const cancel: string[] = [];
  for (const id of scheduledIds) {
    if (!id.startsWith(REMINDER_PREFIX)) continue;
    if (wanted.has(id)) have.add(id);
    else cancel.push(id);
  }
  const schedule = [...wanted]
    .filter(([id]) => !have.has(id))
    .map(([identifier, reminder]) => ({ identifier, reminder }));
  return { cancel, schedule };
}
