import * as Astronomy from "astronomy-engine";
import type { SkyBody, MilestoneLocation } from "@/types";
import { equatorialToHorizontal } from "./skyTransform";

/**
 * SOLAR SYSTEM BODIES for the sky render. Spec §7.2.
 *
 * SunCalc covers only the sun and moon, which is why astronomy-engine is a
 * dependency now — the earlier spec claimed "you don't need planet positions
 * anywhere in this app", and the sky render made that false.
 *
 * FRAME CONSISTENCY: positions are requested in J2000 (`ofdate = false`) to
 * match the J2000 star catalog. Everything is therefore in one frame, so a
 * planet plots correctly *against the background stars* — which is the only
 * thing a viewer can actually judge. The shared ~25-arcminute precession offset
 * over a 30-year lookback moves the whole sky together and is invisible.
 *
 * Positions are then pushed through our own equatorialToHorizontal so every
 * body on screen goes through one projection path with one set of conventions.
 *
 * TRUE SIZE. Each body carries its distance, radius, flattening, phase and pole,
 * so the view can draw it at the angle it really subtends: the sun and moon at
 * about half a degree, Jupiter at under an arcminute, which is a point of light
 * until the view is zoomed far enough to resolve it.
 */

/** Equatorial radii, km, and polar flattening. IAU WGCCRE 2015. */
const SHAPE = {
  Sun: { radiusKm: 695_700, flattening: 0 },
  Moon: { radiusKm: 1_737.4, flattening: 0 },
  Mercury: { radiusKm: 2_440.53, flattening: 0 },
  Venus: { radiusKm: 6_051.8, flattening: 0 },
  Mars: { radiusKm: 3_396.19, flattening: 0.00589 },
  Jupiter: { radiusKm: 71_492, flattening: 0.06487 },
  Saturn: { radiusKm: 60_268, flattening: 0.09796 },
} as const;

/**
 * North pole directions, J2000 right ascension and declination in degrees,
 * from the IAU WGCCRE 2015 report (constant terms; the drift is a fraction of a
 * degree a century). They set which way a resolved disc is squashed and which
 * way Saturn's rings lie. The moon is drawn from its own photograph and pole
 * angle (brightLimb.getLunarNorthRotation), so it has none here.
 */
const POLES: Partial<Record<keyof typeof SHAPE, [number, number]>> = {
  Sun: [286.13, 63.87],
  Mercury: [281.0103, 61.4155],
  Venus: [272.76, 67.16],
  Mars: [317.681, 52.887],
  Jupiter: [268.057, 64.495],
  Saturn: [40.589, 83.537],
};

const NAKED_EYE = [
  { body: Astronomy.Body.Mercury, label: "Mercury" },
  { body: Astronomy.Body.Venus, label: "Venus" },
  { body: Astronomy.Body.Mars, label: "Mars" },
  { body: Astronomy.Body.Jupiter, label: "Jupiter" },
  { body: Astronomy.Body.Saturn, label: "Saturn" },
] as const;

export interface SolarSystemSky {
  planets: SkyBody[];
  moon: SkyBody | null;
  sun: SkyBody | null;
  /** True when the sun is below the horizon — i.e. stars would actually show. */
  isNight: boolean;
}

/** Kilometres in an astronomical unit. */
export const AU_KM = 149_597_870.7;

/** Half the angle a body subtends, degrees, from its radius and distance. */
export function angularRadiusDeg(radiusKm: number, distanceAu: number): number {
  return (Math.asin(Math.min(1, radiusKm / (distanceAu * AU_KM))) * 180) / Math.PI;
}

export function getSolarSystemSky(
  date: Date,
  location: Pick<MilestoneLocation, "latitude" | "longitude">
): SolarSystemSky {
  const observer = new Astronomy.Observer(
    location.latitude,
    location.longitude,
    0
  );
  const horizon = (raDeg: number, decDeg: number) =>
    equatorialToHorizontal(raDeg, decDeg, location.latitude, location.longitude, date);

  const place = (body: Astronomy.Body, label: keyof typeof SHAPE, fallbackMag: number): SkyBody => {
    // ofdate=false -> J2000, matching the catalog. aberration=true. With an
    // observer, astronomy-engine returns the TOPOCENTRIC position and distance,
    // which for the moon is up to two percent nearer than the Earth's centre.
    const eq = Astronomy.Equator(body, date, observer, false, true);
    const h = horizon(eq.ra * 15, eq.dec); // astronomy-engine returns RA in hours
    let magnitude = fallbackMag;
    let phaseFraction = 1;
    let phaseAngleDeg = 0;
    let ringTiltDeg: number | undefined;
    if (body !== Astronomy.Body.Sun) {
      try {
        const ill = Astronomy.Illumination(body, date);
        if (body !== Astronomy.Body.Moon) magnitude = ill.mag;
        phaseFraction = ill.phase_fraction;
        phaseAngleDeg = ill.phase_angle;
        if (body === Astronomy.Body.Saturn) ringTiltDeg = ill.ring_tilt;
      } catch {
        // Illumination can fail at extreme epochs; the body still has a position.
        magnitude = body === Astronomy.Body.Moon ? fallbackMag : 2;
      }
    }
    const pole = POLES[label];
    const ph = pole ? horizon(pole[0], pole[1]) : null;
    return {
      id: label.toLowerCase(),
      label,
      altitudeDeg: h.altitudeDeg,
      azimuthDeg: h.azimuthDeg,
      magnitude,
      distanceAu: eq.dist,
      ...SHAPE[label],
      phaseFraction,
      phaseAngleDeg,
      pole: ph ? { altitudeDeg: ph.altitudeDeg, azimuthDeg: ph.azimuthDeg } : null,
      ringTiltDeg,
    };
  };

  // No altitude filter. The immersive view renders the full celestial sphere,
  // so a planet below the horizon is still something you can look down at.
  // Culling it here hid Mercury, Venus and Mars on a night when they were
  // simply underfoot (decision 17).
  const planets = NAKED_EYE.map(({ body, label }) => place(body, label, 2));
  const moonPlaced = place(Astronomy.Body.Moon, "Moon", -12.7);
  const sunPlaced = place(Astronomy.Body.Sun, "Sun", -26.7);

  return {
    planets,
    moon: moonPlaced,
    sun: sunPlaced,
    isNight: sunPlaced.altitudeDeg < -6, // civil twilight or darker
  };
}
