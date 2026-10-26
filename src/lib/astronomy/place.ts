import type { MilestoneLocation } from "@/types";

/**
 * The record's place, or null when it has none worth drawing a sky over.
 *
 * An earlier build saved typed places at latitude 0, longitude 0 (spec §10).
 * Seven screens each checked for that by hand, and the next screen to forget
 * would draw a sky over a place nobody chose.
 */
export function placeOf(location: MilestoneLocation | null | undefined): MilestoneLocation | null {
  return location && location.latitude !== 0 ? location : null;
}
