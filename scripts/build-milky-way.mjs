/**
 * Builds the Milky Way the sky view draws behind its stars.
 *
 *   node scripts/build-milky-way.mjs [sources/milkyway_2020_4k.exr]
 *
 * SOURCE: NASA's Deep Star Maps 2020 (Ernie Wright, NASA Scientific
 * Visualization Studio, https://svs.gsfc.nasa.gov/4851), public domain. Its
 * "Milky Way background" layer is the star map with the Hipparcos and Tycho
 * stars left out: what remains is the light of Gaia DR2's fainter stars,
 * plotted from measured positions and fluxes. That is exactly the part of the
 * sky the catalogue cannot draw one star at a time, and because the bright
 * stars are already gone from it, nothing in it doubles a star the view draws
 * from bsc.json. Download `milkyway_2020_4k.exr` (4096 x 2048, 35 MB) into
 * sources/, which is gitignored.
 *
 * The map is plate carree in J2000 right ascension and declination, centred on
 * 0h with right ascension increasing to the left: the same frame as the star
 * catalogue, so the renderer needs no galactic transform.
 *
 * WHAT IS KEPT. Luminance only. The naked-eye Milky Way is seen by the rods,
 * which see no colour, so its colour channels would be a claim about how it
 * looks that the eye does not make. The EXR is linear, so luminance is summed
 * light, and the 8-bit file stores it through a 1/2.2 power so the faint
 * outskirts keep their levels; src/data/milkyWay.json carries the reference
 * the renderer needs to undo that and recover relative radiance.
 *
 * OUTPUT
 *   assets/sky/milkyway.png    2048 x 1024 greyscale
 *   src/data/milkyWay.json     { width, height, gamma, reference }
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { PNG } from "pngjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = process.argv[2] ?? path.join(ROOT, "sources/milkyway_2020_4k.exr");
const OUT_PNG = path.join(ROOT, "assets/sky/milkyway.png");
const OUT_JSON = path.join(ROOT, "src/data/milkyWay.json");

/** Half the source width: 5.7 pixels a degree, finer than any dark lane the eye can see. */
const OUT_W = 2048;
const OUT_H = 1024;
const GAMMA = 2.2;
/**
 * The radiance stored as white. The 99.95th percentile rather than the
 * maximum, because the maximum is a single unresolved cluster core and would
 * leave the whole band in the bottom tenth of the range.
 */
const REFERENCE_PERCENTILE = 0.9995;

function halfToFloat(h) {
  const s = h & 0x8000 ? -1 : 1;
  const e = (h >> 10) & 0x1f;
  const f = h & 0x3ff;
  if (e === 0) return s * f * 2 ** -24;
  if (e === 31) return f ? NaN : s * Infinity;
  return s * (1 + f / 1024) * 2 ** (e - 15);
}

/** OpenEXR's ZIP blocks: deflate over a byte predictor over split even/odd bytes. */
function unzipBlock(data, expected) {
  if (data.length === expected) return data;
  const t = zlib.inflateSync(data);
  for (let i = 1; i < t.length; i++) t[i] = (t[i - 1] + t[i] - 128) & 0xff;
  const out = Buffer.alloc(t.length);
  const half = Math.ceil(t.length / 2);
  for (let i = 0, j = 0; i < t.length; i += 2, j++) {
    out[i] = t[j];
    if (i + 1 < t.length) out[i + 1] = t[half + j];
  }
  return out;
}

function readExr(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32LE(0) !== 20000630) throw new Error(`${file} is not an OpenEXR file`);
  let p = 8;
  const attrs = {};
  while (b[p] !== 0) {
    let e = b.indexOf(0, p);
    const name = b.toString("latin1", p, e);
    p = e + 1;
    e = b.indexOf(0, p);
    p = e + 1;
    const size = b.readInt32LE(p);
    p += 4;
    attrs[name] = b.subarray(p, p + size);
    p += size;
  }
  p += 1;
  if (attrs.compression[0] !== 3) throw new Error(`compression ${attrs.compression[0]}, expected ZIP (3)`);
  const channels = [];
  for (let q = 0; attrs.channels[q] !== 0; ) {
    const e = attrs.channels.indexOf(0, q);
    channels.push({ name: attrs.channels.toString("latin1", q, e), type: attrs.channels.readInt32LE(e + 1) });
    q = e + 17;
  }
  if (channels.some((c) => c.type !== 1)) throw new Error("expected half-float channels");
  const dw = attrs.dataWindow;
  const width = dw.readInt32LE(8) - dw.readInt32LE(0) + 1;
  const height = dw.readInt32LE(12) - dw.readInt32LE(4) + 1;
  const LINES = 16;
  const blocks = Math.ceil(height / LINES);
  const rgb = { R: new Float32Array(width * height), G: new Float32Array(width * height), B: new Float32Array(width * height) };
  for (let k = 0; k < blocks; k++) {
    const off = Number(b.readBigUInt64LE(p + k * 8));
    const y0 = b.readInt32LE(off);
    const size = b.readInt32LE(off + 4);
    const lines = Math.min(LINES, height - y0);
    const raw = unzipBlock(b.subarray(off + 8, off + 8 + size), lines * width * channels.length * 2);
    let r = 0;
    for (let line = 0; line < lines; line++) {
      for (const c of channels) {
        const dst = rgb[c.name];
        for (let x = 0; x < width; x++, r += 2) dst[(y0 + line) * width + x] = halfToFloat(raw.readUInt16LE(r));
      }
    }
  }
  return { width, height, ...rgb };
}

const main = () => {
  if (!fs.existsSync(SRC)) throw new Error(`${SRC} is missing; see the header of this script for where to get it`);
  const img = readExr(SRC);
  console.log(`read ${img.width}x${img.height}`);

  const fx = img.width / OUT_W;
  const fy = img.height / OUT_H;
  const lum = new Float32Array(OUT_W * OUT_H);
  for (let y = 0; y < OUT_H; y++) {
    for (let x = 0; x < OUT_W; x++) {
      let sum = 0;
      for (let dy = 0; dy < fy; dy++) {
        for (let dx = 0; dx < fx; dx++) {
          const i = (y * fy + dy) * img.width + x * fx + dx;
          // Rec. 709 luminance of linear light.
          sum += 0.2126 * img.R[i] + 0.7152 * img.G[i] + 0.0722 * img.B[i];
        }
      }
      lum[y * OUT_W + x] = Math.max(0, sum / (fx * fy));
    }
  }

  const sorted = Float32Array.from(lum).sort();
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const reference = at(REFERENCE_PERCENTILE);
  console.log(`luminance p10 ${at(0.1).toExponential(3)} p50 ${at(0.5).toExponential(3)} p99 ${at(0.99).toExponential(3)} ref ${reference.toExponential(3)} max ${sorted.at(-1).toExponential(3)}`);

  const png = new PNG({ width: OUT_W, height: OUT_H, colorType: 0, inputColorType: 0, inputHasAlpha: false, bitDepth: 8 });
  const data = Buffer.alloc(OUT_W * OUT_H);
  for (let i = 0; i < lum.length; i++) {
    data[i] = Math.round(255 * Math.min(1, Math.pow(lum[i] / reference, 1 / GAMMA)));
  }
  png.data = data;
  fs.mkdirSync(path.dirname(OUT_PNG), { recursive: true });
  fs.writeFileSync(OUT_PNG, PNG.sync.write(png, { colorType: 0, inputColorType: 0, inputHasAlpha: false }));
  fs.writeFileSync(OUT_JSON, JSON.stringify({ width: OUT_W, height: OUT_H, gamma: GAMMA, reference }, null, 1) + "\n");
  console.log(`wrote ${OUT_PNG} (${(fs.statSync(OUT_PNG).size / 1024).toFixed(0)} KB) and ${OUT_JSON}`);
};

main();
