import * as Astronomy from "astronomy-engine";
import type { MilestoneLocation } from "@/types";

/**
 * TONIGHT'S TOOLS: the next full and new moon, and when the moon rises and sets.
 *
 * These are the one place the app prints clock times, and it can because they
 * are for the phone's own position on the phone's own clock. The record-side
 * rule against clock times (nightFacts) is about offsets estimated from a
 * longitude; here nothing is estimated. Callers format the instants in the
 * device's zone.
 */

const DAY_MS = 86_400_000;

export interface PhaseEvent {
  kind: "full" | "new";
  at: Date;
}

/** The next exact full and new moon after `from`, soonest first. */
export function nextPhases(from: Date): PhaseEvent[] {
  const full = Astronomy.SearchMoonPhase(180, from, 40);
  const fresh = Astronomy.SearchMoonPhase(0, from, 40);
  const out: PhaseEvent[] = [];
  if (full) out.push({ kind: "full", at: full.date });
  if (fresh) out.push({ kind: "new", at: fresh.date });
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** Every exact full and new moon between `from` and `days` later. */
export function phaseEventsBetween(from: Date, days: number): PhaseEvent[] {
  const out: PhaseEvent[] = [];
  const until = from.getTime() + days * DAY_MS;
  for (const [kind, lon] of [["full", 180], ["new", 0]] as const) {
    let cursor = from;
    for (;;) {
      const hit = Astronomy.SearchMoonPhase(lon, cursor, days + 1);
      if (!hit || hit.date.getTime() > until) break;
      out.push({ kind, at: hit.date });
      cursor = new Date(hit.date.getTime() + DAY_MS);
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

export interface RiseSet {
  rise: Date | null;
  set: Date | null;
}

/**
 * The moonrise that starts tonight's appearance, and the moonset that ends it.
 *
 * Searched from `from` minus half a day so a moon that rose this afternoon and
 * is still up counts as tonight's, and the set is the first one after that rise.
 */
export function moonRiseSet(
  from: Date,
  location: Pick<MilestoneLocation, "latitude" | "longitude">
): RiseSet {
  const observer = new Astronomy.Observer(location.latitude, location.longitude, 0);
  const start = new Date(from.getTime() - DAY_MS / 2);
  const rise = Astronomy.SearchRiseSet(Astronomy.Body.Moon, observer, +1, start, 1.5)?.date ?? null;
  const set = rise
    ? Astronomy.SearchRiseSet(Astronomy.Body.Moon, observer, -1, rise, 1.5)?.date ?? null
    : null;
  return { rise, set };
}
