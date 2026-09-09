/**
 * How the Moon is lit, as numbers. No Skia, no React Native: the shader in
 * `components/moon/moonShader.ts` is only the thing that draws these.
 *
 * The reason this is a separate module is decision 13. When the same quantity
 * is computed in two places, the two places drift, and the drift is invisible
 * until someone photographs a moon upside down. The renderer and the tests read
 * the illumination geometry from here or from nowhere.
 */

const DEG = Math.PI / 180;

/**
 * The phase angle: Sun-Moon-observer, in degrees. 0 is full, 180 is new.
 *
 * The illuminated fraction of a sphere is f = (1 + cos g) / 2, so this is just
 * that inverted. It takes `phaseFraction`, which is a measurement, and never
 * `phaseIndex`, which is an eight-way bucket that straddles every syzygy.
 */
export function phaseAngleDeg(phaseFraction: number): number {
  const f = clamp01(phaseFraction);
  return Math.acos(clamp(2 * f - 1, -1, 1)) / DEG;
}

/**
 * McEwen's Lunar-Lambert coefficient for the Moon, phase angle in degrees.
 *
 * This is the term that decides how much of the surface behaves like
 * Lommel-Seeliger single scattering and how much like a Lambert diffuser. It
 * runs from 1 at full, where the disc is famously flat to its edge, toward 0 at
 * high phase, where a crescent shades like a ball.
 *
 * The cubic is fitted to roughly 140 degrees and goes negative past that, which
 * would subtract light from a thin crescent, so it is clamped rather than
 * trusted at the ends.
 */
export function lunarLambertL(phaseAngle: number): number {
  const g = Math.abs(phaseAngle);
  const l = 1 - 0.019 * g + 0.000242 * g * g - 0.00000146 * g * g * g;
  return clamp01(l);
}

export interface SunDirection {
  /** Disc frame, x right. */
  x: number;
  /** Disc frame, y DOWN, matching Skia's canvas convention. */
  y: number;
  /** Toward the observer. +1 at full moon. */
  z: number;
  phaseAngle: number;
}

/**
 * The Sun's direction in the disc frame.
 *
 * `litRotationDeg` is `getLitPathRotation(brightLimbAngleDeg, waxing)`, used
 * exactly as the old two-arc path used it: it carries both the tilt and which
 * side is lit. Feeding the shader the same number the path rotated by is what
 * makes this a change of rendering and not a change of phase presentation.
 *
 * The sub-solar point sits `g` away from the sub-Earth point in the direction
 * of the bright limb, which is the whole content of the vector below.
 */
export function sunDirection(
  phaseFraction: number,
  litRotationDeg: number
): SunDirection {
  const g = phaseAngleDeg(phaseFraction);
  const sinG = Math.sin(g * DEG);
  const cosG = Math.cos(g * DEG);
  const a = litRotationDeg * DEG;
  return {
    x: sinG * Math.cos(a),
    y: sinG * Math.sin(a),
    z: cosG,
    phaseAngle: g,
  };
}

/**
 * The terminator's semi-axis across the disc, in radii.
 *
 * For a sphere lit from L the terminator is N·L = 0, which projects to an
 * ellipse of semi-axis |cos g| across and 1 down; and cos g = 2f - 1. That is
 * the same |2f - 1| that `litMoonPath` uses for `b`.
 *
 * This exists so the two can be held against each other in a test. If they ever
 * disagree, the phase is being drawn two different ways in two places.
 */
export function terminatorSemiAxis(phaseFraction: number): number {
  return Math.abs(2 * clamp01(phaseFraction) - 1);
}

/**
 * The Lunar-Lambert reflectance, for a surface element with the given cosines.
 *
 * Reference implementation of what the shader does per pixel, so the curve can
 * be asserted on: monotonic across the terminator, flat at full, no step.
 */
export function lunarLambertReflectance(
  mu0: number,
  mu: number,
  L: number
): number {
  const lit = Math.max(mu0, 0);
  const denom = Math.max(lit + mu, 1e-4);
  return (2 * L * lit) / denom + (1 - L) * lit;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

/**
 * How far earthshine wraps past the geometric terminator, as a fraction of a
 * full cosine.
 *
 * The Earth is not a point in the Moon's sky: it subtends about two degrees,
 * four times the Sun's disc, so its own terminator on the lunar surface is soft.
 * Wrapping a diffuse term is the cheap standard way of saying that.
 *
 * It has to be non-zero for a second reason, which is the bug the earthshine
 * term was rewritten to fix. See `earthshineTerm`.
 */
export const EARTHSHINE_WRAP = 0.35;

/**
 * The floor under `earthshineGain`, and the one place this model is a print
 * decision rather than a measurement.
 *
 * Under it a gibbous moon's night side reaches the ground exactly, the disc
 * loses its silhouette against a black plate, and what is left reads as an egg
 * rather than as a sphere with a dark half. Real earthshine at 81% illumination
 * is far below this. Nothing in the app claims otherwise, and the measured
 * percentage is always printed beside the moon.
 */
export const EARTHSHINE_FLOOR = 0.25;

/**
 * How strongly earthshine prints on a moon of this illuminated fraction.
 *
 * Earthshine is sunlight that went Sun -> Earth -> Moon -> eye, so it follows
 * the EARTH's phase, and the two phases are complementary: a 2% moon hangs
 * under a 98% Earth. That is why the ash-grey disc inside a thin crescent is
 * something anyone can see on a clear evening and a gibbous moon's dark side is
 * not. Hence `1 - f`, floored for the reason above.
 */
export function earthshineGain(phaseFraction: number): number {
  return (
    EARTHSHINE_FLOOR + (1 - EARTHSHINE_FLOOR) * (1 - clamp01(phaseFraction))
  );
}

/**
 * Earthshine's shape over the disc, 0 to 1, before colour or phase gain.
 *
 * WHAT THIS REPLACED, because the difference is the whole bug. Earthshine used
 * to be a flat fill gated on `smoothstep(0.06, -0.06, mu0)`: a mask 0.12 wide
 * in the incidence cosine, switched on at the terminator and constant across
 * the entire night side. Two things followed, and both were visible.
 *
 *   1. A DARK LINE TRACED THE TERMINATOR. The sunlit term reaches zero at
 *      mu0 = 0 and the mask only reached full strength at mu0 = -0.06, so
 *      neither light covered the crossing. Measured across a 42% moon: 0.065
 *      on the earthlit side, 0.035 at the crossing, then back up. The phase
 *      read as a cut edge rather than as a surface turning away from the light.
 *   2. THE NIGHT SIDE WAS A COIN. A constant fill has no gradient, so the dark
 *      half was a flat disc pasted behind a lit crescent. Measured across the
 *      same moon, luminance held between 0.062 and 0.067 over the whole unlit
 *      hemisphere.
 *
 * Earthshine is a LIGHT here, not a mask. It comes from the anti-solar
 * direction, which is where the Earth is in the Moon's sky to within the few
 * degrees separating the sub-Earth and sub-observer points, and it is wrapped,
 * so it reaches a little way onto the SUNLIT side and the two lights overlap
 * instead of meeting. There is no gate left to disagree with the surface it
 * controls, which is the lesson of decision 20.
 */
export function earthshineTerm(mu0: number, mu: number): number {
  const muE = -mu0;
  const wrapped = Math.max(
    (muE + EARTHSHINE_WRAP) / (1 + EARTHSHINE_WRAP),
    0
  );
  // Squared for a softer shoulder off the terminator, then limb-darkened, which
  // is what rounds the night side off instead of leaving it a flat plate.
  return wrapped * wrapped * (0.35 + 0.65 * mu);
}

/**
 * Total light leaving a surface element: sunlight plus earthshine, in units of
 * a full-moon Lambert surface.
 *
 * Reference implementation of the shader's two lighting terms, so their sum can
 * be asserted on rather than looked at. `earthLevel` is earthshine's peak
 * brightness in the same units, which in the renderer arrives as a colour and
 * so lives in theme.ts.
 */
export function surfaceBrightness(
  mu0: number,
  mu: number,
  L: number,
  earthLevel: number,
  phaseFraction: number
): number {
  return (
    lunarLambertReflectance(mu0, mu, L) +
    earthLevel * earthshineGain(phaseFraction) * earthshineTerm(mu0, mu)
  );
}
