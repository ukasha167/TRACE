import { Skia, type SkRuntimeEffect } from "@shopify/react-native-skia";

/**
 * THE MILKY WAY, AND THE SKY THE MOON LIGHTS.
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
 *     air, so a full moon washes the band out, most of all near the moon, and
 *     lights the sky itself a dark blue around it;
 *   - twilight and the eye's adaptation, applied as one exposure per frame.
 *
 * Output is light, to be ADDED to the sky ground (BlendMode.Plus). Radiance is
 * linear in the map and converted to display values here, so the band's
 * contrast against the sky is the measured one.
 */
const SOURCE = `
uniform shader uMap;        // milkyway.png, greyscale, plate carree RA/Dec
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
uniform float3 uTint;       // the band's grey, 0-1
uniform float3 uMoonDir;    // sphere frame
uniform float  uMoonTerm;   // moon intensity x its own extinction; 0 with the moon down
uniform float  uK;          // extinction, magnitudes per airmass
uniform float  uDarkNl;     // natural sky at the zenith, nL
uniform float3 uGlow;       // the moonlit sky's colour at full strength
uniform float  uGlowOn;     // how much of the night is the moon's to light, 0-1
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
  float g = uMap.eval(float2(u * uMapSize.x, clamp(v * uMapSize.y, 0.5, uMapSize.y - 0.5))).r;
  float radiance = pow(g, uGamma);

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
  float lin = radiance * uExposure * seen;
  float3 band = uTint * pow(max(lin, 0.0), 1.0 / 2.2);

  float lit = clamp(log(1.0 + moonNl / dark) / LN10 / 2.0, 0.0, 1.25) * uGlowOn * (1.0 - below);
  // Dither by half an 8-bit step. The band's faint outskirts sit a few levels
  // above black, and magnified, the steps between those levels drew as
  // contour rings across the screen.
  float n = fract(sin(dot(p, float2(12.9898, 78.233))) * 43758.5453) - 0.5;
  float3 col = band + uGlow * lit;
  col += step(0.0005, col.g) * n / 255.0;
  return half4(half3(max(col, 0.0)), 1.0);
}
`;

export const skyEffect: SkRuntimeEffect | null = Skia.RuntimeEffect.Make(SOURCE);

// The layout never changes, and reading it per frame was about 65 native calls.
const LAYOUT = skyEffect
  ? Array.from({ length: skyEffect.getUniformCount() }, (_, i) => ({
      name: skyEffect.getUniformName(i),
      slot: skyEffect.getUniform(i).slot,
    }))
  : [];
const FLOATS = skyEffect?.getUniformFloatCount() ?? 0;

/**
 * Packs named uniforms into the flat array Skia wants, by each uniform's own
 * slot rather than by assuming a layout.
 */
export function packUniforms(values: Record<string, number | readonly number[]>): number[] {
  const out = new Array<number>(FLOATS).fill(0);
  for (const { name, slot } of LAYOUT) {
    const v = values[name];
    if (v == null) throw new Error(`sky shader: no value for ${name}`);
    if (typeof v === "number") out[slot] = v;
    else for (let k = 0; k < v.length; k++) out[slot + k] = v[k];
  }
  return out;
}

/** The band at its brightest, as a display value, before anything hides it. A print decision. */
export const MILKY_WAY_PEAK = 0.24;
