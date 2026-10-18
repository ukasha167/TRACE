/**
 * THE LIGHT OF THE NIGHT SKY: what colour a star is, how bright the moon makes
 * the sky, and how much of the Milky Way survives both.
 *
 * Pure numbers. The sky view's Milky Way shader (components/sky/skyShader.ts)
 * evaluates the same formulas per pixel; these are the reference it is tested
 * against in spirit and the place the constants live.
 */

const DEG = Math.PI / 180;

/**
 * Effective temperature from the B-V colour index, after Ballesteros (2012),
 * which treats a star as a blackbody seen through the Johnson B and V filters.
 * It is the mapping NASA's Deep Star Maps settled on after a polynomial fit
 * produced implausibly red stars outside its range: 5,780 K for the sun's 0.65,
 * about 10,000 K at 0.0, about 3,300 K for Betelgeuse's 1.85.
 */
export function bvToKelvin(bv: number): number {
  const b = Math.max(-0.4, Math.min(2.0, bv));
  return 4600 * (1 / (0.92 * b + 1.7) + 1 / (0.92 * b + 0.62));
}

/**
 * Stars fainter than this are drawn white. Below about this brightness a star
 * is seen by the rods, which see no colour, and every naked-eye observer
 * reports the faint field as white whatever its spectra.
 */
export const STAR_COLOUR_MAG_LIMIT = 4.0;

/** Krisciunas and Schaefer's extinction coefficient for V, magnitudes per airmass. */
export const KS_EXTINCTION = 0.172;

/**
 * The natural night sky at the zenith, nanolamberts: 79 nL, about 21.6 V
 * magnitudes per square arcsecond, a dark site at solar minimum.
 */
export const DARK_SKY_NL = 79;

/** Airmass in Krisciunas and Schaefer's form, from the zenith angle in degrees. */
export function ksAirmass(zenithDeg: number): number {
  const s = Math.sin(Math.min(90, Math.max(0, zenithDeg)) * DEG);
  return 1 / Math.sqrt(1 - 0.96 * s * s);
}

/**
 * The moon's brightness outside the atmosphere, in K&S's units, from its phase
 * angle in degrees (0 at full). The fourth-power term is the opposition surge:
 * a full moon is far brighter than twice a quarter.
 */
export function moonIntensity(phaseAngleDeg: number): number {
  const a = Math.abs(phaseAngleDeg);
  return Math.pow(10, -0.4 * (3.84 + 0.026 * a + 4e-9 * a ** 4));
}

/**
 * How strongly air scatters moonlight toward the eye at angle rho from the
 * moon: Rayleigh scattering (the cos squared term) plus Mie scattering off
 * aerosols, which is what makes the bright aureole close to the moon.
 */
export function scattering(rhoDeg: number): number {
  const c = Math.cos(rhoDeg * DEG);
  return Math.pow(10, 5.36) * (1.06 + c * c) + Math.pow(10, 6.15 - rhoDeg / 40);
}

/**
 * Sky brightness added by the moon, nanolamberts, at a point zenithDeg from
 * the zenith and rhoDeg from the moon (Krisciunas and Schaefer 1991, eq. 15).
 * Zero with the moon below the horizon. A full moon at 45 degrees puts a few
 * thousand nL on the sky, forty times the dark sky, which is why it hides the
 * Milky Way.
 */
export function moonSkyBrightness(
  phaseAngleDeg: number,
  moonZenithDeg: number,
  zenithDeg: number,
  rhoDeg: number,
  k = KS_EXTINCTION
): number {
  if (moonZenithDeg >= 90) return 0;
  return (
    scattering(rhoDeg) *
    moonIntensity(phaseAngleDeg) *
    Math.pow(10, -0.4 * k * ksAirmass(moonZenithDeg)) *
    (1 - Math.pow(10, -0.4 * k * ksAirmass(zenithDeg)))
  );
}

/**
 * The natural sky's own brightness away from the zenith: brighter toward the
 * horizon because the line of sight crosses more glowing air, dimmer by the
 * extinction of that air (K&S eq. 2).
 */
export function darkSkyBrightness(zenithDeg: number, k = KS_EXTINCTION): number {
  const x = ksAirmass(zenithDeg);
  return DARK_SKY_NL * Math.pow(10, -0.4 * k * (x - 1)) * x;
}

/**
 * The share of the Milky Way's contrast that survives a brightened sky, 0 to 1.
 * A faint extended glow is seen against its background, and its contrast falls
 * as that background rises: (dark sky) / (dark sky + moonlight).
 */
export function milkyWayContrast(darkNl: number, moonNl: number): number {
  return darkNl / (darkNl + Math.max(0, moonNl));
}

/**
 * How much of the Milky Way twilight leaves, 0 to 1. Astronomical twilight
 * ends at a solar depression of 18 degrees, which is defined as the point the
 * sun stops brightening the sky; by 12 degrees the band is gone to the naked
 * eye. Linear between.
 */
export function twilightClearance(sunAltitudeDeg: number): number {
  return Math.max(0, Math.min(1, (-sunAltitudeDeg - 12) / 6));
}

/**
 * Dark adaptation. The eye takes minutes to adapt to the dark and fractions of
 * a second to adapt to light. The view compresses the first to a few seconds,
 * so the Milky Way comes up after the sky opens, or after a scrub out of
 * twilight, and goes at once when the sky brightens. A step of the adaptation
 * level toward `target` over `dtMs`.
 */
export const ADAPT_DARK_MS = 2500;
export const ADAPT_LIGHT_MS = 200;
export function adapt(level: number, target: number, dtMs: number): number {
  const tau = target > level ? ADAPT_DARK_MS : ADAPT_LIGHT_MS;
  return target + (level - target) * Math.exp(-Math.max(0, dtMs) / tau);
}

/**
 * The temperatures star cores are drawn in, coolest first. Ten paths a frame
 * is what colour costs the renderer, so stars are binned to the nearest of
 * these; neighbouring bins differ by less than a naked-eye observer can name.
 * Bin 0 is white, for faint stars and stars with no measured B-V.
 */
export const STAR_TINT_KELVIN = [3300, 3900, 4600, 5400, 6300, 7500, 9500, 13000, 20000] as const;

/** Which colour bin a star is drawn in: 0 for white, else 1 + its STAR_TINT_KELVIN index. */
export function starTint(bv: number | undefined, mag: number): number {
  if (bv == null || mag > STAR_COLOUR_MAG_LIMIT) return 0;
  const k = Math.log(bvToKelvin(bv));
  let best = 0;
  for (let i = 1; i < STAR_TINT_KELVIN.length; i++) {
    if (Math.abs(Math.log(STAR_TINT_KELVIN[i]) - k) < Math.abs(Math.log(STAR_TINT_KELVIN[best]) - k)) best = i;
  }
  return best + 1;
}

/**
 * Air mass from the sine of the altitude, Rozenberg's (1966) form: finite at
 * the horizon (40) and needing no inverse trigonometry, which matters at six
 * thousand stars a frame.
 */
export function airmassFromSine(sinAlt: number): number {
  const s = Math.max(0, sinAlt);
  return 1 / (s + 0.025 * Math.exp(-11 * s));
}
