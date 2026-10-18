import { getMoonPhase } from "./moonPhase";
import { getBrightLimbAngle, getLunarNorthRotation } from "./brightLimb";
import { toLocalNight, toLocalDayStart } from "./dateUtils";
import { addDays } from "./anniversary";
import type { MilestoneLocation, MoonCarouselItem } from "@/types";

export const MOON_DAY_LIMIT = 30;

export function clampMoonDay(offset: number): number {
  "worklet";
  return Number.isFinite(offset) ? Math.max(-MOON_DAY_LIMIT, Math.min(MOON_DAY_LIMIT, Math.round(offset))) : 0;
}

export function moonCarouselItems(today: string, offset: number, location: MilestoneLocation | null): MoonCarouselItem[] {
  const selected = clampMoonDay(offset);
  const items: MoonCarouselItem[] = [];
  for (let day = Math.max(-MOON_DAY_LIMIT, selected - 2); day <= Math.min(MOON_DAY_LIMIT, selected + 2); day++) {
    const date = addDays(today, day);
    const at = toLocalNight(date, location?.timezoneOffsetMin);
    items.push({
      offset: day,
      date,
      phase: getMoonPhase(at, toLocalDayStart(date, location?.timezoneOffsetMin)),
      brightLimbAngleDeg: location ? getBrightLimbAngle(at, location) : null,
      northAngleDeg: location ? getLunarNorthRotation(at, location) : null,
    });
  }
  return items;
}
