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

export interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Samples along each screen edge in groundBounds. The rectangle can run up to one step past the ground. */
const EDGE_STEPS = 16;
/** The screen's corners as fractions of its size, clockwise from the top left. */
const CORNERS = [0, 0, 1, 0, 1, 1, 0, 1];

/** Whether the ray through screen offset (x, y) from the centre, y down, is below the altitude whose sine is s. */
function looksBelow(cam: CameraBasis, x: number, y: number, s: number): boolean {
  const dx = cam.focal * cam.fx + x * cam.rx - y * cam.ux;
  const dy = cam.focal * cam.fy + x * cam.ry - y * cam.uy;
  const dz = cam.focal * cam.fz + x * cam.rz - y * cam.uz;
  return dz < s * Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * The rectangle of the screen that holds every pixel looking below
 * `altitudeDeg`, through a camera that is NOT turned by the sidereal scrubber,
 * written into `out`. False, with `out` untouched, when no pixel looks that low.
 * `altitudeDeg` must be above zero.
 *
 * The landscape shader rebuilds a ray for every pixel it covers. Drawn over the
 * whole screen, each pixel above the treeline paid for a ray, an arcsine and a
 * blend to draw nothing. Now the pass is skipped when this is false and covers
 * only this rectangle when it is true.
 *
 * Why the screen's edges are enough. Above a positive altitude the sky is a cap
 * round the zenith, narrower than a hemisphere, and the projection is
 * gnomonic, which draws great circles as straight lines, so the cap's share of
 * the screen is convex. The ground, the rest of the rectangle, then reaches
 * furthest in any direction on the rectangle's own border: a line across the
 * screen whose two ends were both in the cap would be all cap, so a ground
 * pixel inside has ground level with it on an edge. Convexity also means the
 * cap covers at most one run of each edge, so widening each run of ground
 * samples by one sample at either end takes in every crossing.
 */
export function groundBounds(cam: CameraBasis, width: number, height: number, altitudeDeg: number, out: ScreenRect): boolean {
  const s = Math.sin(altitudeDeg * DEG);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = (x: number, y: number) => {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  };
  for (let e = 0; e < 4; e++) {
    const ax = CORNERS[e * 2] * width, ay = CORNERS[e * 2 + 1] * height;
    const bx = CORNERS[((e + 1) % 4) * 2] * width, by = CORNERS[((e + 1) % 4) * 2 + 1] * height;
    let wasBelow = false, px = 0, py = 0;
    for (let k = 0; k <= EDGE_STEPS; k++) {
      const t = k / EDGE_STEPS;
      const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
      const below = looksBelow(cam, x - width / 2, y - height / 2, s);
      if (below || wasBelow) grow(x, y);
      if (below && !wasBelow && k > 0) grow(px, py);
      wasBelow = below;
      px = x;
      py = y;
    }
  }
  if (x0 > x1) return false;
  out.x = x0;
  out.y = y0;
  out.width = x1 - x0;
  out.height = y1 - y0;
  return true;
}

/**
 * How lit the landscape is, 0 to 1, from the sun and the moon.
 *
 * Stellarium's shape: the sun's term is the sine of its altitude plus 8
 * degrees, so the field keeps some light through civil twilight and is fully
 * lit only with the sun high; the moon adds up to 0.4 at full and overhead.
 * Stellarium's own floor is 1%, which on a phone draws the field as black on
 * black; 10% keeps the treeline readable against the stars. The floor and the
 * moon's share are print decisions.
 */
export const LANDSCAPE_NIGHT = 0.1;
export function landscapeLight(sunAltitudeDeg: number, moonAltitudeDeg: number, moonFraction: number): number {
  const sun = Math.max(0, Math.sin(Math.min(90, sunAltitudeDeg + 8) * DEG));
  const moon = 0.4 * Math.max(0, Math.min(1, moonFraction)) * Math.sqrt(Math.max(0, Math.sin(moonAltitudeDeg * DEG)));
  return Math.min(1, LANDSCAPE_NIGHT + sun + moon);
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

export interface MoonGlare {
  /** The glare's radius on screen, canvas units. */
  radius: number;
  /** Its opacity at the centre, 0-1. Zero once the disc is large enough to carry its own glow. */
  alpha: number;
  /** Gain on the disc's own light, 1 or more. */
  exposure: number;
}

/**
 * The light round a small moon, and how far its disc is lifted.
 *
 * At the eye's field the true moon is about ten points across, and drawn as
 * the shader made it, a full moon was a dull sticker: maria and all, at the
 * brightness of a grey card. Outside it is the brightest thing in the night
 * sky, and the eye sees a glare round it that has nothing to do with its
 * size. Stellarium draws that glare as a halo scaled by the moon's
 * brightness; so does this, by the square root of the lit fraction, so a thin
 * crescent gets a little and a full moon a lot. The disc is lifted by up to
 * 60% while it is small, which pushes the bright highlands toward white as
 * the eye does.
 *
 * Both fade out as the zoom grows the disc: by 120 points across the image's
 * own limb glow is doing the job, and the moon is drawn exactly as the shader
 * made it. None of this changes the disc's size, its phase or its tilt. It is
 * a print decision, as the star glow is.
 */
export function moonGlare(discRadius: number, litFraction: number): MoonGlare {
  const small = 1 - smoothstep(10, 60, discRadius);
  return {
    radius: Math.max(discRadius * 5, 40),
    alpha: 0.5 * Math.sqrt(Math.max(0, Math.min(1, litFraction))) * small,
    exposure: 1 + 0.6 * small,
  };
}
