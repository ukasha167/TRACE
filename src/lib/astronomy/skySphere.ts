import type { Star, MilestoneLocation } from "@/types";
import { equatorialToHorizontal } from "./skyTransform";
import { starTint, airmassFromSine } from "./skyLight";
import type { WorldCameraAxes } from "./attitude";
import constellationData from "@/data/constellations.json";
import { CONSTELLATION_NAMES } from "@/data/constellationNames";
import constellationArt from "@/data/constellationArt.json";
import constellationStars from "@/data/constellationStars.json";

interface ConstellationSource { id: string; lines: number[][] }
/** ra, dec, magnitude, chart label. See scripts/build-constellation-stars.mjs. */
type FigureStarSource = [number, number, number, string];
const FIGURE_STARS = constellationStars as unknown as Record<string, FigureStarSource[]>;

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

/**
 * A drawn figure pinned to the sky. Every constellation the view draws has one.
 *
 * Stellarium's anchor scheme: three points in the illustration are tied to three
 * real stars, and an affine map from those three pairs places the whole image.
 * That is only an approximation of the spherical projection, and it is the same
 * approximation Stellarium makes. It holds because a constellation spans tens of
 * degrees, not a hemisphere.
 *
 * The build script resolves the anchor stars to RA/Dec (see
 * scripts/build-constellation-art.mjs), so nothing at runtime knows what a HIP
 * number is; an anchor is precomputed to a unit vector exactly like a line
 * vertex.
 */
export interface ConstellationArt {
  /** Column and row of this figure's tile in assets/constellations/figures.png. */
  tile: [number, number];
  /** Three anchors: position in 0..1 image space, and where it sits in the sky. */
  anchors: {
    u: number;
    v: number;
    vec: [number, number, number];
  }[];
}

export interface ConstellationFigure {
  /** IAU abbreviation, e.g. "Ori". */
  id: string;
  /** Full name, e.g. "Orion". Drawn at the centroid when the figure is in focus. */
  name: string;
  /** One polyline per segment: [e,n,u, e,n,u, ...]. */
  lines: Float32Array[];
  /**
   * Unit vector at the mean of the figure's vertices. Where the name is drawn,
   * and what the renderer measures against the view direction to decide how
   * strongly to draw the figure.
   */
  centroid: [number, number, number];
  /** Absent for Puppis, Vela and Serpens, which the pack draws inside other figures. */
  art?: ConstellationArt;
  /**
   * Every star the lines pass through, named the way a chart names it: proper
   * name, else Bayer letter, else Flamsteed number. Brightest first. Shown
   * while the figure is lit.
   */
  stars: { vec: [number, number, number]; label: string; mag: number }[];
}

export interface SkySphere {
  count: number;
  /** 3 floats per body: east, north, up (unit vectors in the horizon frame). */
  vec: Float32Array;
  mag: Float32Array;
  /** Parallel index into the source catalog, for labels. */
  hr: Int32Array;
  /** Colour bin per star from its measured B-V (skyLight.starTint). 0 is white. */
  tint: Uint8Array;
  /**
   * The rotation from this sphere's frame back to J2000 equatorial: three rows,
   * so (row0 . v, row1 . v, row2 . v) is the unit vector at the right
   * ascension and declination v was computed from. The Milky Way shader reads
   * its map through this. Exact, because equatorialToHorizontal is a pure
   * rotation with no refraction.
   */
  toEquatorial: Float32Array;
  /**
   * Constellation figures, grouped by constellation and pre-projected to unit
   * vectors. Precomputed for the same reason the stars are: the geometry never
   * changes for a fixed date and place.
   *
   * These used to be a flat list of polylines with the constellation identity
   * thrown away, which was fine while every line drew at one fixed alpha. The
   * immersive view now fades each constellation independently and names the one
   * you are looking at, and neither is possible without the grouping.
   */
  figures: ConstellationFigure[];
  /** Stars worth labelling: IAU proper names, brightest first. RA/Dec in degrees, J2000. */
  labels: { vec: [number, number, number]; name: string; mag: number; ra: number; dec: number }[];
}

const DEG = Math.PI / 180;

function unitVector(altitudeDeg: number, azimuthDeg: number): [number, number, number] {
  const alt = altitudeDeg * DEG;
  const az = azimuthDeg * DEG;
  const c = Math.cos(alt);
  return [c * Math.sin(az), c * Math.cos(az), Math.sin(alt)];
}

interface ArtSource {
  tile: number;
  cols: number;
  figures: {
    id: string;
    tile: [number, number];
    anchors: { u: number; v: number; ra: number; dec: number }[];
  }[];
}

const ART = constellationArt as ArtSource;
const ART_BY_ID = new Map(ART.figures.map((f) => [f.id, f]));

/** Tile geometry, so the renderer does not hardcode what the build script chose. */
export const CONSTELLATION_ART_TILE = ART.tile;
export const CONSTELLATION_ART_COLS = ART.cols;

export function buildSkySphere(
  catalog: Star[],
  location: Pick<MilestoneLocation, "latitude" | "longitude">,
  date: Date,
  magnitudeLimit = 6.5
): SkySphere {
  // A star with an IAU proper name is kept whatever the magnitude limit says.
  // The limit exists to thin an anonymous background, and a named star is the
  // opposite of that: it is the thing a person came looking for. Exactly one
  // star is affected at the view's 6.2 cut (Meleph, in Cancer, at 6.3), which
  // is a cheap exception for a rule that cannot then surprise anybody.
  const kept: Star[] = [];
  for (const s of catalog) {
    if (s.mag <= magnitudeLimit || s.proper) kept.push(s);
  }

  // R maps an equatorial unit vector into this frame, so its columns are where
  // the three equatorial axes land; the inverse rotation is its transpose,
  // whose rows are those same three vectors.
  const axis = (ra: number, dec: number) => {
    const h = equatorialToHorizontal(ra, dec, location.latitude, location.longitude, date);
    return unitVector(h.altitudeDeg, h.azimuthDeg);
  };
  const R = [...axis(0, 0), ...axis(90, 0), ...axis(0, 90)];
  const toEquatorial = Float32Array.from(R);
  // Every catalogue direction goes through R rather than equatorialToHorizontal,
  // which redoes sidereal time and about 14 trig calls per point. 6,332 stars
  // took 5.7 ms that way and 2.0 ms this way, agreeing to 0.02 arcseconds.
  const horizon = (ra: number, dec: number): [number, number, number] => {
    const cd = Math.cos(dec * DEG);
    const x = cd * Math.cos(ra * DEG);
    const y = cd * Math.sin(ra * DEG);
    const z = Math.sin(dec * DEG);
    return [
      x * R[0] + y * R[3] + z * R[6],
      x * R[1] + y * R[4] + z * R[7],
      x * R[2] + y * R[5] + z * R[8],
    ];
  };

  const vec = new Float32Array(kept.length * 3);
  const mag = new Float32Array(kept.length);
  const hr = new Int32Array(kept.length);
  const tint = new Uint8Array(kept.length);

  for (let i = 0; i < kept.length; i++) {
    const s = kept[i];
    const [e, n, u] = horizon(s.ra, s.dec);
    vec[i * 3] = e;
    vec[i * 3 + 1] = n;
    vec[i * 3 + 2] = u;
    mag[i] = s.mag;
    hr[i] = s.hr;
    tint[i] = starTint(s.bv, s.mag);
  }

  // ---- Constellation figures ----
  const figures: ConstellationFigure[] = [];
  for (const con of constellationData as ConstellationSource[]) {
    const lines: Float32Array[] = [];
    let cx = 0, cy = 0, cz = 0, n = 0;

    for (const line of con.lines) {
      const pts = new Float32Array((line.length / 2) * 3);
      for (let i = 0, o = 0; i < line.length; i += 2, o += 3) {
        const [e, nn, u] = horizon(line[i], line[i + 1]);
        pts[o] = e; pts[o + 1] = nn; pts[o + 2] = u;
        cx += e; cy += nn; cz += u; n++;
      }
      lines.push(pts);
    }
    if (n === 0) continue;

    // Mean of the vertices, renormalised back onto the sphere. Averaging unit
    // vectors is the right way to centre a figure that wraps the azimuth seam;
    // averaging azimuths would put Ursa Minor's name on the wrong side of the
    // sky whenever the figure straddles 0 degrees.
    const len = Math.hypot(cx, cy, cz) || 1;

    const artSource = ART_BY_ID.get(con.id);
    const art: ConstellationArt | undefined = artSource
      ? {
          tile: artSource.tile,
          anchors: artSource.anchors.map((a) => ({ u: a.u, v: a.v, vec: horizon(a.ra, a.dec) })),
        }
      : undefined;

    // Serpens arrives as two entries, head and tail, under one id. Its stars
    // are listed once, against the first half.
    const named = figures.some((f) => f.id === con.id);
    figures.push({
      id: con.id,
      name: CONSTELLATION_NAMES[con.id] ?? con.id,
      lines,
      centroid: [cx / len, cy / len, cz / len],
      art,
      stars: named
        ? []
        : (FIGURE_STARS[con.id] ?? []).map(([ra, dec, m, label]) => ({ vec: horizon(ra, dec), label, mag: m })),
    });
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
      ra: kept[i].ra,
      dec: kept[i].dec,
    });
  }
  labels.sort((a, b) => a.mag - b.mag);

  return { count: kept.length, vec, mag, hr, tint, toEquatorial, figures, labels };
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
  magnitudeLimit: number,
  /**
   * Straight up, in the sphere's own frame. When the time scrubber has turned
   * the sky, "up" in the sphere is no longer (0, 0, 1). A star below it comes
   * back with a NEGATIVE radius, so the caller can draw the ground's stars dim
   * without a second pass.
   */
  zenith?: { x: number; y: number; z: number },
  /** Receives each drawn star's colour bin, parallel to `out`. */
  tintOut?: Uint8Array,
  /**
   * Dim stars by the air they are seen through, magnitudes per airmass. A
   * star two degrees up loses about three magnitudes, which is why the horizon
   * is nearly empty of faint stars on any real night. Needs `zenith`.
   */
  extinction = 0
): number {
  const halfW = width / 2;
  const halfH = height / 2;
  const marginX = width * 0.12;
  const marginY = height * 0.12;
  const { vec, mag, count } = sphere;
  let n = 0;

  for (let i = 0; i < count; i++) {
    let m = mag[i];
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

    // After the screen checks: at the normal lens about 118 stars survive
    // them, and the airmass of the other 6,000 was half this loop's cost.
    const up = zenith ? e * zenith.x + nn * zenith.y + u * zenith.z : 1;
    if (extinction > 0 && up > 0) {
      m += extinction * (airmassFromSine(up) - 1);
      if (m > magnitudeLimit) continue;
    }

    // Apparent size from magnitude. Squared falloff keeps bright stars
    // dominant instead of the field turning into uniform mush.
    const t = Math.max(0, (magnitudeLimit - m) / (magnitudeLimit + 1.5));
    const o = n * 3;
    const r = 0.45 + t * t * 4.0;
    out[o] = x;
    out[o + 1] = y;
    out[o + 2] = up < 0 ? -r : r;
    if (tintOut) tintOut[n] = sphere.tint[i];
    n++;
    if (o + 3 >= out.length) break;
  }
  return n;
}

/**
 * projectVector without the allocation, for the per-frame line work.
 *
 * The grid, the horizon and the constellation figures project about two
 * thousand vertices a frame between them. Returning a fresh `{ x, y }` for each
 * one was the largest source of garbage in the immersive loop, so the hot paths
 * write into a scratch object the caller owns and reuses.
 *
 * @returns false when the point is behind the camera, leaving `out` untouched
 */
export function projectInto(
  e: number,
  n: number,
  u: number,
  cam: CameraBasis,
  width: number,
  height: number,
  out: { x: number; y: number }
): boolean {
  const z = e * cam.fx + n * cam.fy + u * cam.fz;
  if (z <= 0.04) return false;
  const inv = cam.focal / z;
  out.x = width / 2 + (e * cam.rx + n * cam.ry + u * cam.rz) * inv;
  out.y = height / 2 - (e * cam.ux + n * cam.uy + u * cam.uz) * inv;
  return true;
}

/**
 * The direction `k` of the way from vertex `i` of a figure's polyline to vertex
 * `i + 1`, for a line growing out of its star. Stellarium's
 * line_animation_effect (constellations.c) mixes the two directions and
 * normalises the result, so the point stays on the great circle between the
 * stars. A gnomonic view draws that great circle as a straight line, so the
 * growing line runs exactly along the finished one.
 */
export function pointAlong(
  pts: Float32Array,
  i: number,
  k: number,
  out: { x: number; y: number; z: number }
): void {
  const a = i * 3;
  const b = a + 3;
  const x = pts[a] + (pts[b] - pts[a]) * k;
  const y = pts[a + 1] + (pts[b + 1] - pts[a + 1]) * k;
  const z = pts[a + 2] + (pts[b + 2] - pts[a + 2]) * k;
  const n = Math.hypot(x, y, z) || 1;
  out.x = x / n;
  out.y = y / n;
  out.z = z / n;
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

/**
 * The affine map that places a constellation illustration on screen.
 *
 * Three (image point, sky position) pairs determine a unique affine transform,
 * which is what Stellarium's anchor scheme encodes. Project the three sky
 * positions through the camera, then solve
 *
 *   x = a*u + b*v + c
 *   y = d*u + e*v + f
 *
 * for the two 3x3 systems that share a matrix. Returned as Skia's row-major
 * 3x3, ready for `canvas.concat`.
 *
 * WHY IT RETURNS NULL RATHER THAN A MATRIX THAT ALMOST WORKS. Near the camera
 * plane a projected anchor runs off to infinity, and an affine fitted through
 * it smears the illustration across the whole sphere at a size no clip will
 * save you from. Two guards: the anchors must not be collinear in image space
 * (they never are, but a bad rebuild would make them so), and the fitted scale
 * must keep the figure within a few screens. A missing figure is a small loss;
 * one drawn 40 screens wide costs the frame.
 *
 * @param tile the size the anchors' normalised coordinates are scaled into
 */
export function anchorTransform(
  art: ConstellationArt,
  cam: CameraBasis,
  width: number,
  height: number,
  tile: number
): number[] | null {
  const a0 = art.anchors[0], a1 = art.anchors[1], a2 = art.anchors[2];
  const p0 = projectVector(a0.vec, cam, width, height);
  if (!p0) return null;
  const p1 = projectVector(a1.vec, cam, width, height);
  if (!p1) return null;
  const p2 = projectVector(a2.vec, cam, width, height);
  if (!p2) return null;

  const u0 = a0.u * tile, v0 = a0.v * tile;
  const u1 = a1.u * tile, v1 = a1.v * tile;
  const u2 = a2.u * tile, v2 = a2.v * tile;

  const du0 = u0 - u2, du1 = u1 - u2;
  const dv0 = v0 - v2, dv1 = v1 - v2;
  const det = du0 * dv1 - du1 * dv0;
  if (Math.abs(det) < 1e-6) return null;

  const dx0 = p0.x - p2.x, dx1 = p1.x - p2.x;
  const dy0 = p0.y - p2.y, dy1 = p1.y - p2.y;

  const a = (dx0 * dv1 - dx1 * dv0) / det;
  const b = (du0 * dx1 - du1 * dx0) / det;
  const c = p0.x - a * u0 - b * v0;
  const d = (dy0 * dv1 - dy1 * dv0) / det;
  const e = (du0 * dy1 - du1 * dy0) / det;
  const f = p0.y - d * u0 - e * v0;

  if (![a, b, c, d, e, f].every(Number.isFinite)) return null;
  // Drawn extent, in screen widths. Anything past a few screens means an anchor
  // is close to the camera plane and the fit has stopped meaning anything.
  const spread = Math.max(Math.hypot(a, d), Math.hypot(b, e)) * tile;
  if (spread > width * 6) return null;

  return [a, b, c, d, e, f, 0, 0, 1];
}
