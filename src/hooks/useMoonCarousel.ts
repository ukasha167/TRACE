import { useMemo } from "react";
import { moonCarouselItems } from "@/lib/astronomy/moonCarousel";
import { todayDateString } from "@/lib/astronomy/dateUtils";
import type { MilestoneLocation } from "@/types";

export function useMoonCarousel(offset: number, location: MilestoneLocation | null) {
  const today = todayDateString();
  return useMemo(() => moonCarouselItems(today, offset, location), [offset, location, today]);
}
