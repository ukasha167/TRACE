import type { Star, MilestoneLocation } from "@/types";
import { equatorialToHorizontal } from "./skyTransform";
import { getSolarSystemSky } from "./skyBodies";
import type { WorldCameraAxes } from "./attitude";
import constellationData from "@/data/constellations.json";
import messierData from "@/data/messier.json";
import { CONSTELLATION_NAMES } from "@/data/constellationNames";
import constellationArt from "@/data/constellationArt.json";

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

/**
 * A drawn figure pinned to the sky, for the 15 constellations that have one.
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
  /** Present only for the fifteen constellations that ship artwork. */
  art?: ConstellationArt;
}

export interface SkySphere {
  count: number;
  /** 3 floats per body: east, north, up (unit vectors in the horizon frame). */
  vec: Float32Array;
  mag: Float32Array;
  /** Parallel index into the source catalog, for labels. */
  hr: Int32Array;
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

/**
 * Kinds worth drawing at all: things that are a cloud or another galaxy.
 *
 * Star clusters are deliberately out. An open cluster drawn as a glyph sits on
 * top of stars that are already in the catalogue and rendering correctly, so it
 * adds a symbol over a thing the view is already showing. The Pleiades do not
 * disappear when M45 is dropped; they go back to being seven stars, which is
 * what they are.
 */
const DEEP_SKY_KINDS = new Set([
  "galaxy",
  "nebula",
  "planetary nebula",
  "supernova remnant",
]);

/**
 * THE CLUTTER RULE: an object earns a glyph by having a name people use.
 *
 * All 110 Messier objects used to draw, which put a symbol every few degrees
 * across the whole sphere and turned the view into a chart. Most of them are
 * anonymous: half the catalogue's galaxies are labelled "M58", "M59", "M60",
 * which tells a reader nothing and costs them the sky behind it.
 *
 * Keeping only the ones with a proper common name is a data-driven rule rather
 * than a hand-typed list, so it survives a catalogue rebuild. It leaves 24
 * objects: Orion, Andromeda, the Lagoon, the Whirlpool, the Ring, the Crab and
 * the rest of the ones a person could plausibly want to find.
 */
function isFamousDeepSky(o: MessierSource): boolean {
  return DEEP_SKY_KINDS.has(o.kind) && o.name !== o.id;
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
  const figures: ConstellationFigure[] = [];
  for (const con of constellationData as ConstellationSource[]) {
    const lines: Float32Array[] = [];
    let cx = 0, cy = 0, cz = 0, n = 0;

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
        const [e, nn, u] = unitVector(h.altitudeDeg, h.azimuthDeg);
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
          anchors: artSource.anchors.map((a) => {
            const h = equatorialToHorizontal(
              a.ra,
              a.dec,
              location.latitude,
              location.longitude,
              date
            );
            return { u: a.u, v: a.v, vec: unitVector(h.altitudeDeg, h.azimuthDeg) };
          }),
        }
      : undefined;

    figures.push({
      id: con.id,
      name: CONSTELLATION_NAMES[con.id] ?? con.id,
      lines,
      centroid: [cx / len, cy / len, cz / len],
      art,
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

  const deepSky: SkySphere["deepSky"] = [];
  for (const o of messierData as MessierSource[]) {
    if (!isFamousDeepSky(o)) continue;
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
