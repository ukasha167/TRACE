import * as Astronomy from "astronomy-engine";
import type { MilestoneLocation } from "@/types";
import type { WorldCameraAxes } from "./attitude";
import { equatorialToHorizontal } from "./skyTransform";

/**
 * THE NIGHT AS A SPAN OF TIME, for the sky view's scrubber.
 *
 * The immersive view used to show one instant. A night is hours long, and the
 * thing people remember about it (the moon coming up, Orion climbing, the sky
 * going pale) is motion. This module holds the time-dependent parts the view
 * needs without giving up the precomputed sphere that keeps it at frame rate.
 */

const DEG = Math.PI / 180;
const HOUR_MS = 3_600_000;

type Vec3 = { x: number; y: number; z: number };

/**
 * The camera that sees, in a sphere computed for t0, the sky as it stands at a
 * later instant.
 *
 * WHY THE CAMERA TURNS AND NOT THE STARS. Between two instants the whole
 * starry sky turns rigidly about the celestial pole by the change in local
 * sidereal time. Rotating six thousand star vectors per scrub step would undo
 * the reason the sphere is precomputed. Rotating the camera by the inverse is
 * the same picture for three vectors: v_t · c = (R v_0) · c = v_0 · (Rᵀ c).
 *
 * THE SENSE. With the horizon frame as (east, north, up) the pole points along
 * p = (0, cos φ, sin φ). A star's hour angle H grows with time, and working
 * through the equatorial-to-horizontal formulas, H carries the meridian
 * direction a = (0, -sin φ, cos φ) toward west, b = (-1, 0, 0). Since a × b = -p,
 * that is a turn of +ΔH about -p, so R = Rot(p, -ΔH) and the camera takes
 * Rot(p, +ΔH). A test checks this against equatorialToHorizontal directly,
 * because a sign here would run the sky backwards and look perfectly plausible.
 *
 * The ground, the horizon, the cardinal points and the bodies of the solar
 * system do not ride this rotation; they are drawn through the unrotated camera.
 */
export function siderealCamera(
  axes: WorldCameraAxes,
  latitudeDeg: number,
  deltaLstDeg: number
): WorldCameraAxes {
  const phi = latitudeDeg * DEG;
  const p = { x: 0, y: Math.cos(phi), z: Math.sin(phi) };
  const t = deltaLstDeg * DEG;
  const c = Math.cos(t);
  const s = Math.sin(t);
  // Rodrigues: v cos t + (p × v) sin t + p (p · v)(1 - cos t)
  const rot = (v: Vec3): Vec3 => {
    const cx = p.y * v.z - p.z * v.y;
    const cy = p.z * v.x - p.x * v.z;
    const cz = p.x * v.y - p.y * v.x;
    const d = (p.x * v.x + p.y * v.y + p.z * v.z) * (1 - c);
    return { x: v.x * c + cx * s + p.x * d, y: v.y * c + cy * s + p.y * d, z: v.z * c + cz * s + p.z * d };
  };
  return { forward: rot(axes.forward), right: rot(axes.right), up: rot(axes.up) };
}

/**
 * Degrees the sky turns between two instants: the sidereal rate times the time
 * between them. Longitude cancels, because it shifts both ends equally.
 */
export function siderealDelta(from: Date, to: Date): number {
  return (360.98564736629 * (to.getTime() - from.getTime())) / 86_400_000;
}

export interface NightWindow {
  /** Where the scrubber starts and ends. */
  start: Date;
  end: Date;
  sunset: Date | null;
  sunrise: Date | null;
}

/**
 * Sunset to sunrise around `anchor`, with three quarters of an hour of twilight
 * either side so the sky can be watched going dark and coming light.
 *
 * `anchor` is the instant the view opened on: local midnight for a record, now
 * for tonight. If it falls in daylight, the window is the night ahead.
 */
export function nightWindow(
  anchor: Date,
  location: Pick<MilestoneLocation, "latitude" | "longitude">
): NightWindow {
  const observer = new Astronomy.Observer(location.latitude, location.longitude, 0);
  const sunAlt = sunAltitude(anchor, location);
  // At night the sunset that began it is behind the anchor; by day, ahead.
  const setFrom = sunAlt < 0 ? new Date(anchor.getTime() - 20 * HOUR_MS) : anchor;
  const sunset = Astronomy.SearchRiseSet(Astronomy.Body.Sun, observer, -1, setFrom, 1)?.date ?? null;
  const sunrise = sunset
    ? Astronomy.SearchRiseSet(Astronomy.Body.Sun, observer, +1, sunset, 1)?.date ?? null
    : null;
  if (!sunset || !sunrise) {
    // Polar summer or winter: no sunset to anchor on, so the view runs a day.
    return {
      start: new Date(anchor.getTime() - 12 * HOUR_MS),
      end: new Date(anchor.getTime() + 12 * HOUR_MS),
      sunset,
      sunrise,
    };
  }
  const margin = 0.75 * HOUR_MS;
  return {
    start: new Date(Math.min(sunset.getTime() - margin, anchor.getTime())),
    end: new Date(Math.max(sunrise.getTime() + margin, anchor.getTime())),
    sunset,
    sunrise,
  };
}

export function sunAltitude(
  date: Date,
  location: Pick<MilestoneLocation, "latitude" | "longitude">
): number {
  const observer = new Astronomy.Observer(location.latitude, location.longitude, 0);
  const eq = Astronomy.Equator(Astronomy.Body.Sun, date, observer, true, true);
  return Astronomy.Horizon(date, observer, eq.ra, eq.dec, "normal").altitude;
}

/** Horizon-frame unit vector (east, north, up) from altitude and azimuth. */
export function horizonVector(altitudeDeg: number, azimuthDeg: number): [number, number, number] {
  const alt = altitudeDeg * DEG;
  const az = azimuthDeg * DEG;
  return [Math.cos(alt) * Math.sin(az), Math.cos(alt) * Math.cos(az), Math.sin(alt)];
}

const EARTH_RADIUS_AU = 6378.137 / 149_597_870.7;
const SUN_RADIUS_AU = 696_000 / 149_597_870.7;
const MOON_RADIUS_AU = 1737.4 / 149_597_870.7;
/** Earth's atmosphere widens its shadow by about 2%, which every eclipse table allows for. */
const ATMOSPHERE = 1.02;

export interface EclipseShadow {
  /** Where the moon is, horizon frame, as seen from the place. */
  moon: [number, number, number];
  /** Where the centre of the Earth's shadow is, at the moon's distance, same frame. */
  shadow: [number, number, number];
  moonRadiusDeg: number;
  umbraRadiusDeg: number;
  penumbraRadiusDeg: number;
  /** Centre-to-centre distance on the sky, degrees. */
  separationDeg: number;
  phase: "penumbral" | "partial" | "total";
}

/**
 * The Earth's shadow on the moon at one instant, or null when the moon is
 * clear of even the penumbra.
 *
 * Without this, scrubbing through an eclipse night would draw a bright full
 * moon at the moment the real one was copper and dim, which is exactly the
 * kind of claim rule 1 forbids. The shadow is placed physically: a point on the
 * anti-solar line at the moon's own distance, seen from the observer, so the
 * observer's parallax moves the moon and its shadow together, as it does.
 *
 * Positions go through the same J2000-as-of-date equatorialToHorizontal the
 * stars use, so the moon, its shadow and the background share one frame.
 */
export function eclipseShadow(
  date: Date,
  location: Pick<MilestoneLocation, "latitude" | "longitude">
): EclipseShadow | null {
  const moonGeo = Astronomy.GeoMoon(date);
  const sunGeo = Astronomy.GeoVector(Astronomy.Body.Sun, date, true);
  const moonDist = Math.hypot(moonGeo.x, moonGeo.y, moonGeo.z);
  const sunDist = Math.hypot(sunGeo.x, sunGeo.y, sunGeo.z);

  // Shadow centre: opposite the sun, at the moon's distance.
  const k = moonDist / sunDist;
  const shadowGeo = { x: -sunGeo.x * k, y: -sunGeo.y * k, z: -sunGeo.z * k };

  // Umbral and penumbral radii at the moon's distance, in AU, then as angles.
  const umbra = ATMOSPHERE * (EARTH_RADIUS_AU - (moonDist * (SUN_RADIUS_AU - EARTH_RADIUS_AU)) / sunDist);
  const penumbra = ATMOSPHERE * (EARTH_RADIUS_AU + (moonDist * (SUN_RADIUS_AU + EARTH_RADIUS_AU)) / sunDist);

  const observer = new Astronomy.Observer(location.latitude, location.longitude, 0);
  const obs = Astronomy.ObserverVector(date, observer, false);
  const topo = (v: { x: number; y: number; z: number }) => {
    const t = new Astronomy.Vector(v.x - obs.x, v.y - obs.y, v.z - obs.z, obs.t);
    const eq = Astronomy.EquatorFromVector(t);
    const h = equatorialToHorizontal(eq.ra * 15, eq.dec, location.latitude, location.longitude, date);
    return { vec: horizonVector(h.altitudeDeg, h.azimuthDeg), dist: eq.dist };
  };
  const m = topo(moonGeo);
  const s = topo(shadowGeo);

  const dot = m.vec[0] * s.vec[0] + m.vec[1] * s.vec[1] + m.vec[2] * s.vec[2];
  const separationDeg = Math.acos(Math.max(-1, Math.min(1, dot))) / DEG;
  const moonRadiusDeg = Math.atan(MOON_RADIUS_AU / m.dist) / DEG;
  const umbraRadiusDeg = Math.atan(umbra / s.dist) / DEG;
  const penumbraRadiusDeg = Math.atan(penumbra / s.dist) / DEG;

  if (separationDeg > penumbraRadiusDeg + moonRadiusDeg) return null;
  const phase =
    separationDeg + moonRadiusDeg <= umbraRadiusDeg
      ? "total"
      : separationDeg < umbraRadiusDeg + moonRadiusDeg
        ? "partial"
        : "penumbral";

  return {
    moon: m.vec,
    shadow: s.vec,
    moonRadiusDeg,
    umbraRadiusDeg,
    penumbraRadiusDeg,
    separationDeg,
    phase,
  };
}

/**
 * Where an instant sits in the night, in words, for a record whose clock time
 * cannot be printed (its offset is estimated). Said against local midnight,
 * sunset or sunrise, whichever is nearest.
 */
export function describeNightMoment(
  t: Date,
  midnight: Date,
  sunset: Date | null,
  sunrise: Date | null,
  formatDuration: (ms: number) => string
): string {
  const ms = t.getTime();
  const refs: { at: number; name: string }[] = [{ at: midnight.getTime(), name: "midnight" }];
  if (sunset) refs.push({ at: sunset.getTime(), name: "sunset" });
  if (sunrise) refs.push({ at: sunrise.getTime(), name: "sunrise" });
  refs.sort((a, b) => Math.abs(ms - a.at) - Math.abs(ms - b.at));
  const near = refs[0];
  const d = ms - near.at;
  if (Math.abs(d) < 5 * 60_000) return near.name === "midnight" ? "Midnight" : `At ${near.name}`;
  return `${formatDuration(Math.abs(d))} ${d < 0 ? "before" : "after"} ${near.name}`;
}
