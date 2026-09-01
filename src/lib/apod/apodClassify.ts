import type { ApodKind } from "@/types";

/**
 * Nouns that name a non-photographic asset.
 * "artist's concept/illustration/rendering" is included because APOD uses it
 * constantly for exoplanets and spacecraft — those are paintings, not photos.
 */
const ASSET_NOUN =
  "(illustration|diagram|chart|map|schematic|animation|simulation|artist.s (concept|illustration|rendering))";

/**
 * The author pointing AT the asset: "the above illustration shows...",
 * "pictured above is a diagram of...", "...map, shown here".
 *
 * WHY POSITIONAL, AND NOT SOMETHING SIMPLER — both simpler rules were tested
 * against 160 sampled APOD dates and both fail:
 *
 *   1. File extension is NOT a valid signal. Early APOD served genuine
 *      photographs as GIFs — 25% of 1996-2000 entries are .gif, including
 *      1995-06-20 "Pleiades Star Cluster", a real photo. An extension rule
 *      would misclassify a quarter of that era.
 *
 *   2. A bare keyword scan is NOT valid either. Matching the nouns anywhere
 *      in the explanation false-positives on prose that mentions a map or
 *      chart in passing (e.g. 2001-01-15 "Billows of Smog in the Outer
 *      Galaxy", which is a photograph).
 *
 * Requiring the author's own positional reference is what makes it precise.
 * Measured hit rate: ~5% of 1996-2000, ~3% of 2001-2015, ~0% of 2016-2025 —
 * roughly 1 date in 20 overall. A real class, not a special case.
 */
const POSITIONAL = new RegExp(
  `\\b(the above|pictured above|above (is|shows)|shown (above|here))[^.]{0,60}\\b${ASSET_NOUN}\\b` +
    `|\\b${ASSET_NOUN}\\b[^.]{0,40}\\b(above|shown here)\\b`,
  "i"
);

/**
 * Classifies what kind of asset an APOD entry actually is. Spec §8.3.
 *
 * This does NOT decide the hero — the sky render is always the hero. It decides
 * how the (secondary) APOD card renders, so a diagram or a video is presented
 * as what it is rather than stretched into an image frame.
 */
export function classifyApod(input: {
  mediaType: "image" | "video";
  explanation: string;
}): ApodKind {
  if (input.mediaType === "video") return "video";
  if (POSITIONAL.test(input.explanation ?? "")) return "illustrative";
  return "photograph";
}
