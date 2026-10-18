import { Skia, ClipOp, FillType, TileMode, type SkCanvas, type SkPaint } from "@shopify/react-native-skia";

/**
 * SUN AND PLANETS AT THEIR TRUE SIZE.
 *
 * A body is drawn at the angle it really subtends (skyBodies.angularRadiusDeg)
 * through the view's own focal length, so its size answers to the zoom the way
 * a telescope's image does: Jupiter is a point of light at the eye's field of
 * view and a flattened, slightly phased disc at half a degree. While the true
 * disc is smaller than the point a body of its brightness makes on the eye,
 * the point is drawn, as it is for a star; the two cross-fade as the zoom
 * resolves it.
 *
 * Everything that shapes a resolved disc is measured: the phase angle and
 * where the sun lies on screen set the terminator; the IAU pole sets the axis
 * the disc is flattened along and the plane Saturn's rings lie in. The colours
 * are the planets' own (SkyColors.planetDisc) and carry no surface detail,
 * because no surface detail is known for the night being drawn.
 */

export type Rgb = readonly [number, number, number];

/** A 3-vector against the camera's right and up: the direction it points on screen, y down. */
export function screenDirection(
  v: readonly [number, number, number],
  cam: { rx: number; ry: number; rz: number; ux: number; uy: number; uz: number }
): { x: number; y: number } {
  return {
    x: v[0] * cam.rx + v[1] * cam.ry + v[2] * cam.rz,
    y: -(v[0] * cam.ux + v[1] * cam.uy + v[2] * cam.uz),
  };
}

export interface DiscGeometry {
  x: number;
  y: number;
  /** Equatorial radius, canvas units. */
  r: number;
  /** Screen direction of the north pole (unnormalised is fine), or null. */
  pole: { x: number; y: number } | null;
  /** How far the pole lies across the line of sight: 1 side-on, 0 end-on. */
  poleAcross: number;
  flattening: number;
  /** Screen direction toward the sun. */
  sun: { x: number; y: number };
  phaseAngleDeg: number;
}

const STEPS = 28;

/** The lit part of a disc: the sunward limb, closed by the terminator ellipse. */
export function litOutline(g: DiscGeometry) {
  const sl = Math.hypot(g.sun.x, g.sun.y) || 1;
  const sx = g.sun.x / sl, sy = g.sun.y / sl;
  const cosI = Math.cos((g.phaseAngleDeg * Math.PI) / 180);
  // Squash along the pole by the flattening, foreshortened as the pole tips toward us.
  const squash = 1 - g.flattening * g.poleAcross * g.poleAcross;
  const pl = g.pole ? Math.hypot(g.pole.x, g.pole.y) : 0;
  const nx = pl ? g.pole!.x / pl : 0, ny = pl ? g.pole!.y / pl : 0;
  const place = (a: number, b: number) => {
    // (a, b) in the sun frame: a toward the sun, b across it.
    let px = a * sx - b * sy;
    let py = a * sy + b * sx;
    const along = px * nx + py * ny;
    px -= (1 - squash) * along * nx;
    py -= (1 - squash) * along * ny;
    return [g.x + px * g.r, g.y + py * g.r] as const;
  };
  const path = Skia.PathBuilder.Make();
  for (let k = 0; k <= STEPS; k++) {
    const t = -Math.PI / 2 + (Math.PI * k) / STEPS;
    const [x, y] = place(Math.cos(t), Math.sin(t));
    if (k === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  for (let k = STEPS; k >= 0; k--) {
    const t = -Math.PI / 2 + (Math.PI * k) / STEPS;
    const [x, y] = place(-cosI * Math.cos(t), Math.sin(t));
    path.lineTo(x, y);
  }
  path.close();
  return path.detach();
}

const color = (c: Rgb, k: number, a = 1) => Skia.Color([c[0] * k, c[1] * k, c[2] * k, a]);

/**
 * A resolved disc, limb-darkened. `limb` is how dark the edge runs against the
 * centre: Jupiter and Saturn about 0.6 in visible light, the sun about 0.4.
 */
export function drawDisc(cv: SkCanvas, g: DiscGeometry, rgb: Rgb, alpha: number, paint: SkPaint, limb = 0.65) {
  paint.setShader(
    Skia.Shader.MakeRadialGradient(
      { x: g.x, y: g.y },
      g.r,
      [color(rgb, 1, alpha), color(rgb, 0.5 + 0.5 * limb + 0.25 * (1 - limb), alpha), color(rgb, limb, alpha)],
      [0, 0.7, 1],
      TileMode.Clamp
    )
  );
  cv.drawPath(litOutline(g), paint);
  paint.setShader(null);
}

/** Saturn's A ring outer edge and B ring inner edge, in equatorial radii. */
const RING_OUTER = 136_775 / 60_268;
const RING_INNER = 92_000 / 60_268;

/**
 * Saturn's rings, in two halves around the globe: the half beyond it first,
 * the globe, then the near half over it.
 *
 * `towardFront` is the screen direction of the near half. A ring point p lies
 * in front of the planet when p . (toward the observer) > 0; projecting that
 * onto the screen gives (d . n) times the pole's screen direction, where d runs
 * from the observer to Saturn and n is its pole.
 */
export function drawRinged(
  cv: SkCanvas,
  g: DiscGeometry,
  rgb: Rgb,
  ringRgb: Rgb,
  alpha: number,
  paint: SkPaint,
  towardFront: { x: number; y: number }
) {
  if (!g.pole) {
    drawDisc(cv, g, rgb, alpha, paint);
    return;
  }
  const pl = Math.hypot(g.pole.x, g.pole.y) || 1;
  const nx = g.pole.x / pl, ny = g.pole.y / pl;
  // The ring's minor axis lies along the pole on screen, shortened by how far
  // the ring plane tips toward us: |sin B| = sqrt(1 - poleAcross^2).
  const open = Math.sqrt(Math.max(0, 1 - g.poleAcross * g.poleAcross));
  const angle = (Math.atan2(ny, nx) * 180) / Math.PI;
  const ring = Skia.PathBuilder.Make();
  const oval = (k: number) => Skia.XYWHRect(-k * g.r * open, -k * g.r, 2 * k * g.r * open, 2 * k * g.r);
  ring.addOval(oval(RING_OUTER));
  ring.addOval(oval(RING_INNER));
  ring.setFillType(FillType.EvenOdd); // even-odd: the gap between the rings and the globe is empty
  const ringPath = ring.detach();
  const fl = Math.hypot(towardFront.x, towardFront.y) || 1;
  const fx = towardFront.x / fl, fy = towardFront.y / fl;
  const half = (front: boolean) => {
    cv.save();
    cv.translate(g.x, g.y);
    // Clip to the half-plane on the near or far side of the line across the pole.
    const s = front ? 1 : -1;
    const big = RING_OUTER * g.r * 2;
    const clip = Skia.PathBuilder.Make();
    clip.moveTo(-ny * big, nx * big);
    clip.lineTo(-ny * big + s * fx * big, nx * big + s * fy * big);
    clip.lineTo(ny * big + s * fx * big, -nx * big + s * fy * big);
    clip.lineTo(ny * big, -nx * big);
    clip.close();
    cv.clipPath(clip.detach(), ClipOp.Intersect, true);
    cv.rotate(angle, 0, 0);
    paint.setColor(color(ringRgb, 0.85, alpha * 0.9));
    cv.drawPath(ringPath, paint);
    cv.restore();
  };
  half(false);
  drawDisc(cv, g, rgb, alpha, paint);
  half(true);
}

/**
 * How much of a body is drawn as a resolved disc rather than a point, 0 to 1,
 * from its true radius and the radius of the point its brightness makes.
 */
export function resolved(trueRadius: number, pointRadius: number): number {
  const t = Math.max(0, Math.min(1, (trueRadius - 0.6 * pointRadius) / (0.8 * pointRadius)));
  return t * t * (3 - 2 * t);
}
