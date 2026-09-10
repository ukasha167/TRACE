import { Skia } from "@shopify/react-native-skia";

/**
 * THE MOON, LIT PER PIXEL.
 *
 * WHAT THIS REPLACES. The glyph was a photograph clipped by a two-arc path: a
 * circular limb joined to a semi-elliptical terminator, with two blurred copies
 * of that same path underneath standing in for glow. That is a cutout. It
 * cannot read as a sphere, because nothing in it knows the surface has a third
 * dimension, and the "gradient" across the lit side was one flat exposure with
 * a 1.5px blur smeared along the terminator.
 *
 * This shades the sphere instead. Every pixel gets a surface normal, a real
 * photometric function and a glow term, all continuous, so there is no band
 * anywhere: not across the terminator, not along the limb, not in the halo.
 *
 * THE TERMINATOR IS THE SAME CURVE IT ALWAYS WAS, which is the thing to check
 * before trusting any of this. See `lib/astronomy/moonLighting.ts` for the
 * derivation; the short version is that a sphere lit from L has its terminator
 * project to an ellipse of semi-axis |cos g| = |2f - 1|, which is exactly `b`
 * in `litMoonPath`. The two agree by derivation, and a test holds them to it.
 *
 * PHOTOMETRY. The Moon is not Lambertian, and rendering it that way is the
 * commonest way to produce a fake-looking moon: a Lambert sphere is brightest
 * at its centre and falls to the limb, whereas the real full Moon is flat
 * almost to its edge. This uses Lunar-Lambert, the standard model for a rough
 * backscattering regolith. Details in moonLighting.ts.
 *
 * COLOUR IS NEVER INVENTED. `uSaturation` scales each texel away from its own
 * grey. It amplifies colour already present in the albedo map and cannot
 * introduce a hue that is not there. Pointed at a greyscale map it does
 * nothing, which is the honest outcome: the mineral look has to come from a map
 * whose hues are real measurements, not from this knob.
 *
 * WHERE MEASUREMENT ENDS AND THE PRINT BEGINS. Everything above the tone curve
 * is geometry and photometry: the terminator, the two lights, the phase gain on
 * earthshine. `uContrast` and `uExposure` are the darkroom, and they are the
 * same two operations the albedo map's own grade runs in
 * scripts/build-moon-maps.mjs, under the same rule — the curve moves luminance
 * and chroma rides through untouched. Nothing is painted in, nothing moves, and
 * no phase is drawn that the numbers did not give.
 */
const SOURCE = `
uniform shader  uAlbedo;      // orthographic near-side disc, fitted to the moon square
uniform shader  uNormal;      // surface normals for the same projection, y down
uniform float2  uCenter;      // disc centre, canvas pixels
uniform float   uRadius;      // disc radius, canvas pixels
uniform float3  uSun;         // unit sun direction, disc frame, y down
uniform float   uLambert;     // L(g), the Lunar-Lambert blend
uniform float   uTexRot;      // texture rotation, radians (the pole, not the sun)
uniform float   uSaturation;  // 1 = the map's own colour
uniform float3  uWhite;       // the map's mean chromaticity, luminance-normalised
uniform float3  uTint;        // moonlight, 0-1
uniform float   uGlow;        // limb glow strength
uniform float   uHalo;        // tight limb bloom strength
uniform float   uHaloWidth;   // tight bloom falloff, in radii
uniform float   uHaloFar;     // wide bloom strength
uniform float   uHaloWide;    // wide bloom falloff, in radii
uniform float3  uEarthshine;  // earthshine at full strength
uniform float   uEarthGain;   // the Earth's own illuminated fraction, floored
uniform float   uEarthWrap;   // how far earthshine reaches past the terminator
uniform float   uContrast;    // print contrast on the albedo, 1 = the map
uniform float   uMid;         // the map's mean grey, the contrast pivot
uniform float   uExposure;    // print exposure, on luminance only
uniform float   uAA;          // limb antialiasing half-width, in radii
uniform float   uRelief;      // 0 = smooth sphere, 1 = the normal map in full

half4 main(float2 fragCoord) {
  float2 p = (fragCoord - uCenter) / uRadius;
  float  r = length(p);

  // ---- The halo, which lies BEHIND the disc ----
  //
  // The nearest limb point in this direction has normal (d.x, d.y, 0), so its
  // own illumination decides whether this direction glows. That is what keeps
  // the halo on the lit side and lets it die away around the circumference
  // instead of ringing the whole disc like a sticker's outline.
  //
  // Computed for every pixel and composited under the disc rather than being
  // an early return for r > 1. Branching at the limb left the disc's coverage
  // falling to zero across the antialiasing band while the halo only began
  // beyond it, so a dark hairline traced the whole illuminated edge — the exact
  // seam the glow exists to remove.
  // The gate samples the surface just INSIDE the limb, not the limb itself. A
  // point exactly on the limb has normal (d.x, d.y, 0), which is perpendicular
  // to the Sun at full moon, so gating on it switched the halo off completely
  // at the one phase where the entire edge is lit. Stepping in to r = 0.97 asks
  // the question that was actually meant: is there sunlit ground in this
  // direction?
  float2 d = p / max(r, 1e-6);
  float2 pq = d * 0.97;
  float zq = sqrt(max(0.0, 1.0 - dot(pq, pq)));
  float litLimb = dot(float3(pq, zq), uSun);
  float around = smoothstep(0.0, 0.22, litLimb);
  //
  // TWO TERMS, because one is a fog. A single wide exponential at a strength
  // that reads on a black ground puts a milky cloud around the disc and flattens
  // everything inside it. Real bloom is a bright core at the edge plus a faint
  // wide skirt, so this is a tight bright one hugging the limb and a much
  // fainter wide one carrying the light into the plate.
  float dr = max(r - 1.0, 0.0);
  float outward = exp(-dr / max(uHaloWidth, 1e-4));
  float wide    = exp(-dr / max(uHaloWide, 1e-4));
  float haloA = around * (uHalo * outward + uHaloFar * wide);

  // Disc coverage, antialiased across one DEVICE pixel either side.
  //
  // This was 1.5/uRadius, and uRadius is in points, so on a 3x screen the band
  // was four and a half device pixels wide. That matters more than it sounds:
  // at 99.9% illumination the genuinely unlit crescent is about a pixel across,
  // and smearing the coverage over four pixels turned it into a visible dark
  // arc down one whole limb. The feature was real; its width was not.
  float cov = 1.0 - smoothstep(1.0 - uAA, 1.0 + uAA, r);

  if (cov <= 0.0) {
    return half4(half3(uTint * haloA), half(haloA));
  }

  // ---- On the disc ----
  float z = sqrt(max(0.0, 1.0 - min(r, 1.0) * min(r, 1.0)));
  float3 nGeo = float3(p, z);           // the smooth sphere, unit by construction

  // Albedo and normals are sampled through the pole rotation. The surface turns
  // with the Moon's north pole; the light does not turn with it. Keeping those
  // two apart is decision 18, and it is why this rotates the sample coordinate
  // rather than the shader's whole frame.
  float cs = cos(-uTexRot);
  float sn = sin(-uTexRot);
  float2 pt = float2(p.x * cs - p.y * sn, p.x * sn + p.y * cs);
  half4 tex = uAlbedo.eval(uCenter + pt * uRadius);

  // The normal map stores the FULL normal, sphere and relief together, so its
  // in-plane part has to be rotated forward by the same angle the lookup was
  // rotated back by. That also makes the flat case exact for free: rotating a
  // sphere normal about the view axis lands on the sphere normal for the
  // rotated position, so a relief-free map reproduces nGeo precisely.
  half4 nTex = uNormal.eval(uCenter + pt * uRadius);
  float3 nRaw = float3(nTex.rgb) * 2.0 - 1.0;
  float fc = cos(uTexRot);
  float fs = sin(uTexRot);
  float3 nMap = float3(nRaw.x * fc - nRaw.y * fs, nRaw.x * fs + nRaw.y * fc, nRaw.z);

  // RELIEF FADES OUT TOWARD THE LIMB, and this is honesty rather than tidying.
  //
  // An orthographic projection compresses without limit as r approaches 1: the
  // last few pixels of the disc average hundreds of kilometres of terrain, so
  // the normal stored there is not the normal of anything. Applied at full
  // strength it tipped limb pixels past the terminator condition and scattered
  // black speckle right around the edge.
  //
  // Nothing is lost by dropping it. The relief worth seeing is at the
  // TERMINATOR, which sweeps across the middle of the disc, and that is exactly
  // where grazing light makes it strongest.
  float reliefAmt = uRelief * smoothstep(1.0, 0.82, r);
  float3 n = normalize(mix(nGeo, nMap, reliefAmt));

  // INCIDENCE USES THE RELIEF NORMAL, EMISSION USES THE SPHERE.
  //
  // Emission from the perturbed normal would let a steep crater wall near the
  // limb turn away from the viewer and drop out of the disc entirely. Incidence
  // is where the payoff is anyway: near the terminator mu0 approaches zero, so
  // a couple of degrees of slope swings the brightness enormously, which is
  // exactly why the photographs people love are all taken near a quarter. At
  // full moon the Sun sits behind the observer and mu0 tends back to mu, so the
  // relief quietly fades out on its own, the way the real full Moon does.
  float mu0 = dot(n, uSun);             // incidence cosine, with relief
  float mu  = z;                        // emission cosine, orthographic view

  // WHITE BALANCE BEFORE SATURATING, or the wrong thing gets amplified.
  //
  // The map has a mild global warm cast. Saturating around each texel's own
  // grey amplifies that cast along with everything else, and at 5x it swamps
  // the differences between maria: the disc goes uniformly sepia and the
  // mineral signal disappears under it. Dividing by the map's mean chromaticity
  // first makes the average texel neutral, so what gets amplified afterwards is
  // each region's departure from the Moon's own average colour, which is
  // precisely the titanium and iron signal worth showing.
  //
  // uWhite is luminance-normalised, so this moves hue and leaves exposure alone.
  float3 albedo = float3(tex.rgb) / uWhite;
  float grey = dot(albedo, float3(0.2126, 0.7152, 0.0722));
  albedo = mix(float3(grey), albedo, uSaturation);

  // PRINT CONTRAST, pivoted on the map's own mean grey so the exposure does not
  // shift with it. The bundled map is deliberately flat — the build script lifts
  // the maria off the floor so the disc does not resolve into a face at hero
  // size — and flat is the right place to grade FROM, not the right place to
  // stop. Pivoting rather than scaling is what keeps this a contrast change and
  // not a brightness change.
  albedo = max(mix(float3(uMid), albedo, uContrast), 0.0);
  albedo *= uTint;

  // ---- Lunar-Lambert ----
  float lit = max(mu0, 0.0);
  float denom = max(lit + mu, 1e-4);
  float shade = 2.0 * uLambert * lit / denom + (1.0 - uLambert) * lit;

  // Lommel-Seeliger tends to 2L as the emission angle goes to zero, so the
  // sunward limb runs away to nearly twice the full-moon brightness. That is
  // the model's known singularity at grazing emission and not something the
  // Moon does; Hapke's fuller treatment rolls it off. Capping keeps the limb
  // bright without printing a white wire along it. Full moon sits at 1.0, well
  // under the cap, so the flat disc is untouched.
  shade = min(shade, 1.35);

  float3 col = albedo * shade;

  // ---- Earthshine, which is a LIGHT and not a mask ----
  //
  // This was smoothstep(0.06, -0.06, mu0) times a flat colour: a gate 0.12
  // wide in the incidence cosine, switched on at the terminator and constant
  // across the whole night side. It put a dark line down the terminator,
  // because neither light covered the crossing, and it made the dark half a
  // coin, because a constant has no gradient. Both are measured in
  // lib/astronomy/moonLighting.ts, which owns this geometry.
  //
  // The Earth sits opposite the Sun in the Moon's sky, so a wrapped diffuse
  // term from -uSun is the shape. The wrap reaches onto the sunlit side, so the
  // two lights overlap instead of meeting, and there is no gate left to
  // disagree with the surface it controls.
  float muE = -mu0;
  float wrapped = max((muE + uEarthWrap) / (1.0 + uEarthWrap), 0.0);
  float earth = wrapped * wrapped * (0.35 + 0.65 * mu);
  col += uEarthshine * uEarthGain * earth * (0.55 + 0.45 * grey);

  // ---- Limb glow, illuminated edge only ----
  //
  // rim rises toward the edge: 1 - mu is 0 dead centre and 1 at the limb.
  //
  // It is gated on shade, the brightness actually leaving the surface, and not
  // on the raw incidence mu0. Under Lommel-Seeliger a full moon stays bright to
  // its very edge even though the incidence there is grazing, so gating on mu0
  // lit every part of the disc except the limb of a full moon, which is the one
  // place the glow was wanted. Following shade means the glow can only be where
  // light is, and it dies away with the terminator on its own.
  float rim = pow(1.0 - mu, 3.0);
  float glow = uGlow * rim * smoothstep(0.0, 0.25, shade);
  col += uTint * glow;

  // ---- Exposure ----
  //
  // Reflectance is not a print. Every photograph of the Moon is exposed for the
  // sunlit side, which is why the reference images look like daylight on rock
  // and an unexposed render looks like grey felt.
  //
  // ON LUMINANCE ONLY, and this is the part that matters. Running the curve per
  // channel drives all three toward 1 together, so exactly the highlands that
  // carry the strongest mineral colour come out white, and the shoulder eats
  // the signal the saturation exists to show. Grading luma and scaling RGB by the
  // ratio moves exposure and leaves hue and relative chroma alone, which is the
  // same rule the map's own tone curve follows in scripts/build-moon-maps.mjs.
  float lum = dot(col, float3(0.2126, 0.7152, 0.0722));
  float toned = 1.0 - exp(-uExposure * lum);
  col = min(col * (toned / max(lum, 1e-4)), 1.0);

  // Source-over: the disc, premultiplied, on top of the halo.
  float3 outCol = col * cov + uTint * haloA * (1.0 - cov);
  float outA = cov + haloA * (1.0 - cov);
  return half4(half3(outCol), half(outA));
}
`;

/**
 * Null if the SkSL will not compile.
 *
 * Not a throw: a moon that renders flat is a bad moon, and a moon that takes
 * the app down with it on a device whose driver rejects something is worse. The
 * glyph falls back to the unlit albedo disc, which is ugly and obvious, which
 * is what a fallback should be.
 */
export const moonEffect = Skia.RuntimeEffect.Make(SOURCE);

/**
 * How far each texel is pushed from its own grey.
 *
 * This is the mineral moon, and it is allowed to exist now because the albedo
 * map is real LROC WAC colour rather than the monochrome map that shipped
 * before. The hues it amplifies are measurements: titanium shifts a mare from
 * red toward blue, which is why Mare Tranquillitatis comes out cooler than Mare
 * Serenitatis. Measured on the bundled map, B/R 0.967 against 0.895.
 *
 * The Moon's real colour is faint — mean saturation 0.057 — so seeing it takes
 * amplification, exactly as it does in the astrophotographs this is modelled on.
 * The operation can only scale a texel away from its own grey, so it cannot
 * invent a hue that is not there. Point it at a greyscale map and it does
 * nothing at all.
 *
 * Raising it does not make the app claim anything it could not measure. Setting
 * it while feeding the shader a colourised greyscale would, and that is the
 * line.
 *
 * Was 5. The moon now prints on black rather than on Prussian blue, and a
 * ground that dark takes a fifth or so of the apparent saturation out of
 * everything on it.
 */
export const MINERAL_SATURATION = 9.0;

/**
 * Print contrast on the albedo, pivoted on ALBEDO_MID. 1 is the map as bundled.
 *
 * The map is graded flat on purpose: `build-moon-maps.mjs` lifts the maria off
 * the floor so a hero-sized disc under someone's name does not resolve into a
 * face. That grade is still the input here. This opens the maria and highlands
 * back up by half again, which is what separates Tranquillitatis from
 * Serenitatis at a glance, and stops well short of the range the raw map has.
 */
export const PRINT_CONTRAST = 1.5;

/**
 * The albedo map's mean grey over the disc, after white balance. The pivot the
 * contrast turns around, so grading does not also change exposure.
 *
 * Measured on `assets/moon_disc.png`: 0.6227 over r < 0.99, against a range of
 * 0.375 to 0.935. Rebuild the map and this must be remeasured.
 */
export const ALBEDO_MID = 0.6227;

/**
 * PRINT EXPOSURE LIVES IN `lib/astronomy/moonLighting.ts` NOW, next to
 * `earthshineGain`, and that move is the whole content of decision 27.
 *
 * The two are coupled: one opens up as the moon thins and the other brightens
 * as the moon thins, so what they multiply out to at a thin crescent is a
 * quantity neither of them owns. They were in separate files with separate
 * entries in DECISIONS.md, neither entry mentioned the other, and a 2% moon
 * shipped printing its night side at a third of the brightness of its own
 * crescent. Two invariants hold them together now, and a test cannot reach a
 * file that imports Skia.
 *
 * The rest of the darkroom is still here, because the rest of it is not coupled
 * to anything.

/**
 * The bundled albedo map's mean chromaticity, normalised to luminance 1.
 *
 * Measured over the disc of `assets/moon_disc.png`: mean RGB 160.9, 158.8,
 * 152.1 against a mean luma of 158.8. Rebuild the map and this must be
 * remeasured, or the white balance is correcting a cast that is no longer there.
 */
export const ALBEDO_WHITE: [number, number, number] = [1.0134, 1.0003, 0.9578];

/**
 * How much of the LOLA relief to apply, 0 smooth sphere, 1 the map in full.
 * Runtime rather than baked so the strength can be judged on a screen instead
 * of by rebuilding the asset.
 */
export const RELIEF_STRENGTH = 1.0;

/** Hex from theme.ts to the 0-1 triple SkSL wants. */
export function unitRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}
