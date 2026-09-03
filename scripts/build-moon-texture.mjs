/**
 * Builds assets/moon_disc.png from an equirectangular lunar map.
 *
 * SOURCE: NASA Lunar Reconnaissance Orbiter (LRO) / CGI Moon Kit (public domain).
 * Input: 2048x1024 equirectangular map (assets/2k_moon.jpg).
 *
 * This script exists so the bundled lunar texture is REPRODUCIBLE rather than a
 * blob someone has to trust.
 *
 * Usage:
 *   node scripts/build-moon-texture.mjs [assets/2k_moon.jpg] [assets/moon_disc.png]
 *
 * CENTERING VERIFICATION:
 * - Center of input map (x=1024, y=512) corresponds to (lon 0°, lat 0°), the near-side
 *   sub-Earth point.
 * - Mare Imbrium and Mare Serenitatis are in the northern near-side hemisphere (top-center).
 * - Mare Crisium is on the near-side eastern limb (right of center).
 * - Oceanus Procellarum is on the near-side western limb (left of center).
 * - Tycho crater and its ray system are in the southern highlands (bottom-center).
 * The orthographic projection maps -90° to +90° lon/lat centered at (0, 0), which extracts
 * the Near Side facing Earth with North UP and East on the RIGHT.
 *
 * RESOLUTION DERIVATION:
 * The largest place the moon is drawn in the application is the Story export card
 * (1080x1920). From ExportCardCanvas.tsx:
 *   PAD = 72, inner = 1080 - 2*72 = 936, plateH = 620
 *   moonR = min(inner, plateH) * 0.32 = 620 * 0.32 = 198.4 px
 *   Drawn diameter = 2 * 198.4 = 396.8 px
 * Ceiled to integer: 397 px.
 * Sizing the asset at 397x397 ensures it is never upscaled.
 */
import fs from "node:fs";
import path from "node:path";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";

const inputPath = process.argv[2] || "assets/2k_moon.jpg";
const outputPath = process.argv[3] || "assets/moon_disc.png";

if (!fs.existsSync(inputPath)) {
  console.error(`Input file not found: ${inputPath}`);
  process.exit(1);
}

console.log(`Reading equirectangular map from ${inputPath}...`);
const jpegData = fs.readFileSync(inputPath);
const inImage = jpeg.decode(jpegData, { useTArray: true });
const inW = inImage.width;
const inH = inImage.height;
console.log(`Source map: ${inW}x${inH}, ${inImage.data.length} bytes`);

// Derived diameter: 2 * (620 * 0.32) = 396.8 -> 397 pixels
const outSize = 397;
const png = new PNG({ width: outSize, height: outSize });

const rOut = outSize / 2;
const cx = rOut;
const cy = rOut;

// Sample input image with bilinear interpolation
function sampleBilinear(u, v) {
  const srcX = Math.min(Math.max(u * inW, 0), inW - 1);
  const srcY = Math.min(Math.max(v * inH, 0), inH - 1);

  const x0 = Math.floor(srcX);
  const x1 = Math.min(x0 + 1, inW - 1);
  const y0 = Math.floor(srcY);
  const y1 = Math.min(y0 + 1, inH - 1);

  const fx = srcX - x0;
  const fy = srcY - y0;

  const idx00 = (y0 * inW + x0) * 4;
  const idx10 = (y0 * inW + x1) * 4;
  const idx01 = (y1 * inW + x0) * 4;
  const idx11 = (y1 * inW + x1) * 4;

  const r =
    (1 - fx) * (1 - fy) * inImage.data[idx00] +
    fx * (1 - fy) * inImage.data[idx10] +
    (1 - fx) * fy * inImage.data[idx01] +
    fx * fy * inImage.data[idx11];

  const g =
    (1 - fx) * (1 - fy) * inImage.data[idx00 + 1] +
    fx * (1 - fy) * inImage.data[idx10 + 1] +
    (1 - fx) * fy * inImage.data[idx01 + 1] +
    fx * fy * inImage.data[idx11 + 1];

  const b =
    (1 - fx) * (1 - fy) * inImage.data[idx00 + 2] +
    fx * (1 - fy) * inImage.data[idx10 + 2] +
    (1 - fx) * fy * inImage.data[idx01 + 2] +
    fx * fy * inImage.data[idx11 + 2];

  return { r, g, b };
}

for (let py = 0; py < outSize; py++) {
  // y: +1 at top (North), -1 at bottom (South)
  const y = -(py + 0.5 - cy) / rOut;
  for (let px = 0; px < outSize; px++) {
    // x: -1 at left (West), +1 at right (East)
    const x = (px + 0.5 - cx) / rOut;
    const r2 = x * x + y * y;
    const outIdx = (py * outSize + px) * 4;

    if (r2 <= 1.0) {
      const z = Math.sqrt(1.0 - r2);
      const lon = Math.atan2(x, z); // -pi/2 to +pi/2
      const lat = Math.asin(y);     // -pi/2 to +pi/2

      // Map lon to u on equirectangular (center lon=0 is u=0.5)
      const u = 0.5 + lon / (2 * Math.PI);
      // Map lat to v on equirectangular (North lat=+pi/2 is v=0)
      const v = 0.5 - lat / Math.PI;

      const { r, g, b } = sampleBilinear(u, v);

      // Edge antialiasing: smooth falloff across outer half-pixel
      const dist = Math.sqrt(r2);
      const edgeThreshold = (rOut - 0.75) / rOut;
      let alpha = 1.0;
      if (dist > edgeThreshold) {
        alpha = Math.max(0, Math.min(1, (1.0 - dist) / (1.0 - edgeThreshold)));
      }

      png.data[outIdx] = Math.round(r);
      png.data[outIdx + 1] = Math.round(g);
      png.data[outIdx + 2] = Math.round(b);
      png.data[outIdx + 3] = Math.round(alpha * 255);
    } else {
      png.data[outIdx] = 0;
      png.data[outIdx + 1] = 0;
      png.data[outIdx + 2] = 0;
      png.data[outIdx + 3] = 0;
    }
  }
}

console.log(`Writing ${outSize}x${outSize} orthographic disc to ${outputPath}...`);
const buffer = PNG.sync.write(png);
fs.writeFileSync(outputPath, buffer);
const stat = fs.statSync(outputPath);
console.log(`Done. Generated ${outputPath} (${(stat.size / 1024).toFixed(1)} KB).`);
