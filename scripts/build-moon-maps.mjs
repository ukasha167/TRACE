/**
 * Builds the two lunar maps the shader samples, from one projection pass:
 *
 *   assets/moon_disc.png    graded albedo, RGB, opaque to the corners
 *   assets/moon_normal.png  surface normals for the same projection
 *
 * SOURCES, both NASA public domain, both verified rather than trusted:
 *
 *   sources/lroc_color_8k.jpg  LROC WAC colour, 8192x4096 equirectangular.
 *     Adapted by NASA SVS from the Hapke-normalised WAC mosaic: red is the
 *     643 nm band, green and blue are linear combinations of 566 and 415 nm.
 *     The hues are measurements, which is the only reason the shader is allowed
 *     to amplify them.
 *
 *   sources/ldem_8k.jpg        LOLA LDEM, 8192x4096 equirectangular, 8-bit.
 *
 * PROVENANCE WAS CHECKED BY MEASUREMENT, not by where the file came from. Two
 * facts about the Moon that a colourised greyscale or a decorative height field
 * could not reproduce:
 *
 *   - Mare Tranquillitatis is bluer than Mare Serenitatis. Measured B/R 0.967
 *     against 0.895. That difference is ilmenite: titanium shifts the mare from
 *     red toward blue, and it is the entire basis of the "mineral moon" look.
 *   - The far side sits higher than the near side, mean level 135.8 against
 *     114.0, and South Pole-Aitken is the lowest point sampled at 49.1.
 *
 * If either check fails after changing a source, the source is wrong.
 *
 * Usage:
 *   node scripts/build-moon-maps.mjs [grade]
 *   node scripts/build-moon-maps.mjs --list
 *
 * OUTPUT RESOLUTION, derived rather than chosen. The largest the moon is ever
 * drawn is the hero on the record screen: min(width * 0.62, 320) points, which
 * on a 440pt-wide phone is 273pt, and at 3x that is 819 device pixels. The Story
 * export card draws it at 397. 1024 covers both without upscaling; the old asset
 * was 397 and was being stretched 2.4x on screen, which is most of why the
 * surface looked soft.
 *
 * THE GRADE. The map measured straight is harsh: on the near side its luminance
 * runs p1 66 to p99 200 with the median at 151, so the maria sit far below the
 * highlands and at hero size that spread resolves into a face. The app prints
 * this disc under someone's name on their birthday.
 *
 * So geometry stays a measurement and exposure becomes a print. Every stage is a
 * darkroom operation: nothing moves, nothing is painted in, no crater is
 * removed.
 *
 *   soften   Blends a small blur back over the original, killing the pockmark
 *            micro-contrast while leaving every nameable feature.
 *   floor    Output black point. The lever that matters: lifting the maria off
 *            the floor is what stops the disc reading as a face.
 *   ceiling  Output white point.
 *   gamma    Midtone shape, before the floor/ceiling remap.
 *
 * THE TONE CURVE RUNS ON LUMINANCE, AND CHROMA IS CARRIED THROUGH UNTOUCHED.
 * Remapping R, G and B independently pulls all three toward the same output
 * range, which quietly desaturates exactly the colour differences this whole
 * exercise exists to show. Instead luma is graded and RGB is scaled by the ratio,
 * so hue and relative chroma survive the print unchanged.
 *
 * There is no `warmth` stage any more. The shader already multiplies by
 * Colors.moonlight, and warming the map as well tinted real mineral colour.
 */
import fs from "node:fs";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";

const GRADES = {
  /** The map as measured. Kept so the print is always A/B-able against it. */
  photograph: { soften: 0, radius: 0, floor: 36, ceiling: 255, gamma: 1 },
  gentle: { soften: 0.06, radius: 2, floor: 96, ceiling: 238, gamma: 0.95 },
  pearl: { soften: 0.35, radius: 3, floor: 128, ceiling: 246, gamma: 0.85 },
};

/** Measured p1/p99 of the near side. The tone curve's input range. */
const IN_LOW = 66;
const IN_HIGH = 200;

/**
 * LOLA elevation, 8-bit. The endpoints are the LDEM's own range, so a level
 * step is about 78 metres.
 *
 * Only the GRADIENT is used, and it is scaled by `relief` besides, so this
 * calibration decides what relief = 1 means rather than anything about the
 * terminator or the disc's shape.
 */
const ELEV_MIN_M = -9150;
const ELEV_MAX_M = 10760;
const MOON_RADIUS_M = 1737400;

/**
 * How far the finite difference reaches, in metres across the surface.
 *
 * Deliberately wider than one source texel. The height map is 8-bit, so slope
 * computed between adjacent texels quantises into visible terraces; sampling
 * across about three texels averages that away without blunting crater walls,
 * which are kilometres across.
 */
const SLOPE_BASELINE_M = 4000;

/**
 * Vertical exaggeration of the relief.
 *
 * 1 is true scale. True scale is subtle across a whole disc, because the Moon's
 * relief is 20 km on a 1737 km radius, but it is NOT subtle near the terminator:
 * grazing light is what makes a crater wall read, and the photometric term is at
 * its most sensitive exactly there. That is why the reference photographs people
 * love are all taken near a quarter. That same sensitivity is why exaggerating
 * it backfires.
 *
 * This shapes shading only. The disc's outline and the terminator's position
 * come from the sphere and are untouched by it.
 *
 * WAS 1.6, AND THE EXAGGERATION WAS DOING VISIBLE DAMAGE. Slope near the
 * terminator is exactly where the photometric term is most sensitive, so 1.6x
 * true scale threw the lit boundary well off the terminator ellipse: crater
 * walls caught light far into the night side and floors punched black bites out
 * of the lit side, and the phase stopped reading as a curve. It also amplified
 * TEXTURE SAMPLING NOISE by the same factor, which is why one record rendered a
 * visibly different shape on iOS and on Android. The two devices sample this map
 * on different pixel grids, and at 1.6x that difference showed. True scale keeps
 * the drama, because the drama at a quarter comes from grazing LIGHT rather than
 * from tall terrain.
 */
const RELIEF = Number(process.env.RELIEF ?? 1.0);

const OUT_SIZE = Number(process.env.OUT_SIZE ?? 1024);
/**
 * Normals survive downsampling better than albedo does, and compress worse.
 *
 * Was 512, which was the largest single source of softness in the render. The
 * hero draws the disc at up to 894 device pixels (a Pixel 7 Pro at 3.5x), so a
 * 512 map was upscaled 1.75x and every crater rim arrived through a linear
 * filter. Crater SHADING is most of what the eye reads as sharpness on a moon,
 * more than albedo detail is, so this matters more than the disc's own
 * resolution does. It also halves the sampling noise the relief amplifies.
 */
const NORMAL_SIZE = Number(process.env.NORMAL_SIZE ?? 1024);

if (process.argv.includes("--list")) {
  console.log(Object.keys(GRADES).join("\n"));
  process.exit(0);
}

const gradeName = process.argv[2] || "gentle";
const grade = { ...GRADES[gradeName] };
if (process.env.SOFTEN !== undefined) grade.soften = Number(process.env.SOFTEN);
if (process.env.RADIUS !== undefined) grade.radius = Number(process.env.RADIUS);
if (!grade) {
  console.error(`Unknown grade "${gradeName}". Known: ${Object.keys(GRADES).join(", ")}`);
  process.exit(1);
}

const COLOR_PATH = "sources/lroc_color_8k.jpg";
const ELEV_PATH = "sources/ldem_8k.jpg";
for (const p of [COLOR_PATH, ELEV_PATH]) {
  if (!fs.existsSync(p)) {
    console.error(`Missing ${p}. See the header for what it is and where from.`);
    process.exit(1);
  }
}

console.log(`Reading ${COLOR_PATH}...`);
const colorImg = jpeg.decode(fs.readFileSync(COLOR_PATH), {
  useTArray: true,
  maxMemoryUsageInMB: 2048,
});
console.log(`Reading ${ELEV_PATH}...`);
const elevImg = jpeg.decode(fs.readFileSync(ELEV_PATH), {
  useTArray: true,
  maxMemoryUsageInMB: 2048,
});
console.log(
  `colour ${colorImg.width}x${colorImg.height}, elevation ${elevImg.width}x${elevImg.height}`
);

// ---- equirectangular sampling ----
//
// u = 0.5 + lon / 2pi puts lon 0 (the sub-Earth point) at the image centre.
// v = 0.5 - lat / pi puts north at the top.
function sampleColor(u, v) {
  const W = colorImg.width, H = colorImg.height, d = colorImg.data;
  const sx = Math.min(Math.max(u * W, 0), W - 1);
  const sy = Math.min(Math.max(v * H, 0), H - 1);
  const x0 = Math.floor(sx), y0 = Math.floor(sy);
  const x1 = Math.min(x0 + 1, W - 1), y1 = Math.min(y0 + 1, H - 1);
  const fx = sx - x0, fy = sy - y0;
  const i00 = (y0 * W + x0) * 4, i10 = (y0 * W + x1) * 4;
  const i01 = (y1 * W + x0) * 4, i11 = (y1 * W + x1) * 4;
  const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy);
  const w01 = (1 - fx) * fy, w11 = fx * fy;
  return [
    w00 * d[i00] + w10 * d[i10] + w01 * d[i01] + w11 * d[i11],
    w00 * d[i00 + 1] + w10 * d[i10 + 1] + w01 * d[i01 + 1] + w11 * d[i11 + 1],
    w00 * d[i00 + 2] + w10 * d[i10 + 2] + w01 * d[i01 + 2] + w11 * d[i11 + 2],
  ];
}

/** Elevation in metres at (lat, lon) radians. Longitude wraps. */
function elevationM(latRad, lonRad) {
  const W = elevImg.width, H = elevImg.height, d = elevImg.data;
  let u = 0.5 + lonRad / (2 * Math.PI);
  u = u - Math.floor(u); // wrap
  const v = Math.min(Math.max(0.5 - latRad / Math.PI, 0), 1);
  const sx = u * W, sy = Math.min(v * H, H - 1);
  const x0 = Math.floor(sx), y0 = Math.floor(sy);
  const x1 = (x0 + 1) % W, y1 = Math.min(y0 + 1, H - 1);
  const fx = sx - x0, fy = sy - y0;
  const g = (x, y) => d[(y * W + ((x % W) + W) % W) * 4];
  const level =
    (1 - fx) * (1 - fy) * g(x0, y0) +
    fx * (1 - fy) * g(x1, y0) +
    (1 - fx) * fy * g(x0, y1) +
    fx * fy * g(x1, y1);
  return ELEV_MIN_M + (level / 255) * (ELEV_MAX_M - ELEV_MIN_M);
}

/**
 * Disc position to sphere. Beyond r = 1 the direction is clamped to the limb,
 * which extends the limb colour outward instead of leaving transparency there.
 *
 * The soft alpha edge that used to be here was a bug once the shader took over:
 * linear filtering across an alpha boundary blends RGB toward the transparent
 * neighbours, which are black, and printed a dark ring around the whole limb.
 * The shader antialiases the limb itself, from geometry it knows exactly.
 */
function discToSphere(x, yUp) {
  const r2 = x * x + yUp * yUp;
  const r = Math.sqrt(r2);
  const sx = r > 1 ? x / r : x;
  const sy = r > 1 ? yUp / r : yUp;
  const z = Math.sqrt(Math.max(0, 1 - Math.min(r2, 1)));
  return {
    lon: Math.atan2(sx, z),
    lat: Math.asin(Math.max(-1, Math.min(1, sy))),
    z,
  };
}

// ---- albedo ----
console.log(`Projecting albedo at ${OUT_SIZE}x${OUT_SIZE}...`);
const N = OUT_SIZE * OUT_SIZE;
const rgb = new Float32Array(N * 3);
const rOut = OUT_SIZE / 2;

// 3x3 supersampling. The source is 8x the output across the disc centre, so
// point sampling would alias the ray systems into sparkle.
const SS = 3;
for (let py = 0; py < OUT_SIZE; py++) {
  for (let px = 0; px < OUT_SIZE; px++) {
    let r = 0, g = 0, b = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const fx = px + (sx + 0.5) / SS;
        const fy = py + (sy + 0.5) / SS;
        const x = (fx - rOut) / rOut;
        const yUp = -(fy - rOut) / rOut;
        const s = discToSphere(x, yUp);
        const c = sampleColor(0.5 + s.lon / (2 * Math.PI), 0.5 - s.lat / Math.PI);
        r += c[0]; g += c[1]; b += c[2];
      }
    }
    const k = (py * OUT_SIZE + px) * 3;
    const n = SS * SS;
    rgb[k] = r / n; rgb[k + 1] = g / n; rgb[k + 2] = b / n;
  }
}

// ---- soften ----
if (grade.soften > 0 && grade.radius > 0) {
  console.log(`Softening ${grade.soften} at radius ${grade.radius}...`);
  const tmp = new Float32Array(rgb.length);
  const out = new Float32Array(rgb.length);
  const pass = (from, to) => {
    for (let y = 0; y < OUT_SIZE; y++) {
      for (let x = 0; x < OUT_SIZE; x++) {
        let a = 0, b2 = 0, c = 0, w = 0;
        for (let d = -grade.radius; d <= grade.radius; d++) {
          const xx = x + d;
          if (xx < 0 || xx >= OUT_SIZE) continue;
          const j = (y * OUT_SIZE + xx) * 3;
          a += from[j]; b2 += from[j + 1]; c += from[j + 2]; w++;
        }
        const i = (y * OUT_SIZE + x) * 3;
        tmp[i] = a / w; tmp[i + 1] = b2 / w; tmp[i + 2] = c / w;
      }
    }
    for (let y = 0; y < OUT_SIZE; y++) {
      for (let x = 0; x < OUT_SIZE; x++) {
        let a = 0, b2 = 0, c = 0, w = 0;
        for (let d = -grade.radius; d <= grade.radius; d++) {
          const yy = y + d;
          if (yy < 0 || yy >= OUT_SIZE) continue;
          const j = (yy * OUT_SIZE + x) * 3;
          a += tmp[j]; b2 += tmp[j + 1]; c += tmp[j + 2]; w++;
        }
        const i = (y * OUT_SIZE + x) * 3;
        to[i] = a / w; to[i + 1] = b2 / w; to[i + 2] = c / w;
      }
    }
  };
  pass(rgb, out);
  pass(out, out);
  pass(out, out);
  for (let i = 0; i < rgb.length; i++) {
    rgb[i] = rgb[i] * (1 - grade.soften) + out[i] * grade.soften;
  }
}

// ---- tone, on luminance only ----
console.log(
  `Grading "${gradeName}": in ${IN_LOW}-${IN_HIGH} -> out ${grade.floor}-${grade.ceiling}, gamma ${grade.gamma}`
);
const span = grade.ceiling - grade.floor;
const discPng = new PNG({ width: OUT_SIZE, height: OUT_SIZE });
for (let i = 0; i < N; i++) {
  const k = i * 3;
  const r = rgb[k], g = rgb[k + 1], b = rgb[k + 2];
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;

  let t = (luma - IN_LOW) / (IN_HIGH - IN_LOW);
  t = Math.max(0, Math.min(1, t));
  if (grade.gamma !== 1) t = Math.pow(t, grade.gamma);
  const graded = grade.floor + t * span;

  // Scale all three channels by the same factor. Chroma rides through the
  // print untouched; only exposure moves.
  const scale = luma > 1e-6 ? graded / luma : 0;
  const o = i * 4;
  discPng.data[o] = clamp255(r * scale);
  discPng.data[o + 1] = clamp255(g * scale);
  discPng.data[o + 2] = clamp255(b * scale);
  discPng.data[o + 3] = 255;
}
fs.writeFileSync(process.env.DISC_OUT ?? "assets/moon_disc.png", PNG.sync.write(discPng));
console.log(
  `  assets/moon_disc.png ${(fs.statSync("assets/moon_disc.png").size / 1024).toFixed(0)} KB`
);

// ---- normals ----
//
// The normal is the sphere's radial direction tilted by the local slope. On a
// sphere of radius R the surface metric is R dlat north and R cos(lat) dlon
// east, so the slopes are the elevation derivatives divided by those.
//
// Stored in the SHADER's frame, which is y down, so the y component is negated
// on the way out. Storing the full normal rather than a perturbation matters:
// the shader rotates the sampled normal by the pole angle, and rotating a
// sphere normal about the view axis lands on the sphere normal for the rotated
// position, so the base case comes out exactly right for free.
console.log(`Projecting normals at ${NORMAL_SIZE}x${NORMAL_SIZE}, relief ${RELIEF}...`);
const normPng = new PNG({ width: NORMAL_SIZE, height: NORMAL_SIZE });
const rNorm = NORMAL_SIZE / 2;
for (let py = 0; py < NORMAL_SIZE; py++) {
  for (let px = 0; px < NORMAL_SIZE; px++) {
    const x = (px + 0.5 - rNorm) / rNorm;
    const yUp = -(py + 0.5 - rNorm) / rNorm;
    const { lon, lat } = discToSphere(x, yUp);

    const cosLat = Math.max(Math.cos(lat), 0.02); // the poles are a pole of dlon
    const dLat = SLOPE_BASELINE_M / MOON_RADIUS_M;
    const dLon = SLOPE_BASELINE_M / (MOON_RADIUS_M * cosLat);

    const slopeN =
      (elevationM(lat + dLat, lon) - elevationM(lat - dLat, lon)) /
      (2 * SLOPE_BASELINE_M);
    const slopeE =
      (elevationM(lat, lon + dLon) - elevationM(lat, lon - dLon)) /
      (2 * SLOPE_BASELINE_M);

    const sinLat = Math.sin(lat), cLat = Math.cos(lat);
    const sinLon = Math.sin(lon), cosLon = Math.cos(lon);

    // Local frame, y up.
    const ur = [cLat * sinLon, sinLat, cLat * cosLon];
    const east = [cosLon, 0, -sinLon];
    const north = [-sinLat * sinLon, cLat, -sinLat * cosLon];

    let nx = ur[0] - RELIEF * (slopeE * east[0] + slopeN * north[0]);
    let ny = ur[1] - RELIEF * (slopeE * east[1] + slopeN * north[1]);
    let nz = ur[2] - RELIEF * (slopeE * east[2] + slopeN * north[2]);
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;

    const o = (py * NORMAL_SIZE + px) * 4;
    normPng.data[o] = clamp255((nx * 0.5 + 0.5) * 255);
    normPng.data[o + 1] = clamp255((-ny * 0.5 + 0.5) * 255); // y down for the shader
    normPng.data[o + 2] = clamp255((nz * 0.5 + 0.5) * 255);
    normPng.data[o + 3] = 255;
  }
}
const NORMAL_OUT = process.env.NORMAL_OUT ?? "assets/moon_normal.png";
fs.writeFileSync(NORMAL_OUT, PNG.sync.write(normPng));
console.log(
  `  ${NORMAL_OUT} ${(fs.statSync(NORMAL_OUT).size / 1024).toFixed(0)} KB`
);

function clamp255(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}
