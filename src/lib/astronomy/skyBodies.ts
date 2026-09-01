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
 */

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

export function getSolarSystemSky(
  date: Date,
  location: Pick<MilestoneLocation, "latitude" | "longitude">
): SolarSystemSky {
  const observer = new Astronomy.Observer(
    location.latitude,
    location.longitude,
    0
  );

  const place = (body: Astronomy.Body, label: string, magnitude: number) => {
    // ofdate=false -> J2000, matching the catalog. aberration=true.
    const eq = Astronomy.Equator(body, date, observer, false, true);
    const h = equatorialToHorizontal(
      eq.ra * 15, // astronomy-engine returns RA in hours
      eq.dec,
      location.latitude,
      location.longitude,
      date
    );
    return {
      id: label.toLowerCase(),
      label,
      altitudeDeg: h.altitudeDeg,
      azimuthDeg: h.azimuthDeg,
      magnitude,
    };
  };

  const planets: SkyBody[] = [];
  for (const { body, label } of NAKED_EYE) {
    let magnitude = 0;
    try {
      magnitude = Astronomy.Illumination(body, date).mag;
    } catch {
      // Illumination can fail at extreme epochs; the body still has a position.
      magnitude = 2;
    }
    // No altitude filter. The immersive view renders the full celestial
    // sphere, so a planet below the horizon is still something you can look
    // down at — culling it here made only Saturn appear on a night when the
    // other four were simply underfoot.
    planets.push(place(body, label, magnitude));
  }

  const moonPlaced = place(Astronomy.Body.Moon, "Moon", -12.7);
  const sunPlaced = place(Astronomy.Body.Sun, "Sun", -26.7);

  return {
    planets,
    moon: moonPlaced,
    sun: sunPlaced,
    isNight: sunPlaced.altitudeDeg < -6, // civil twilight or darker
  };
}
