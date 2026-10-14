import type { Milestone } from "@/types";
import { getMoonPhase, describePhase, formatIllumination } from "./moonPhase";
import { getMoonReturns } from "./moonReturn";
import { getRarityStat } from "./rarity";
import { getBrightLimbAngle, getLunarNorthRotation } from "./brightLimb";
import { getNightFacts, headlineSentences, shortPlace } from "./nightFacts";
import { daysBetween, formatWeekdayDate } from "./anniversary";
import { toLocalNight, toLocalDayStart } from "./dateUtils";

/** Thresholds tried high-to-low, the same list the record page uses. */
const RARITY_THRESHOLDS = [99.5, 99, 97, 95, 90];

export interface RevealContent {
  moon: {
    phaseFraction: number;
    waxing: boolean;
    brightLimbAngleDeg: number | null;
    northAngleDeg: number | null;
  };
  /** When and where. */
  line1: string;
  /** How lit, with the figure always beside the name. */
  line2: string;
  /** One thing about that night, when there is a place to compute it for. */
  line3: string | null;
  /** How uncommon it was, or else when it comes back. */
  line4: string | null;
}

/**
 * The four lines the reveal speaks, in order. Pure, so the words are tested
 * before anybody watches them arrive.
 */
export function revealContent(
  milestone: Pick<Milestone, "date" | "type" | "location">,
  today: string
): RevealContent {
  const tz = milestone.location?.timezoneOffsetMin;
  const night = toLocalNight(milestone.date, tz);
  const phase = getMoonPhase(night, toLocalDayStart(milestone.date, tz));
  const place =
    milestone.location && milestone.location.latitude !== 0 ? milestone.location : null;

  const when = formatWeekdayDate(milestone.date).replace(/^\w+ /, "");
  const line1 = place ? `${when} · ${shortPlace(place.label)}` : when;
  const line2 = `${describePhase(phase)}, ${formatIllumination(phase.phaseFraction)} lit`;
  const line3 = place ? headlineSentences(getNightFacts(milestone.date, place, tz))[0] ?? null : null;

  const unit = milestone.type === "birthday" ? "birthdays" : "anniversaries";
  const threshold = RARITY_THRESHOLDS.find((t) => phase.phaseFraction * 100 >= t);
  let line4: string | null = null;
  if (threshold !== undefined) {
    const r = getRarityStat(milestone.date, threshold, { tzOffsetMin: tz, today });
    // The frequency is measured at the threshold, not at this moon's own
    // figure, so the line names the threshold. "A moon this full" would claim a
    // rarer sky than the number describes.
    line4 = `1 in ${r.oneInN.toFixed(0)} days has a moon at least ${threshold}% lit. ${r.matchingYears.length} of the ${r.totalYears} ${unit} so far ${r.matchingYears.length === 1 ? "has" : "have"} had one.`;
  } else {
    const md = milestone.date.slice(4);
    const next = getMoonReturns(milestone.date, { tzOffsetMin: tz }).find(
      (r) => daysBetween(`${r.year}${md}`, today) < 0 && (milestone.type !== "birthday" || r.age > 0)
    );
    if (next) line4 = `This moon comes back in ${next.year}, ${next.offsetYears} years on.`;
  }

  return {
    moon: {
      phaseFraction: phase.phaseFraction,
      waxing: phase.waxing,
      brightLimbAngleDeg: place ? getBrightLimbAngle(night, place) : null,
      northAngleDeg: place ? getLunarNorthRotation(night, place) : null,
    },
    line1,
    line2,
    line3,
    line4,
  };
}
