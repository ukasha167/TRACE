import { Skia, type SkRuntimeEffect } from "@shopify/react-native-skia";

/**
 * THE GROUND, AS STELLARIUM DRAWS IT.
 *
 * Stellarium's default landscape, the field at Guéreins, baked into one
 * azimuth and altitude panorama (scripts/build-landscape.mjs). For each pixel
 * the shader rebuilds the ray through the ground camera, the one the scrubber
 * does not turn, and reads the panorama at that ray's azimuth and altitude. So
 * the field and the trees sit still while the sky turns over them, bend with
 * the projection the way the horizon does, and hide whatever is behind them,
 * the stars low over the treeline included.
 *
 * It is a picture of a place, and not of the record's place. Nothing about it
 * is a claim: the true horizon is still the line the view draws at 0 degrees,
 * and the trees and the field's edge stand a few degrees above it, as they do
 * in Stellarium.
 *
 * LIGHT. The photograph was taken by day; uLight scales it down with the sun
 * and up a little with the moon (skyView.landscapeLight). In the dark the eye
 * sees with the rods, so its colour goes with the light, toward grey, which is
 * also why the field reads as a dark plain at night and not as a green one.
 *
 * Output is premultiplied, drawn over the sky with the default blend. The
 * ground's opacity (skyView.groundOpacity) is the paint's alpha and not a
 * uniform, so the entrance's fade and a tilt's dissolve do not need a new
 * shader (skyShader.uniformShader).
 */
const SOURCE = `
uniform shader uMap;        // landscape.png, RGBA, azimuth across, altitude down
uniform float2 uSize;       // screen, canvas units
uniform float  uFocal;      // camera focal length, canvas units
uniform float3 uF;          // ground camera forward, horizon frame (x east, y north, z up)
uniform float3 uR;          // right
uniform float3 uU;          // up
uniform float2 uMapSize;    // panorama pixels
uniform float  uTop;        // altitude of the panorama's first row, degrees
uniform float  uPxPerDeg;   // panorama rows per degree of altitude
uniform float  uLight;      // how lit the field is, 0-1
uniform float3 uSky;        // the sky's colour at the horizon, 0-1, for the haze

half4 main(float2 p) {
  float3 d = normalize(uF * uFocal + uR * (p.x - uSize.x * 0.5) - uU * (p.y - uSize.y * 0.5));
  float alt = degrees(asin(clamp(d.z, -1.0, 1.0)));
  if (alt > uTop) return half4(0.0);
  float az = degrees(atan(d.x, d.y));
  float u = fract(az / 360.0) * uMapSize.x;
  float v = clamp((uTop - alt) * uPxPerDeg, 0.5, uMapSize.y - 0.5);
  half4 c = uMap.eval(float2(u, v));

  float3 rgb = float3(c.rgb) * uLight;
  float grey = dot(rgb, float3(0.2126, 0.7152, 0.0722));
  rgb = mix(float3(grey), rgb, smoothstep(0.08, 0.6, uLight));
  // The air between you and the field's far edge, as Stellarium's fog band.
  float haze = 0.35 * exp(-abs(alt - 1.0) / 3.0);
  rgb = mix(rgb, uSky * float(c.a), haze);
  return half4(half3(rgb), c.a);
}
`;

export const landscapeEffect: SkRuntimeEffect | null = Skia.RuntimeEffect.Make(SOURCE);
