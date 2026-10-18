import type { Star, SkyPoint } from "@/types";

/**
 * EQUATORIAL -> HORIZONTAL coordinates. Spec §6.6.
 *
 * Converts catalog RA/Dec into what an observer at a place and time actually
 * sees: altitude above the horizon and azimuth around it. Standard spherical
 * trigonometry, no ephemeris needed.
 *
 * CONVENTIONS, fixed here and relied on everywhere else:
 *   - angles in DEGREES in and out (matching SunCalc v2 — see spec §5.1)
 *   - longitude EAST positive
 *   - azimuth NORTH-based, clockwise: 0 = N, 90 = E, 180 = S, 270 = W
 *   - altitude is GEOMETRIC — no atmospheric refraction
 *
 * PRECESSION IS DELIBERATELY IGNORED. The catalog is J2000 and we treat those
 * coordinates as of-date. Precession runs ~50 arcsec/year, so even a 30-year
 * lookback accumulates ~25 arcminutes — under one pixel at phone scale. Adding
 * it would cost accuracy nowhere and complexity everywhere. Do not "fix" this.
 *
 * Refraction is likewise omitted: it matters only within a few degrees of the
 * horizon, where the render is cropped by the ground anyway.
 *
 * This module is cross-validated in the test suite against astronomy-engine, an
 * independent implementation, to better than 0.02° over many epochs and sites.
 */

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/** Julian Date from a JS instant. */
export function toJulianDate(date: Date): number {
  return date.getTime() / 86_400_000 + 2440587.5;
}

/**
 * Greenwich Mean Sidereal Time, in degrees [0, 360).
 * IAU 1982 polynomial — sub-arcsecond across the range this app covers.
 */
export function greenwichMeanSiderealTime(date: Date): number {
  const jd = toJulianDate(date);
  const d = jd - 2451545.0;
  const t = d / 36525;
  const gmst =
    280.46061837 +
    360.98564736629 * d +
    0.000387933 * t * t -
    (t * t * t) / 38710000;
  return ((gmst % 360) + 360) % 360;
}

/** Local Mean Sidereal Time in degrees, longitude east-positive. */
export function localSiderealTime(date: Date, longitude: number): number {
  return (((greenwichMeanSiderealTime(date) + longitude) % 360) + 360) % 360;
}

export interface Horizontal {
  altitudeDeg: number;
  azimuthDeg: number;
}

/**
 * @param raDeg  right ascension, DEGREES (catalog stores degrees, not hours)
 * @param decDeg declination, degrees
 */
export function equatorialToHorizontal(
  raDeg: number,
  decDeg: number,
  latitude: number,
  longitude: number,
  date: Date
): Horizontal {
  const lst = localSiderealTime(date, longitude);
  const H = (lst - raDeg) * DEG; // local hour angle
  const dec = decDeg * DEG;
  const lat = latitude * DEG;

  const sinAlt =
    Math.sin(dec) * Math.sin(lat) +
    Math.cos(dec) * Math.cos(lat) * Math.cos(H);
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinAlt)));

  // atan2 form: no domain clamping, correct quadrant everywhere including the poles.
  const y = -Math.sin(H) * Math.cos(dec);
  const x =
    Math.sin(dec) * Math.cos(lat) - Math.cos(dec) * Math.cos(H) * Math.sin(lat);
  const azimuth = Math.atan2(y, x) * RAD;

  return {
    altitudeDeg: altitude * RAD,
    azimuthDeg: ((azimuth % 360) + 360) % 360,
  };
}

/** Projects a catalog star, returning null when it is below the horizon. */
export function projectStar(
  star: Star,
  latitude: number,
  longitude: number,
  date: Date
): (Horizontal & { star: Star }) | null {
  const h = equatorialToHorizontal(star.ra, star.dec, latitude, longitude, date);
  if (h.altitudeDeg <= 0) return null;
  return { ...h, star };
}

/**
 * Visible stars for a place and time, brightest first.
 *
 * Culling below the horizon BEFORE any projection work is what keeps the
 * immersive mode at frame rate — roughly half the catalog is under the ground
 * at any instant.
 */
export function visibleStars(
  catalog: Star[],
  latitude: number,
  longitude: number,
  date: Date,
  magnitudeLimit = 5.5
): SkyPoint[] {
  const out: SkyPoint[] = [];
  for (const star of catalog) {
    if (star.mag > magnitudeLimit) continue;
    const h = equatorialToHorizontal(
      star.ra,
      star.dec,
      latitude,
      longitude,
      date
    );
    if (h.altitudeDeg <= 0) continue;
    out.push({
      id: `hr${star.hr}`,
      label: star.name ?? `HR ${star.hr}`,
      altitudeDeg: h.altitudeDeg,
      azimuthDeg: h.azimuthDeg,
      magnitude: star.mag,
    });
  }
  return out.sort((a, b) => a.magnitude - b.magnitude);
}

/**
 * The visible hemisphere on a disc: the classic planisphere layout, and the
 * right choice for a static "this was the whole sky" figure. Zenith distance
 * maps linearly to radius, which makes it azimuthal equidistant rather than
 * stereographic; constellations near the horizon stretch a little sideways.
 *
 * Zenith sits at the centre, the horizon on the rim. North is up by default;
 * `rotationDeg` turns the chart.
 *
 * EAST IS ON THE LEFT. A sky chart is read looking up, and looking up with north
 * at the top of your view puts east on your left. Every planisphere and printed
 * star chart is drawn that way. This function used to put east on the right,
 * which is a map of the ground: every constellation came out mirrored, Orion
 * facing the wrong way, and its test asserted the mirror. Nothing drew with it
 * until the record's star map, which is why it never showed.
 *
 * Returns unit coordinates in [-1, 1]; the caller scales to its canvas.
 */
export function projectToDisc(
  body: Pick<SkyPoint, "altitudeDeg" | "azimuthDeg">,
  rotationDeg = 0
): { x: number; y: number } {
  // Zenith distance 0 at centre, 1 at the horizon.
  const r = (90 - body.altitudeDeg) / 90;
  const theta = (body.azimuthDeg + rotationDeg) * DEG;
  return {
    // Negated so east (azimuth 90) lands on the left, as seen looking up.
    x: -r * Math.sin(theta),
    // Negated so north (azimuth 0) points up the screen rather than down.
    y: -r * Math.cos(theta),
  };
}

/**
 * GNOMONIC (tangent-plane) PROJECTION — the first-person camera for immersive mode.
 *
 * The disc projection above is a whole-hemisphere chart: right for a static
 * figure, wrong for looking around, because it has no notion of a view
 * direction or a field of view. This is the standard planetarium camera —
 * straight lines stay straight and the geometry matches what a pointed phone
 * should show.
 *
 * Frame: x = east, y = north, z = up. Screen y grows downward.
 *
 * Returns null when the target is behind the camera or outside the frustum, so
 * callers can skip it entirely rather than drawing off-screen.
 */

export interface ViewDirection {
  /** Where the camera looks, north-based clockwise degrees. */
  azimuthDeg: number;
  /** Camera elevation, degrees. Positive is up. */
  altitudeDeg: number;
  /** Horizontal field of view, degrees. */
  fovDeg: number;
}

/** Unit vector in the horizon frame (east, north, up). */
function toVector(altitudeDeg: number, azimuthDeg: number): [number, number, number] {
  const alt = altitudeDeg * DEG;
  const az = azimuthDeg * DEG;
  const cosAlt = Math.cos(alt);
  return [cosAlt * Math.sin(az), cosAlt * Math.cos(az), Math.sin(alt)];
}

export function projectToView(
  body: Pick<SkyPoint, "altitudeDeg" | "azimuthDeg">,
  view: ViewDirection,
  width: number,
  height: number
): { x: number; y: number } | null {
  const s = toVector(body.altitudeDeg, body.azimuthDeg);
  const f = toVector(view.altitudeDeg, view.azimuthDeg);

  // Camera right stays horizontal, so the horizon never tilts. Derived from the
  // look azimuth alone: facing north (az 0) the right hand points east.
  const azR = view.azimuthDeg * DEG;
  const r: [number, number, number] = [Math.cos(azR), -Math.sin(azR), 0];
  // Up completes the right-handed set: u = r x f.
  const u: [number, number, number] = [
    r[1] * f[2] - r[2] * f[1],
    r[2] * f[0] - r[0] * f[2],
    r[0] * f[1] - r[1] * f[0],
  ];

  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  const z = dot(s, f);
  if (z <= 0.03) return null; // behind the camera, or so oblique it smears

  const focal = width / 2 / Math.tan((view.fovDeg * DEG) / 2);
  const x = width / 2 + (focal * dot(s, r)) / z;
  const y = height / 2 - (focal * dot(s, u)) / z;

  // Cull generously outside the frame — a small margin keeps stars from
  // popping at the edges as the view swings.
  const margin = width * 0.15;
  if (x < -margin || x > width + margin || y < -margin || y > height + margin) {
    return null;
  }
  return { x, y };
}

/** Normalises any azimuth into [0, 360). */
export function normalizeAzimuth(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Clamps a camera elevation to just short of the poles, where azimuth degenerates. */
export function clampAltitude(deg: number): number {
  return Math.max(-88, Math.min(88, deg));
}
