import { useEffect } from "react";
import { preloadSkyAssets } from "@/components/sky/skyAssets";
import { MOON_IMG, drawSkyMoonImage, skyMoonKey } from "@/components/sky/skyMoonImage";
import { loadMoonTextures } from "@/components/moon/moonTextures";
import { moonLightAt } from "@/lib/astronomy/brightLimb";
import { toLocalNight } from "@/lib/astronomy/dateUtils";
import { moonStepOf, skySphereFor } from "./skyCache";
import type { MilestoneLocation } from "@/types";

/** Long enough that a carousel swipe has landed and nobody is mid-gesture. */
const SETTLE_MS = 600;

/**
 * Builds what the sky view would open on, while nothing else is happening:
 * its images and font, the star sphere, and the 2048 px moon. The sky takes
 * all three from memory on its first render, so its entrance starts on its
 * first frame instead of after a draw it used to make on every open.
 *
 * `date` null is tonight, for the step the sky would open in now; a date is
 * that night in the place's own time, which is what a record or the carousel
 * opens. The keys here and in app/sky/[id].tsx must agree or this is wasted.
 */
export function useSkyPrewarm(place: MilestoneLocation | null, date: string | null): void {
  useEffect(() => {
    if (!place) return;
    let alive = true;
    let task: number | null = null;
    const timer = setTimeout(() => {
      task = requestIdleCallback(async () => {
        preloadSkyAssets();
        const anchorMs = date ? toLocalNight(date, place.timezoneOffsetMin).getTime() : moonStepOf(Date.now());
        skySphereFor(place, anchorMs);
        const textures = await loadMoonTextures(MOON_IMG);
        if (!alive || !textures) return;
        drawSkyMoonImage(skyMoonKey(place, anchorMs), moonLightAt(new Date(anchorMs), place), textures);
      });
    }, SETTLE_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
      if (task != null) cancelIdleCallback(task);
    };
  }, [place, date]);
}
