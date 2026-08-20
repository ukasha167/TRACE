import type { LightTravelObject } from "@/types";

/**
 * Curated dataset — 20 objects spanning the solar system to the Local Group.
 * Every entry must have distanceUncertaintyNote and source — spec §4 requirement.
 * Distances are best-estimate midpoints in light-years.
 */
export const LIGHT_TRAVEL_OBJECTS: LightTravelObject[] = [
  // ---- Solar system ----
  {
    id: "moon",
    name: "the Moon",
    distanceLightYears: 1.282 / (365.25 * 24 * 3600), // 1.282 light-seconds
    distanceUncertaintyNote: "Varies ±0.05 ls over the lunar orbit",
    source: "Lunar Laser Ranging — mean ~384,400 km",
    category: "planet_moon",
  },
  {
    id: "sun",
    name: "the Sun",
    distanceLightYears: 8.317 / (365.25 * 24 * 60), // 8.317 light-minutes
    distanceUncertaintyNote: "±0.001 AU over Earth's orbit",
    source: "IAU 2012 nominal solar distance: 1 AU = 149,597,870.7 km",
    category: "planet_moon",
  },
  {
    id: "mars-closest",
    name: "Mars (at closest approach)",
    distanceLightYears: 3.03 / (365.25 * 24 * 60), // 3.03 light-minutes
    distanceUncertaintyNote: "Only valid at perihelic opposition; typically 4–20 lm",
    source: "JPL Horizons minimum Earth-Mars distance: ~54.6 million km",
    category: "planet_moon",
  },
  {
    id: "jupiter",
    name: "Jupiter",
    distanceLightYears: 43.2 / (365.25 * 24 * 60), // ~43 light-minutes average
    distanceUncertaintyNote: "Varies 33–53 light-minutes across Jupiter's orbit",
    source: "JPL Horizons mean Earth-Jupiter distance: ~778 million km",
    category: "planet_moon",
  },
  {
    id: "saturn",
    name: "Saturn",
    distanceLightYears: 70.7 / (365.25 * 24 * 60), // ~70 light-minutes
    distanceUncertaintyNote: "Varies 68–84 light-minutes across Saturn's orbit",
    source: "JPL Horizons mean Earth-Saturn distance: ~1.27 billion km",
    category: "planet_moon",
  },
  {
    id: "pluto",
    name: "Pluto",
    distanceLightYears: 5.3 / (365.25 * 24), // ~5.3 light-hours average
    distanceUncertaintyNote: "Varies 3.3–6.1 light-hours across Pluto's highly elliptical orbit",
    source: "JPL Horizons semi-major axis: 39.5 AU",
    category: "planet_moon",
  },
  {
    id: "voyager1",
    name: "the edge of the heliosphere",
    distanceLightYears: 23.0 / (365.25 * 24), // ~23 light-hours (~2024)
    distanceUncertaintyNote:
      "Voyager 1 crossed the heliopause in 2012; distance increases ~3.6 AU/yr",
    source: "NASA JPL Voyager Mission Status (2024): ~163 AU from Sun",
    category: "planet_moon",
  },
  // ---- Nearby stars ----
  {
    id: "proxima-centauri",
    name: "Proxima Centauri",
    distanceLightYears: 4.244,
    distanceUncertaintyNote: "±0.001 ly (parallax precision)",
    source: "Gaia DR3, Reylé et al. 2021: 1.2948 ± 0.0005 pc",
    category: "star",
  },
  {
    id: "sirius",
    name: "Sirius",
    distanceLightYears: 8.6,
    distanceUncertaintyNote: "±0.04 ly",
    source: "Hipparcos catalogue, van Leeuwen 2007: 2.637 ± 0.011 pc",
    category: "star",
  },
  {
    id: "vega",
    name: "Vega",
    distanceLightYears: 25.04,
    distanceUncertaintyNote: "±0.08 ly",
    source: "Hipparcos, van Leeuwen 2007: 7.68 ± 0.02 pc",
    category: "star",
  },
  {
    id: "fomalhaut",
    name: "Fomalhaut",
    distanceLightYears: 25.13,
    distanceUncertaintyNote: "±0.09 ly",
    source: "Hipparcos, van Leeuwen 2007: 7.704 ± 0.028 pc",
    category: "star",
  },
  {
    id: "betelgeuse",
    name: "Betelgeuse",
    distanceLightYears: 700,
    distanceUncertaintyNote: "±130 ly — parallax difficult due to extended atmosphere",
    source:
      "Harper et al. 2017, Joyce et al. 2020: 168–222 pc range; midpoint ~200 pc used",
    category: "star",
  },
  // ---- Star clusters & nebulae ----
  {
    id: "pleiades",
    name: "the Pleiades",
    distanceLightYears: 444,
    distanceUncertaintyNote: "±2 ly (Gaia); older Hipparcos measurement gave 392 ly",
    source: "Gaia DR2, Abramson 2018: 136.2 ± 0.6 pc",
    category: "star_cluster",
  },
  {
    id: "orion-nebula",
    name: "the Orion Nebula",
    distanceLightYears: 1_344,
    distanceUncertaintyNote: "±20 ly",
    source: "Menten et al. 2007 VLBI parallax: 414 ± 7 pc",
    category: "nebula",
  },
  {
    id: "ring-nebula",
    name: "the Ring Nebula (M57)",
    distanceLightYears: 2_300,
    distanceUncertaintyNote: "±200 ly — distance is notoriously hard to pin down",
    source: "Jacoby et al. 1997 / Gaia DR3 estimates: ~700 pc",
    category: "nebula",
  },
  {
    id: "crab-nebula",
    name: "the Crab Nebula (M1)",
    distanceLightYears: 6_523,
    distanceUncertaintyNote: "±500 ly",
    source: "Trimble 1973, Kaplan et al. 2008: ~2 kpc",
    category: "nebula",
  },
  // ---- Galactic scale ----
  {
    id: "galactic-center",
    name: "the center of the Milky Way",
    distanceLightYears: 26_670,
    distanceUncertaintyNote: "±250 ly (systematic)",
    source: "Gravity Collaboration 2021 (Sgr A* orbit): 8.178 ± 0.013 ± 0.022 kpc",
    category: "star_cluster",
  },
  // ---- Local Group ----
  {
    id: "lmc",
    name: "the Large Magellanic Cloud",
    distanceLightYears: 160_000,
    distanceUncertaintyNote: "±2,000 ly",
    source: "Pietrzyński et al. 2019 (eclipsing binaries): 49.59 ± 0.09 kpc",
    category: "galaxy",
  },
  {
    id: "smc",
    name: "the Small Magellanic Cloud",
    distanceLightYears: 200_000,
    distanceUncertaintyNote: "±6,000 ly — depth extent adds uncertainty",
    source: "Graczyk et al. 2014: 62.1 ± 1.9 kpc",
    category: "galaxy",
  },
  {
    id: "andromeda",
    name: "the Andromeda Galaxy (M31)",
    distanceLightYears: 2_537_000,
    distanceUncertaintyNote: "±46,000 ly",
    source: "Riess et al. 2012 (Cepheid): 778 ± 14 kpc",
    category: "galaxy",
  },
];

// Pre-sort ascending for binary-search-style lookup
export const SORTED_OBJECTS = [...LIGHT_TRAVEL_OBJECTS].sort(
  (a, b) => a.distanceLightYears - b.distanceLightYears
);
