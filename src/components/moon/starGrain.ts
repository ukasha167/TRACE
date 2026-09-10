import { Colors, SkyColors } from "@/constants/theme";

/**
 * THE FIELD BEHIND THE MOON.
 *
 * Named `starGrain` rather than `starField` because that is what it is, and
 * because the component that draws it takes the other name.
 *
 * Grain, not a star chart. There is no catalogue behind this, no magnitudes and
 * no positions, and nothing in the interface ever names one of these or lets
 * you tap one. The real sky is the immersive view, drawn from the Yale BSC at
 * the record's own place and time, and that is the only surface in the app
 * allowed to say a star was anywhere.
 *
 * WHY THAT IS NOT A RULE 1 VIOLATION, since a decorative sky on a screen whose
 * whole premise is real numbers deserves the question. The field makes no
 * astronomical claim because it is IDENTICAL EVERYWHERE: same seed, same stars,
 * on every record, every date, every place. A field that changed with the
 * date would be asserting that this night's sky differed from that one, which
 * is exactly the kind of quiet lie rule 1 exists to catch. A constant texture
 * asserts nothing, the same way the paper grain does not claim to be paper.
 *
 * Seeding it per record is therefore not an improvement waiting to be made. It
 * is the bug.
 *
 * The field is also what keeps the moon the subject. Stars run 0.07 to 0.55
 * alpha with the distribution weighted hard toward the floor, so the plate
 * stops being an empty black rectangle without anything on it competing with a
 * 240pt lit sphere.
 */

export interface FieldStar {
  /** Centre, in field units. */
  x: number;
  y: number;
  /** Core radius, field units. */
  r: number;
  /** Core opacity, 0-1. */
  a: number;
  /** Resolved tint, mixed from SkyColors.starCool/starWarm through moonlight. */
  color: string;
}

export interface StarFieldOptions {
  width: number;
  height: number;
  /**
   * Field units per point. 1 on screen, where Skia canvas units are points.
   * The export card is authored at its output pixel size, so it passes its own
   * width over NOMINAL_WIDTH and gets the same field relative to the plate that
   * the screen shows. A card that does not match the screen it came from is
   * what decision 13 is about.
   */
  scale?: number;
  seed?: number;
}

/**
 * The phone width the density and radii below were judged at. Only the export
 * card needs it; on screen the scale is 1 because the plate IS this wide.
 */
export const NOMINAL_WIDTH = 400;

/** One cell per this many square points. Cells are jittered, not filled. */
const CELL_AREA = 1750;

/** Fraction of cells left empty, which is what stops the field reading as a grid. */
const SKIP = 0.24;

const ALPHA_MIN = 0.09;
const ALPHA_MAX = 0.62;
const RADIUS_MIN = 0.4;
const RADIUS_MAX = 1.3;

/**
 * How hard brightness is pushed toward the floor. u^2.4 has mean 0.29, so the
 * typical star sits near ALPHA_MIN and the bright ones are genuinely rare.
 * A flat distribution gives every star the same weight and the field reads as
 * static rather than as sky.
 */
const FAINT_BIAS = 2.4;

/**
 * How hard the tint is pushed toward neutral. The draw is `sign(u) * |u|^3`, so
 * the mean shift is a quarter of the way to an endpoint and only about one star
 * in ten carries a tint you would name. Anything flatter and the field turns
 * into confetti, which is a much louder failure than the flat white it replaced.
 */
const TINT_BIAS = 3;

/**
 * THE STARS ARE DRAWN TWICE: a blurred halo, then a core over it.
 *
 * A hard disc reads as a dot on a surface rather than as a light in a distance,
 * and no amount of tuning the radius fixes that, because the thing missing is
 * the falloff. Blurring everything uniformly instead would have taken the cores
 * with it and left a field of smudges.
 *
 * ONE BLUR FOR EVERY STAR, not one scaled by brightness. A point spread function
 * belongs to the air and the lens, not to the star, so a bright star and a faint
 * one spread by exactly the same amount and the bright one simply has more light
 * to spread. That is also what makes the faint ones stay quiet for free: blur
 * conserves energy, so a small dim disc pushed through the same kernel loses
 * almost all of its peak and reads as a soft point, while a bright one keeps
 * enough to show a halo.
 *
 * The same two numbers drive the export card, scaled by the card's own scale,
 * so the print matches the screen.
 */
export const GLOW_BLUR = 1.3;
export const CORE_BLUR = 0.35;
/** Halo radius and opacity, as multiples of the core's. */
export const GLOW_RADIUS = 2.0;
export const GLOW_ALPHA = 0.55;

/** mulberry32. Small, fast, and good enough for scattering dots. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const NEUTRAL = rgb(Colors.moonlight);
const COOL = rgb(SkyColors.starCool);
const WARM = rgb(SkyColors.starWarm);

const hex2 = (n: number) =>
  Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");

/**
 * Tint for `t` in [-1, 1]: negative toward the hot blue end, positive toward the
 * cool orange end, zero exactly moonlight.
 *
 * The mix runs in plain sRGB rather than a linear space on purpose. These are
 * three points on a blackbody curve a few hundred kelvin apart in perceptual
 * terms, and a gamma-correct blend between them differs from this one by under
 * a level. Correctness that no one can see is not worth the import.
 */
export function starTint(t: number): string {
  const to = t < 0 ? COOL : WARM;
  const k = Math.abs(t);
  return (
    "#" +
    hex2(NEUTRAL[0] + (to[0] - NEUTRAL[0]) * k) +
    hex2(NEUTRAL[1] + (to[1] - NEUTRAL[1]) * k) +
    hex2(NEUTRAL[2] + (to[2] - NEUTRAL[2]) * k)
  );
}

/**
 * Stars for a plate of this size.
 *
 * STRATIFIED, NOT UNIFORM. Sampling positions uniformly at low counts produces
 * clumps and bald patches, and at 50 stars a bald patch reads as a rendering
 * fault rather than as sky. One jittered star per grid cell with a quarter of
 * the cells dropped gives even coverage that still has no visible order in it.
 */
export function generateStarField({
  width,
  height,
  scale = 1,
  seed = 0x7ace,
}: StarFieldOptions): FieldStar[] {
  if (width <= 0 || height <= 0) return [];

  const cell = CELL_AREA * scale * scale;
  const target = Math.max(1, Math.round((width * height) / cell));
  const aspect = width / height;
  const cols = Math.max(1, Math.round(Math.sqrt(target * aspect)));
  const rows = Math.max(1, Math.round(target / cols));
  const cw = width / cols;
  const ch = height / rows;

  const rand = prng(seed);
  const stars: FieldStar[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      // Drawn unconditionally so the skip does not shift the sequence for
      // every star after it: the field has to be stable across sizes.
      const keep = rand();
      const jx = rand();
      const jy = rand();
      const bright = Math.pow(rand(), FAINT_BIAS);
      const u = rand() * 2 - 1;
      if (keep < SKIP) continue;

      stars.push({
        x: (col + jx) * cw,
        y: (row + jy) * ch,
        r: (RADIUS_MIN + bright * (RADIUS_MAX - RADIUS_MIN)) * scale,
        a: ALPHA_MIN + bright * (ALPHA_MAX - ALPHA_MIN),
        color: starTint(Math.sign(u) * Math.pow(Math.abs(u), TINT_BIAS)),
      });
    }
  }

  return stars;
}
