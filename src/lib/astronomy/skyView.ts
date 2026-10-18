import type { CameraBasis } from "./skySphere";

/**
 * HOW THE SKY VIEW FRAMES THE SKY: the lens it opens with, the ground, and the
 * air between the moon and the eye.
 */

const DEG = Math.PI / 180;

/**
 * A 50 mm lens on a 36 x 24 mm frame, which photographers call "normal"
 * because a print made with it, held at reading distance, matches what the eye
 * saw: 2 * atan(43.27 / 100) = 46.8 degrees across the diagonal.
 *
 * The view used to open at 65 degrees across the SHORT side of a portrait
 * phone, which is about 108 degrees top to bottom. That is wider than a
 * fisheye-free lens can go without stretching, and it is why Orion looked
 * pulled tall near the top of the screen.
 */
export const EYE_DIAGONAL_FOV_DEG = 2 * Math.atan(43.27 / 100) / DEG;

/**
 * The horizontal field, in degrees, that gives this screen the normal lens's
 * diagonal. The renderer's `fov` is horizontal, so the screen's shape decides
 * it: 20.6 degrees across a 393 x 852 portrait phone, 41 across the same phone
 * turned landscape.
 */
export function eyeFieldOfView(width: number, height: number): number {
  const diagonal = Math.hypot(width, height);
  if (!(diagonal > 0)) return EYE_DIAGONAL_FOV_DEG;
  return (2 * Math.atan(Math.tan((EYE_DIAGONAL_FOV_DEG / 2) * DEG) * (width / diagonal))) / DEG;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * How solid the ground is, from where the view is pointed.
 *
 * Stellarium's behaviour: looking up, the ground is there and hides what is
 * under it; tipping the view down to the horizon dissolves it, so the half of
 * the sky below your feet can still be looked at. Solid from 10 degrees up,
 * gone by 2 degrees down, and smooth between, so a phone held near level does
 * not flicker the ground on and off.
 */
export function groundOpacity(viewAltitudeDeg: number): number {
  return smoothstep(-2, 10, viewAltitudeDeg);
}

export interface GroundRegion {
  /** The ground's outline on screen: x, y pairs, clockwise, three to five corners. */
  points: number[];
  /**
   * The horizon's nearest point to the screen centre, and the unit direction
   * on screen that points into the ground. Null when the horizon is not on
   * screen, so there is no edge to soften.
   */
  edge: { x: number; y: number; nx: number; ny: number } | null;
}

/**
 * The part of the screen that looks at the ground, through a camera that is
 * NOT turned by the sidereal scrubber (the ground does not turn with the sky).
 *
 * The projection is gnomonic, and a gnomonic projection draws every great
 * circle as a straight line. The horizon is a great circle, so the ground is a
 * half-plane of the screen and the outline is the screen rectangle cut by one
 * line. The ray through screen point (x, y) is
 *
 *   focal * forward + (x - w/2) * right - (y - h/2) * up
 *
 * and its height above the horizon is the z of that, which is linear in x and
 * y. Every pixel where it is negative is ground.
 *
 * @returns null when no pixel looks below the horizon.
 */
export function groundRegion(cam: CameraBasis, width: number, height: number): GroundRegion | null {
  const cx = width / 2;
  const cy = height / 2;
  const up = (x: number, y: number) => cam.focal * cam.fz + (x - cx) * cam.rz - (y - cy) * cam.uz;

  const corners = [0, 0, width, 0, width, height, 0, height];
  const points: number[] = [];
  for (let i = 0; i < 4; i++) {
    const ax = corners[i * 2], ay = corners[i * 2 + 1];
    const bx = corners[((i + 1) % 4) * 2], by = corners[((i + 1) % 4) * 2 + 1];
    const za = up(ax, ay), zb = up(bx, by);
    if (za < 0) points.push(ax, ay);
    // Sutherland-Hodgman against one plane: an edge that crosses the horizon
    // contributes the crossing point.
    if ((za < 0) !== (zb < 0)) {
      const t = za / (za - zb);
      points.push(ax + (bx - ax) * t, ay + (by - ay) * t);
    }
  }
  if (points.length < 6) return null;

  // The gradient of `up` on screen is (rz, -uz). Ground lies against it.
  const gx = cam.rz, gy = -cam.uz;
  const g2 = gx * gx + gy * gy;
  let edge: GroundRegion["edge"] = null;
  if (g2 > 1e-12) {
    const z0 = up(cx, cy);
    const len = Math.sqrt(g2);
    edge = { x: cx - (z0 * gx) / g2, y: cy - (z0 * gy) / g2, nx: -gx / len, ny: -gy / len };
  }
  return { points, edge };
}

/**
 * ATMOSPHERIC EXTINCTION, which is why a rising moon is orange.
 *
 * Coefficients in magnitudes per airmass for red, green and blue light at a
 * clear sea-level site: Rayleigh scattering plus a modest aerosol load and
 * ozone. A real night varies around these by a factor of two either way; what
 * does not vary is the order, blue lost first.
 */
const EXTINCTION = [0.1, 0.18, 0.3] as const;

/**
 * Air mass along a line of sight, from Kasten and Young (1989), which stays
 * finite at the horizon (about 38) where the plane-parallel 1 / sin(h) runs to
 * infinity.
 */
export function airmass(altitudeDeg: number): number {
  const h = Math.max(0, altitudeDeg);
  return 1 / (Math.sin(h * DEG) + 0.50572 * Math.pow(h + 6.07995, -1.6364));
}

export interface MoonSkyLight {
  /** Per-channel multipliers for the moon's own render, 0 to 1. */
  r: number;
  g: number;
  b: number;
}

/**
 * The colour and brightness the air puts on the moon at one instant.
 *
 * COLOUR from the moon's altitude. Each channel is dimmed by its extinction
 * over the EXTRA air below the zenith, so a moon overhead is drawn exactly as
 * the shader made it. The eye adapts to the moon it is looking at, so the tint
 * is normalised to its brightest channel: what changes with altitude is hue,
 * and brightness is handled separately.
 *
 * BRIGHTNESS from the green channel's loss, compressed by a 0.3 power because
 * the eye's response to luminance is close to a cube root. A moon on the
 * horizon really is about two magnitudes down; it does not look six times
 * dimmer, and drawing it six times dimmer would be the wrong claim.
 *
 * BELOW THE HORIZON there is no air path to colour, and the view can still
 * look there through a faded ground, so the tint fades out over ten degrees.
 *
 * DAYLIGHT from the sun's altitude. Against a bright sky the moon's contrast
 * falls. The view adds the moon onto the sky rather than painting over it, so
 * the dark side disappears into a day sky by itself; this only takes the lit
 * side down a quarter so it reads as pale rather than as a lamp.
 *
 * None of this is printed as a number. It is how the disc is drawn, and the
 * phase, which is the claim, is untouched by it.
 */
export function moonSkyLight(moonAltitudeDeg: number, sunAltitudeDeg: number): MoonSkyLight {
  const air = airLight(moonAltitudeDeg);
  const day = 1 - 0.25 * smoothstep(-6, 4, sunAltitudeDeg);
  return { r: air.r * day, g: air.g * day, b: air.b * day };
}

/**
 * The colour and brightness the air puts on anything seen at this altitude:
 * the sun and planets as well as the moon. The parts of moonSkyLight that are
 * not about daylight; see there for each term.
 */
export function airLight(altitudeDeg: number): MoonSkyLight {
  const extra = Math.max(0, airmass(altitudeDeg) - 1) * smoothstep(-10, 0, altitudeDeg);
  const t = EXTINCTION.map((k) => Math.pow(10, -0.4 * k * extra));
  const peak = Math.max(t[0], t[1], t[2]);
  const brightness = Math.max(0.35, Math.pow(t[1], 0.3));
  return { r: (t[0] / peak) * brightness, g: (t[1] / peak) * brightness, b: (t[2] / peak) * brightness };
}
