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
 * WHAT IS KEPT. All three channels. The colour is Gaia's measured starlight,
 * and it is warm where the band is bright: dust reddens the core toward
 * Sagittarius, so red over green runs from 1.06 in the faint band to 1.5 in
 * the brightest clouds. The naked eye sees none of that, because the rods do
 * the seeing at this brightness; the view draws it anyway, the way a
 * long-exposure photograph does (DECISIONS 64).
 *
 * WHITE BALANCE. A camera balances on the scene, and so does this: the band's
 * own average (the 90th to 99th percentile of luminance) is made neutral. The
 * core then reads gold and the faint arms blue-white, the look of a Milky Way
 * photograph, and the ratios between any two parts of the band are the
 * measured ones.
 *
 * The EXR is linear, so each channel is summed light, and the 8-bit file
 * stores each one over the same luminance reference through a 1/2.2 power so
 * the faint outskirts keep their levels; src/data/milkyWay.json carries what
 * the renderer needs to undo that and recover relative radiance.
 *
 * OUTPUT
 *   assets/sky/milkyway.png    2048 x 1024 RGB
 *   src/data/milkyWay.json     { width, height, gamma, reference, floor }
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
/**
 * The radiance the renderer takes as black. The map has light everywhere,
 * because Gaia's faint stars are everywhere, and drawn as it is that floor put
 * a grey wash over the whole sky, band or not. The median sky pixel is the
 * floor: half the sky is away from the band, and that half draws black.
 */
const FLOOR_PERCENTILE = 0.5;
/** The luminance range the white balance is taken over: the band, not the dark sky. */
const BALANCE_RANGE = [0.9, 0.99];

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
  const n = OUT_W * OUT_H;
  const ch = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  const lum = new Float32Array(n);
  for (let y = 0; y < OUT_H; y++) {
    for (let x = 0; x < OUT_W; x++) {
      let r = 0, g = 0, b = 0;
      for (let dy = 0; dy < fy; dy++) {
        for (let dx = 0; dx < fx; dx++) {
          const i = (y * fy + dy) * img.width + x * fx + dx;
          r += img.R[i];
          g += img.G[i];
          b += img.B[i];
        }
      }
      const o = y * OUT_W + x;
      const k = fx * fy;
      ch[0][o] = Math.max(0, r / k);
      ch[1][o] = Math.max(0, g / k);
      ch[2][o] = Math.max(0, b / k);
      // Rec. 709 luminance of linear light.
      lum[o] = 0.2126 * ch[0][o] + 0.7152 * ch[1][o] + 0.0722 * ch[2][o];
    }
  }

  const sorted = Float32Array.from(lum).sort();
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const reference = at(REFERENCE_PERCENTILE);
  const floor = at(FLOOR_PERCENTILE) / reference;
  console.log(`luminance p10 ${at(0.1).toExponential(3)} p50 ${at(0.5).toExponential(3)} p99 ${at(0.99).toExponential(3)} ref ${reference.toExponential(3)} max ${sorted.at(-1).toExponential(3)}`);

  // Each channel's gain that makes the band's average neutral, at unchanged luminance.
  const [lo, hi] = BALANCE_RANGE.map(at);
  const mean = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    if (lum[i] < lo || lum[i] > hi) continue;
    for (let c = 0; c < 3; c++) mean[c] += ch[c][i];
  }
  const meanLum = 0.2126 * mean[0] + 0.7152 * mean[1] + 0.0722 * mean[2];
  const balance = mean.map((m) => meanLum / m);
  console.log(`balance r ${balance[0].toFixed(3)} g ${balance[1].toFixed(3)} b ${balance[2].toFixed(3)}, floor ${floor.toExponential(3)} of the reference`);

  const png = new PNG({ width: OUT_W, height: OUT_H, colorType: 2, inputColorType: 2, inputHasAlpha: false, bitDepth: 8 });
  const data = Buffer.alloc(n * 3);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) {
      data[i * 3 + c] = Math.round(255 * Math.min(1, Math.pow((ch[c][i] * balance[c]) / reference, 1 / GAMMA)));
    }
  }
  png.data = data;
  fs.mkdirSync(path.dirname(OUT_PNG), { recursive: true });
  fs.writeFileSync(OUT_PNG, PNG.sync.write(png, { colorType: 2, inputColorType: 2, inputHasAlpha: false }));
  fs.writeFileSync(OUT_JSON, JSON.stringify({ width: OUT_W, height: OUT_H, gamma: GAMMA, reference, floor }, null, 1) + "\n");
  console.log(`wrote ${OUT_PNG} (${(fs.statSync(OUT_PNG).size / 1024).toFixed(0)} KB) and ${OUT_JSON}`);
};

main();
