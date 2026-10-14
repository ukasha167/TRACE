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
 * the same |2f - 1| the two-arc cutout used for `b` before the shader replaced
 * it.
 *
 * This exists so a test can hold the shader's terminator to that derivation. If
 * the two ever disagree, the phase has moved without anyone meaning it to.
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
 * The ceiling over `earthshineGain`, which is the print level at new moon.
 *
 * WAS 1.0, AND THAT WAS MEASURABLY TOO HOT. The gain rises toward new while the
 * sunlit crescent shrinks toward nothing, so the two run in opposite directions
 * and nobody had measured where they cross. Sampling the disc through the whole
 * shader, the night side's 99th-percentile luminance against the sunlit side's
 * ran **0.354 at 2% illumination and 0.667 at 0.5%**. A 2% moon was printing its
 * dark side at a third of the brightness of its own crescent, which does not
 * read as ashen light. It reads as a lit sphere with a bright rim, and that is
 * what it looked like.
 *
 * A tone curve cannot fix this, and it is worth knowing why before reaching for
 * one. The night side spans 20:1 from crescent to gibbous and needs to span
 * about 8:1; any toe compresses the bottom of that range harder than the top, so
 * it takes the gibbous silhouette out before it brings the crescent into line.
 * The level is the thing that is wrong, so the level is what moves.
 *
 * 0.36 puts the ratio at 0.151 at 2% illumination, inside the 0.10 to 0.20 band
 * a single-exposure photograph of the ashen light actually sits in, and costs
 * the gibbous silhouette almost nothing: the unlit limb at 90% illumination goes
 * from 0.0027 to 0.0022, against 0.0050 for the whole night side.
 *
 * It was briefly 0.42, which was right while the exposure was un-metered. Adding
 * the meter below roughly doubles the exposure at 2% and earthshine rides on it,
 * so the two had to be re-measured together. That is the point of them sharing a
 * file.
 *
 * THE SHAPE IS UNTOUCHED. This is the range of a print, not the physics of one.
 * Earthshine still follows the Earth's phase and is still brightest at new; the
 * amplitude it does that over is smaller.
 */
export const EARTHSHINE_CEILING = 0.36;

/**
 * How strongly earthshine prints on a moon of this illuminated fraction.
 *
 * Earthshine is sunlight that went Sun -> Earth -> Moon -> eye, so it follows
 * the EARTH's phase, and the two phases are complementary: a 2% moon hangs
 * under a 98% Earth. That is why the ash-grey disc inside a thin crescent is
 * something anyone can see on a clear evening and a gibbous moon's dark side is
 * not. Hence `1 - f`, between the floor and the ceiling above, both of which are
 * print decisions and are documented as such.
 */
export function earthshineGain(phaseFraction: number): number {
  return (
    EARTHSHINE_FLOOR +
    (EARTHSHINE_CEILING - EARTHSHINE_FLOOR) * (1 - clamp01(phaseFraction))
  );
}

/**
 * The incidence cosine at the brightest sunlit point on the visible disc.
 *
 * For g <= 90 degrees the sub-solar point is on the near side, so somewhere on
 * the disc faces the Sun square and the answer is 1. Past that the sub-solar
 * point has gone round the limb, the brightest ground left is the limb itself,
 * and its incidence cosine is sin g. Since cos g = 2f - 1, that is 2 sqrt(f(1-f)).
 *
 * Checked against a 200,000-step numerical maximum of the full Lunar-Lambert
 * expression over the visible hemisphere: agreement to 8e-12, which is floating
 * point. A test holds it, because this is the kind of identity that is obvious
 * until the day it is off by a factor.
 *
 * This is what the exposure meters on.
 */
export function peakIncidence(phaseFraction: number): number {
  const f = clamp01(phaseFraction);
  return f >= 0.5 ? 1 : 2 * Math.sqrt(f * (1 - f));
}

/**
 * Print exposure at new moon. `1 - exp(-E * L)` on luminance, so it cannot clip.
 *
 * Reflectance is not a print: an unexposed Lunar-Lambert disc peaks around 0.4
 * of white at quarter phase and reads as grey felt. Photographs of the Moon are
 * exposed for the sunlit side.
 */
export const PRINT_EXPOSURE = 1.9;

/** How much the exposure stops down as the disc fills, 0 to 1 of PRINT_EXPOSURE. */
const EXPOSURE_STOP_DOWN = 0.22;

/**
 * The peak incidence at which the ramp alone stops holding the sunlit side up,
 * and the meter starts working.
 *
 * Not chosen. Measured: the sunlit 99th percentile falls out of decision 24's
 * 0.46 to 0.76 band at 8% illumination, and peakIncidence(0.08) is 0.543. The
 * knee is where the band breaks, which is why it is 0.55 and not a round number
 * someone liked. Above it this whole function is the ramp decision 24 shipped,
 * multiplied by exactly 1.
 */
const EXPOSURE_METER_KNEE = 0.55;

/**
 * Where the meter stops opening up, and the reason it has to stop.
 *
 * THE METER AND THE EARTHSHINE CEILING PULL AGAINST EACH OTHER. Opening up for a
 * vanishing crescent lifts the earthshine filling the rest of the disc by the
 * same amount, and past a point that undoes the ceiling above. Un-floored, a
 * 0.5% moon came out with earthshine 38% BRIGHTER than the version this was
 * meant to fix.
 *
 * So the floor is set by an invariant rather than by taste: **the meter may
 * never print earthshine brighter than the un-metered exposure did.** That is
 * `printExposure(f) * earthshineGain(f) <= PRINT_EXPOSURE` for every f, and two
 * tests hold it. 0.20 is the largest boost that clears it, and it lands at 1%
 * illumination, which is also where the night-to-lit ratio was leaving its band
 * anyway. Two independent constraints picking the same place is the only reason
 * to trust either.
 *
 * Below 1% the crescent is allowed to fall out of band, down to 0.26 at 0.2%.
 * That is honest and it is also photography: there is not enough sunlit surface
 * left to meter on, and opening up further only prints the earthshine.
 */
const EXPOSURE_METER_FLOOR = 0.2;

/**
 * Print exposure for a moon of this illuminated fraction.
 *
 * TWO PARTS. The ramp is decision 24: one exposure cannot serve every phase,
 * because a full moon reflects near 1.0 flat across the disc while a crescent's
 * lit sliver averages a fraction of that, so it stops down linearly as the disc
 * fills. Full moon is the Looney 11 case and a crescent wants two or three stops
 * more.
 *
 * The meter is decision 27, and it is what the ramp was missing. Stopping DOWN
 * with f is right at the top of the cycle and does nothing at the bottom, where
 * the problem is the opposite: the peak sunlit reflectance itself collapses, so
 * a thin crescent needs to be opened UP, not merely left alone. Measured, the
 * sunlit p99 ran 0.275 at 2% and 0.153 at 0.5%, against a 0.46 floor.
 *
 * Dividing by the peak incidence is what a light meter does. The evidence that
 * it is the right law rather than a convenient one: solving numerically for the
 * exposure each phase needs to place its sunlit p99 at 0.5, the product
 * `E * peakIncidence` came out 1.09 to 1.14 across three decades of f, from
 * 0.2% to 50%. A constant. Everything else about the disc changes over that
 * range and that product does not.
 */
export function printExposure(phaseFraction: number): number {
  const f = clamp01(phaseFraction);
  const ramp = PRINT_EXPOSURE * (1 - EXPOSURE_STOP_DOWN * f);
  const peak = clamp(
    peakIncidence(f),
    EXPOSURE_METER_FLOOR,
    EXPOSURE_METER_KNEE
  );
  return ramp * (EXPOSURE_METER_KNEE / peak);
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
