import { Skia, type SkRuntimeEffect, type SkShader } from "@shopify/react-native-skia";

/**
 * THE MILKY WAY.
 *
 * One pass over the screen. For each pixel the shader rebuilds the ray the
 * camera sees through it, the same ray the stars are projected along, turns it
 * back into J2000 right ascension and declination, and reads NASA's map of the
 * Milky Way there (scripts/build-milky-way.mjs). Nothing about it is a picture
 * pasted on the sky: it turns with the sky through the scrubber, it bends
 * across the screen exactly as the projection bends the constellations, and it
 * magnifies with the zoom like everything else in the view.
 *
 * ZOOM DOES NOT CHANGE ITS BRIGHTNESS, and that is the physics rather than an
 * omission. The band is an extended source, and an extended source's surface
 * brightness is the same at any magnification: zooming in spreads the same
 * light per square degree over more screen, so the band grows and its
 * structure (the dark rift, the Sagittarius clouds) opens up, but a patch of
 * it is no brighter. Stars are points and do brighten with aperture, which is
 * why the star limit deepens as the view narrows and the band does not.
 *
 * WHAT HIDES IT, per pixel:
 *   - the air: extinction over the line of sight, so the band thins toward
 *     the horizon (lib/astronomy/skyLight.ts, K&S airmass);
 *   - the moon: Krisciunas and Schaefer's model of moonlight scattered by the
 *     air, so a full moon washes the band out, most of all near the moon;
 *   - twilight and the eye's adaptation, applied as one exposure per frame.
 *
 * THE NIGHT SKY ITSELF IS BLACK. The same model used to light the sky round a
 * bright moon toward a dark blue, which is what a moonlit sky is, and on a
 * phone it read as a grey-blue screen with the stars on it. The moonlight
 * still takes the band's contrast away; it no longer paints the ground. The
 * map's own floor, the light of the faint stars that is everywhere, is taken
 * off as a black point for the same reason (DECISIONS 64).
 *
 * THE BAND IS IN COLOUR: Gaia's measured light, white-balanced on the band
 * and saturated by uSaturation, which is a print decision like the star tint
 * (scripts/build-milky-way.mjs).
 *
 * Output is light, to be ADDED to the sky ground (BlendMode.Plus). Radiance is
 * linear in the map and converted to display values here, so the band's
 * contrast against the sky is the measured one.
 */
const SOURCE = `
uniform shader uMap;        // milkyway.png, RGB, plate carree RA/Dec
uniform float2 uSize;       // screen, canvas units
uniform float  uFocal;      // camera focal length, canvas units
uniform float3 uF;          // sky camera forward, sphere frame
uniform float3 uR;          // right
uniform float3 uU;          // up
uniform float3 uZenith;     // the zenith, sphere frame
uniform float3 uEq0;        // sphere frame to J2000, rows
uniform float3 uEq1;
uniform float3 uEq2;
uniform float2 uMapSize;    // map pixels
uniform float  uGamma;      // the map's encoding power
uniform float  uExposure;   // linear display value at the map's reference radiance
uniform float  uFloor;      // the radiance drawn as black, relative to the map's reference
uniform float  uSaturation; // chroma gain about each pixel's luminance
uniform float3 uMoonDir;    // sphere frame
uniform float  uMoonTerm;   // moon intensity x its own extinction; 0 with the moon down
uniform float  uK;          // extinction, magnitudes per airmass
uniform float  uDarkNl;     // natural sky at the zenith, nL
uniform float  uBelow;      // how strongly the sky under the horizon is drawn

const float LN10 = 2.302585093;

half4 main(float2 p) {
  float3 d = normalize(uF * uFocal + uR * (p.x - uSize.x * 0.5) - uU * (p.y - uSize.y * 0.5));
  float cz = dot(d, uZenith);
  float below = step(cz, 0.0);
  float czc = max(cz, 0.0);
  float X = 1.0 / sqrt(1.0 - 0.96 * (1.0 - czc * czc));

  // The map, read at this ray's right ascension and declination.
  float3 e = float3(dot(uEq0, d), dot(uEq1, d), dot(uEq2, d));
  float ra = atan(e.y, e.x);
  float dec = asin(clamp(e.z, -1.0, 1.0));
  float u = fract(0.5 - ra / 6.283185307);
  float v = clamp(0.5 - dec / 3.141592654, 0.0, 1.0);
  float3 g = uMap.eval(float2(u * uMapSize.x, clamp(v * uMapSize.y, 0.5, uMapSize.y - 0.5))).rgb;
  float3 rgb = pow(g, float3(uGamma));
  float lum = dot(rgb, float3(0.2126, 0.7152, 0.0722));
  float3 radiance = max(lum + (rgb - lum) * uSaturation, 0.0) * (max(lum - uFloor, 0.0) / max(lum, 1e-6));

  // The air between: extinction, and the natural sky's own glow behind.
  float ext = exp(-0.4 * LN10 * uK * (X - 1.0));
  float dark = uDarkNl * ext * X;

  // Moonlight scattered toward the eye (Krisciunas and Schaefer 1991).
  float c = clamp(dot(d, uMoonDir), -1.0, 1.0);
  float rho = degrees(acos(c));
  float f = 229086.77 * (1.06 + c * c) + exp(LN10 * (6.15 - rho / 40.0));
  float moonNl = f * uMoonTerm * (1.0 - exp(-0.4 * LN10 * uK * X));
  float contrast = dark / (dark + moonNl);

  float seen = mix(ext * contrast, uBelow, below);
  float3 lin = radiance * (uExposure * seen);
  float3 col = pow(max(lin, 0.0), float3(1.0 / 2.2));

  // Dither by half an 8-bit step. The band's faint outskirts sit a few levels
  // above black, and magnified, the steps between those levels drew as
  // contour rings across the screen.
  float n = fract(sin(dot(p, float2(12.9898, 78.233))) * 43758.5453) - 0.5;
  col += step(0.0005, col.g) * n / 255.0;
  return half4(half3(max(col, 0.0)), 1.0);
}
`;

export const skyEffect: SkRuntimeEffect | null = Skia.RuntimeEffect.Make(SOURCE);

export interface UniformShader {
  /** Writes one to three floats at a uniform, by its name in the source. */
  set(name: string, x: number, y?: number, z?: number): void;
  /** The shader for the values as they stand, made again only if one has changed. */
  shader(): SkShader;
}

/**
 * One runtime effect's shader, kept between frames.
 *
 * react-native-skia 2.6 reports every SkShader made from JS to Hermes as a
 * megabyte of native memory (JsiSkShader.h), whatever it really holds, so one
 * shader a frame tells the garbage collector of 120 MB a second at 120 Hz
 * (DECISIONS 65). Here the values are written in place into one array, by each
 * uniform's own slot, and the shader is made again only when one of them has
 * changed. A shader's uniforms cannot be changed once it is made, so a moving
 * camera still costs one a frame; a still camera, a fading figure or a
 * finished entrance costs none.
 */
export function uniformShader(effect: SkRuntimeEffect, children: SkShader[]): UniformShader {
  const slots = new Map<string, number>();
  for (let i = 0; i < effect.getUniformCount(); i++) slots.set(effect.getUniformName(i), effect.getUniform(i).slot);
  const values = new Array<number>(effect.getUniformFloatCount()).fill(0);
  // A uniform never written would draw as zero, silently. The first shader() refuses instead.
  const unset = new Set(slots.keys());
  let made: SkShader | null = null;
  const put = (slot: number, v: number) => {
    if (values[slot] !== v) {
      values[slot] = v;
      made = null;
    }
  };
  return {
    set(name, x, y, z) {
      const slot = slots.get(name);
      if (slot === undefined) throw new Error(`sky shader: no uniform ${name}`);
      unset.delete(name);
      put(slot, x);
      if (y !== undefined) put(slot + 1, y);
      if (z !== undefined) put(slot + 2, z);
    },
    shader() {
      if (made) return made;
      if (unset.size > 0) throw new Error(`sky shader: no value for ${[...unset].join(", ")}`);
      made = effect.makeShaderWithChildren(values, children);
      return made;
    },
  };
}

/** The band at its brightest, as a display value, before anything hides it. A print decision. */
export const MILKY_WAY_PEAK = 0.3;

/** How much of the band's measured colour is drawn, as chroma gain. A print decision, like the star tint. */
export const MILKY_WAY_SATURATION = 2;
