import { differenceInCalendarDays } from "date-fns";

/**
 * Sidereal orbital periods in Earth days.
 * Source: CLAUDE.md §6.1 — do not regenerate these from model memory.
 */
export const ORBITAL_PERIODS_DAYS = {
  mercury: 87.97,
  venus: 224.70,
  earth: 365.25,
  mars: 686.98,
  jupiter: 4332.59,
  saturn: 10759.22,
  uranus: 30688.5,
  neptune: 60182,
} as const;

export type Planet = keyof typeof ORBITAL_PERIODS_DAYS;

export const PLANET_DISPLAY = {
  mercury: { label: "Mercury", emoji: "☿", color: "#B5B5B5" },
  venus:   { label: "Venus",   emoji: "♀", color: "#E8C98A" },
  earth:   { label: "Earth",   emoji: "🌍", color: "#6EA8D6" },
  mars:    { label: "Mars",    emoji: "♂", color: "#C1553A" },
  jupiter: { label: "Jupiter", emoji: "♃", color: "#C4A882" },
  saturn:  { label: "Saturn",  emoji: "♄", color: "#D4BC8E" },
  uranus:  { label: "Uranus",  emoji: "⛢", color: "#7FCFD4" },
  neptune: { label: "Neptune", emoji: "♆", color: "#4B70DD" },
} as const;

export const PLANET_ORDER: Planet[] = [
  "mercury", "venus", "earth", "mars",
  "jupiter", "saturn", "uranus", "neptune",
];

/**
 * Returns the age in planetary years for a given birth date and reference date.
 * Both dates should be constructed via toLocalNoon() to avoid timezone bugs.
 */
export function getAgeInPlanetYears(
  birthDate: Date,
  today: Date,
  planet: Planet
): number {
  const daysSinceBirth = differenceInCalendarDays(today, birthDate);
  if (daysSinceBirth < 0) return 0;
  return daysSinceBirth / ORBITAL_PERIODS_DAYS[planet];
}

/**
 * Returns ages across all planets for a given birth date.
 */
export function getAllPlanetaryAges(
  birthDate: Date,
  today: Date
): Record<Planet, number> {
  return Object.fromEntries(
    PLANET_ORDER.map((planet) => [planet, getAgeInPlanetYears(birthDate, today, planet)])
  ) as Record<Planet, number>;
}
