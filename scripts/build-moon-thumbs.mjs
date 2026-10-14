/**
 * Downsamples the two lunar maps to 256px, for moons drawn small.
 *
 *   assets/moon_disc_256.png    from assets/moon_disc.png
 *   assets/moon_normal_256.png  from assets/moon_normal.png
 *
 * WHY A SECOND SIZE. A 36pt list thumbnail is about 108 device pixels across.
 * Skia samples the 1024px map into it through a linear filter with no mipmaps,
 * so each screen pixel reads roughly one texel in ten, and the disc shimmers.
 * It also meant every row decoded 8 MB of pixels to draw a fingernail.
 *
 * Box-filtered from the committed 1024px maps rather than projected again from
 * the 8K sources, so the small pair carries exactly the grade and registration
 * the hero does. Normals are decoded, averaged as vectors and renormalised.
 * Averaging the encoded bytes instead would shorten every normal that sits on a
 * slope, and a short normal prints darker than the surface it describes.
 *
 * Usage:
 *   node scripts/build-moon-thumbs.mjs
 *
 * build-moon-maps.mjs runs this at the end, so the two sizes cannot drift apart.
 */
import fs from "node:fs";
import { PNG } from "pngjs";

const TARGET = 256;
const DISC_IN = process.env.DISC_OUT ?? "assets/moon_disc.png";
const NORMAL_IN = process.env.NORMAL_OUT ?? "assets/moon_normal.png";

downsample(DISC_IN, false);
downsample(NORMAL_IN, true);

function downsample(inPath, isNormalMap) {
  const src = PNG.sync.read(fs.readFileSync(inPath));
  const factor = src.width / TARGET;
  if (!Number.isInteger(factor) || src.height !== src.width) {
    throw new Error(`${inPath} is ${src.width}x${src.height}; expected a square multiple of ${TARGET}`);
  }

  const out = new PNG({ width: TARGET, height: TARGET });
  const n = factor * factor;
  for (let y = 0; y < TARGET; y++) {
    for (let x = 0; x < TARGET; x++) {
      let a = 0, b = 0, c = 0;
      for (let dy = 0; dy < factor; dy++) {
        for (let dx = 0; dx < factor; dx++) {
          const i = ((y * factor + dy) * src.width + (x * factor + dx)) * 4;
          if (isNormalMap) {
            a += src.data[i] / 127.5 - 1;
            b += src.data[i + 1] / 127.5 - 1;
            c += src.data[i + 2] / 127.5 - 1;
          } else {
            a += src.data[i];
            b += src.data[i + 1];
            c += src.data[i + 2];
          }
        }
      }

      const o = (y * TARGET + x) * 4;
      if (isNormalMap) {
        const len = Math.hypot(a, b, c) || 1;
        out.data[o] = clamp255((a / len * 0.5 + 0.5) * 255);
        out.data[o + 1] = clamp255((b / len * 0.5 + 0.5) * 255);
        out.data[o + 2] = clamp255((c / len * 0.5 + 0.5) * 255);
      } else {
        out.data[o] = clamp255(a / n);
        out.data[o + 1] = clamp255(b / n);
        out.data[o + 2] = clamp255(c / n);
      }
      out.data[o + 3] = 255;
    }
  }

  const outPath = inPath.replace(/\.png$/, `_${TARGET}.png`);
  fs.writeFileSync(outPath, PNG.sync.write(out));
  console.log(`  ${outPath} ${(fs.statSync(outPath).size / 1024).toFixed(0)} KB`);
}

function clamp255(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}
