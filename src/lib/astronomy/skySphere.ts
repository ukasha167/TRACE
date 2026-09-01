import type { Star, MilestoneLocation } from "@/types";
import { equatorialToHorizontal } from "./skyTransform";
import { getSolarSystemSky } from "./skyBodies";
import type { WorldCameraAxes } from "./attitude";
import constellationData from "@/data/constellations.json";
import messierData from "@/data/messier.json";

interface ConstellationSource { id: string; lines: number[][] }
interface MessierSource {
  id: string; name: string; ra: number; dec: number; mag: number; kind: string;
}

/**
 * THE PRECOMPUTED CELESTIAL SPHERE — the performance spine of immersive mode.
 *
 * For a FIXED date and place every star's horizontal position is constant; only
 * the camera moves. So the expensive part (sidereal time, spherical trig, one
 * trig-heavy transform per star) is done ONCE here, and each frame reduces to
 * three dot products per star against the camera basis.
 *
 * Positions live in flat Float32Arrays rather than objects. At a few thousand
 * stars redrawn 60 times a second, per-frame allocation is the difference
 * between smooth and stuttering, and the hot loop below allocates nothing.
 *
 * Nothing is culled by altitude: the full sphere is retained so the view can
 * pass through the horizon and keep going, which is what makes it feel like
 * standing somewhere rather than looking at a picture.
 */

export interface SkySphere {
  count: number;
  /** 3 floats per body: east, north, up (unit vectors in the horizon frame). */
  vec: Float32Array;
  mag: Float32Array;
  /** Parallel index into the source catalog, for labels. */
  hr: Int32Array;
  /**
   * Constellation figures, pre-projected to unit vectors. Each entry is one
   * polyline: [e,n,u, e,n,u, ...]. Precomputed for the same reason the stars
   * are — the geometry never changes for a fixed date and place.
   */
  figures: Float32Array[];
  /** Stars worth labelling: IAU proper names, brightest first. */
  labels: { vec: [number, number, number]; name: string; mag: number }[];
  /** Messier objects — galaxies, nebulae, clusters. */
  deepSky: {
    id: string; name: string; vec: [number, number, number];
    mag: number; kind: string;
  }[];
  /** Solar-system bodies, kept separate so they can be drawn differently. */
  bodies: {
    id: string;
    label: string;
    vec: [number, number, number];
    magnitude: number;
    kind: "planet" | "moon" | "sun" | "deepsky";
    /** Galaxy / nebula / cluster, for the deep-sky objects. */
    detail?: string;
  }[];
}

const DEG = Math.PI / 180;

function unitVector(altitudeDeg: number, azimuthDeg: number): [number, number, number] {
  const alt = altitudeDeg * DEG;
  const az = azimuthDeg * DEG;
  const c = Math.cos(alt);
  return [c * Math.sin(az), c * Math.cos(az), Math.sin(alt)];
}

export function buildSkySphere(
  catalog: Star[],
  location: Pick<MilestoneLocation, "latitude" | "longitude">,
  date: Date,
  magnitudeLimit = 6.5
): SkySphere {
  const kept: Star[] = [];
  for (const s of catalog) if (s.mag <= magnitudeLimit) kept.push(s);

  const vec = new Float32Array(kept.length * 3);
  const mag = new Float32Array(kept.length);
  const hr = new Int32Array(kept.length);

  for (let i = 0; i < kept.length; i++) {
    const s = kept[i];
    const h = equatorialToHorizontal(
      s.ra,
      s.dec,
      location.latitude,
      location.longitude,
      date
    );
    const [e, n, u] = unitVector(h.altitudeDeg, h.azimuthDeg);
    vec[i * 3] = e;
    vec[i * 3 + 1] = n;
    vec[i * 3 + 2] = u;
    mag[i] = s.mag;
    hr[i] = s.hr;
  }

  // ---- Constellation figures ----
  const figures: Float32Array[] = [];
  for (const con of constellationData as ConstellationSource[]) {
    for (const line of con.lines) {
      const pts = new Float32Array((line.length / 2) * 3);
      for (let i = 0, o = 0; i < line.length; i += 2, o += 3) {
        const h = equatorialToHorizontal(
          line[i],
          line[i + 1],
          location.latitude,
          location.longitude,
          date
        );
        const [e, n, u] = unitVector(h.altitudeDeg, h.azimuthDeg);
        pts[o] = e; pts[o + 1] = n; pts[o + 2] = u;
      }
      figures.push(pts);
    }
  }

  // ---- Labelled stars ----
  const labels: SkySphere["labels"] = [];
  for (let i = 0; i < kept.length; i++) {
    const proper = kept[i].proper;
    if (!proper) continue;
    labels.push({
      vec: [vec[i * 3], vec[i * 3 + 1], vec[i * 3 + 2]],
      name: proper,
      mag: mag[i],
    });
  }
  labels.sort((a, b) => a.mag - b.mag);

  const solar = getSolarSystemSky(date, location);
  const bodies: SkySphere["bodies"] = [];
  for (const p of solar.planets) {
    bodies.push({
      id: p.id,
      label: p.label,
      vec: unitVector(p.altitudeDeg, p.azimuthDeg),
      magnitude: p.magnitude,
      kind: "planet",
    });
  }
  if (solar.moon) {
    bodies.push({
      id: "moon",
      label: "Moon",
      vec: unitVector(solar.moon.altitudeDeg, solar.moon.azimuthDeg),
      magnitude: solar.moon.magnitude,
      kind: "moon",
    });
  }
  if (solar.sun) {
    bodies.push({
      id: "sun",
      label: "Sun",
      vec: unitVector(solar.sun.altitudeDeg, solar.sun.azimuthDeg),
      magnitude: solar.sun.magnitude,
      kind: "sun",
    });
  }

  // Messier catalogue: galaxies, nebulae and clusters, fixed to the sphere like
  // the stars, so they are precomputed the same way.
  const deepSky: SkySphere["deepSky"] = [];
  for (const o of messierData as MessierSource[]) {
    const h = equatorialToHorizontal(o.ra, o.dec, location.latitude, location.longitude, date);
    deepSky.push({
      id: o.id,
      name: o.name,
      vec: unitVector(h.altitudeDeg, h.azimuthDeg),
      mag: o.mag,
      kind: o.kind,
    });
  }

  return { count: kept.length, vec, mag, hr, figures, labels, deepSky, bodies };
}

/** Orthonormal camera basis for a look direction. Right is held horizontal. */
export interface CameraBasis {
  fx: number; fy: number; fz: number; // forward
  rx: number; ry: number; rz: number; // right
  ux: number; uy: number; uz: number; // up
  focal: number;
}

/**
 * Camera basis from explicit world axes — the roll-aware path.
 *
 * makeCameraBasis below forces `right` into the horizontal plane, which pins
 * the horizon parallel to the screen's x-axis and makes landscape look wrong.
 * Use this whenever a real device orientation is available.
 */
export function cameraBasisFromAxes(
  axes: WorldCameraAxes,
  fovDeg: number,
  width: number
): CameraBasis {
  return {
    fx: axes.forward.x, fy: axes.forward.y, fz: axes.forward.z,
    rx: axes.right.x, ry: axes.right.y, rz: axes.right.z,
    ux: axes.up.x, uy: axes.up.y, uz: axes.up.z,
    focal: width / 2 / Math.tan((fovDeg * DEG) / 2),
  };
}

export function makeCameraBasis(
  azimuthDeg: number,
  altitudeDeg: number,
  fovDeg: number,
  width: number
): CameraBasis {
  const [fx, fy, fz] = unitVector(altitudeDeg, azimuthDeg);
  const azR = azimuthDeg * DEG;
  // Right stays in the horizontal plane, so the horizon never tilts.
  const rx = Math.cos(azR);
  const ry = -Math.sin(azR);
  const rz = 0;
  // Up completes the right-handed set: u = r x f.
  const ux = ry * fz - rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy - ry * fx;
  return {
    fx, fy, fz, rx, ry, rz, ux, uy, uz,
    focal: width / 2 / Math.tan((fovDeg * DEG) / 2),
  };
}

export interface ProjectedStars {
  /** x, y, radius triples, packed. Only `visible` entries are valid. */
  out: Float32Array;
  visible: number;
}

/**
 * Projects the sphere through the camera into packed screen triples.
 *
 * Allocation-free: the caller owns `out` and reuses it across frames.
 * Returns how many entries were filled.
 */
export function projectSphere(
  sphere: SkySphere,
  cam: CameraBasis,
  width: number,
  height: number,
  out: Float32Array,
  magnitudeLimit: number
): number {
  const halfW = width / 2;
  const halfH = height / 2;
  const marginX = width * 0.12;
  const marginY = height * 0.12;
  const { vec, mag, count } = sphere;
  let n = 0;

  for (let i = 0; i < count; i++) {
    const m = mag[i];
    if (m > magnitudeLimit) continue;

    const i3 = i * 3;
    const e = vec[i3];
    const nn = vec[i3 + 1];
    const u = vec[i3 + 2];

    const z = e * cam.fx + nn * cam.fy + u * cam.fz;
    if (z <= 0.04) continue; // behind the camera

    const inv = cam.focal / z;
    const x = halfW + (e * cam.rx + nn * cam.ry + u * cam.rz) * inv;
    if (x < -marginX || x > width + marginX) continue;
    const y = halfH - (e * cam.ux + nn * cam.uy + u * cam.uz) * inv;
    if (y < -marginY || y > height + marginY) continue;

    // Apparent size from magnitude. Squared falloff keeps bright stars
    // dominant instead of the field turning into uniform mush.
    const t = Math.max(0, (magnitudeLimit - m) / (magnitudeLimit + 1.5));
    const o = n * 3;
    out[o] = x;
    out[o + 1] = y;
    out[o + 2] = 0.45 + t * t * 4.0;
    n++;
    if (o + 3 >= out.length) break;
  }
  return n;
}

/** Projects one unit vector. Used for the handful of solar-system bodies. */
export function projectVector(
  v: [number, number, number],
  cam: CameraBasis,
  width: number,
  height: number
): { x: number; y: number } | null {
  const [e, n, u] = v;
  const z = e * cam.fx + n * cam.fy + u * cam.fz;
  if (z <= 0.04) return null;
  const inv = cam.focal / z;
  return {
    x: width / 2 + (e * cam.rx + n * cam.ry + u * cam.rz) * inv,
    y: height / 2 - (e * cam.ux + n * cam.uy + u * cam.uz) * inv,
  };
}
