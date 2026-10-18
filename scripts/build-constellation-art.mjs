/**
 * Builds the constellation figure artwork sheet and its anchor data.
 *
 *   node scripts/build-constellation-art.mjs
 *
 * WHY THE ART IS BORROWED RATHER THAN DRAWN.
 *
 * The brief was "make sure every figure looks like it belongs with the others".
 * Fifteen hand-authored figure drawings of a hunter, a bear, a lion and a swan
 * would not hold one style, and a set that visibly does not match is worse than
 * no set at all. Stellarium's default illustrations are one artist's work
 * (Johan Meuris), already 512x512 8-bit greyscale line art on black, which is
 * both consistent by construction and already in TRACE's register: a plate is a
 * dark surface and these are drawn to be added to one.
 *
 * LICENCE. The illustrations are Free Art License 1.3, which is copyleft. They
 * stay under that licence inside this repository; the app's own code stays MIT.
 * Attribution is written to assets/constellations/ATTRIBUTION.md by this script
 * and must ship with the app. The anchor and line data is CC BY-SA 4.0.
 *
 * WHAT IT PRODUCES.
 *
 *   assets/constellations/figures.png   one sheet, ten tiles across, greyscale
 *   src/data/constellationArt.json      per figure: tile index, size, anchors
 *
 * ONE SHEET, NOT EIGHTY-EIGHT FILES. The renderer needs every figure available
 * on any frame, and `useImage` is a hook, so one file per figure means either
 * a hook call per figure or an async loader with its own cache. One sheet is one
 * texture upload, one hook, and one thing that can fail.
 *
 * ANCHORS. Stellarium pins each illustration with three (image x, y) to HIP
 * star pairs. TRACE's catalogue is keyed by HR, not HIP, so the HIP numbers are
 * resolved to J2000 RA/Dec at BUILD time through VizieR's Hipparcos catalogue
 * and stored as coordinates. The runtime then treats an anchor exactly like a
 * constellation line vertex and never needs to know what HIP means.
 *
 * Positions come back at epoch J1991.25 rather than J2000. Proper motion over
 * 8.75 years is a few arcseconds for these stars, against artwork stretched
 * across tens of degrees, so no epoch correction is applied.
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

const RAW = "https://raw.githubusercontent.com/Stellarium/stellarium/master/skycultures/modern";
const VIZIER = "https://vizier.cds.unistra.fr/viz-bin/asu-tsv";

/**
 * EVERY FIGURE THE PACK HAS. This used to be fifteen hand-picked figures, on
 * the theory that nobody looks for Antlia. In practice the gap was the thing
 * people noticed: Orion lit up with its hunter and Lepus at his feet lit up as
 * bare lines. A figure only shows while you are looking at it, so carrying all
 * of them costs texture memory and nothing on screen.
 *
 * The list comes from the line data, so a constellation with lines and no
 * illustration is reported rather than silently skipped. Three are, and that
 * is the pack, not a gap in it: Stellarium draws Puppis and Vela as parts of
 * Argo Navis, filed under Carina, and has no separate Serpens.
 */
const LINE_IDS = [
  ...new Set(
    JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../src/data/constellations.json"), "utf8")).map((c) => c.id)
  ),
];

/**
 * 384pt tiles, ten across: a 3840 x 3456 sheet, inside the 4096 texture limit
 * every phone this app runs on supports. At 512 the full set would be 5120
 * wide. The art is drawn at a fifth of full strength under the lines, where a
 * quarter less resolution does not show.
 */
const TILE = 384;
const COLS = 10;
const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_PNG = path.join(ROOT, "assets/constellations/figures.png");
const OUT_JSON = path.join(ROOT, "src/data/constellationArt.json");
const OUT_ATTR = path.join(ROOT, "assets/constellations/ATTRIBUTION.md");
/** Download cache. Gitignored; delete it to force a fresh pull. */
const CACHE = path.join(ROOT, ".cache/constellation-art");

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

/**
 * Eighty-odd sequential fetches from one CDN drop connections often enough to be
 * worth retrying, and `fetch` has no default timeout, so a stalled socket hangs
 * the build forever rather than failing. Both are handled here.
 *
 * Downloads are cached under .cache/ so a rerun costs nothing and a failure
 * part way through does not start again from Orion.
 */
async function getBuffer(url, attempts = 4) {
  const cached = path.join(CACHE, encodeURIComponent(url));
  if (fs.existsSync(cached)) return fs.readFileSync(cached);

  for (let i = 1; i <= attempts; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(25_000) });
      if (!r.ok) throw new Error(`${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      fs.mkdirSync(CACHE, { recursive: true });
      fs.writeFileSync(cached, buf);
      return buf;
    } catch (e) {
      if (i === attempts) throw new Error(`${url}: ${e.message}`);
      await new Promise((res) => setTimeout(res, 700 * i));
    }
  }
}

/** HIP -> { ra, dec } in degrees, one request for the whole set. */
async function resolveHip(hips) {
  const url =
    `${VIZIER}?-source=I/239/hip_main&-out=HIP,RAICRS,DEICRS` +
    `&-out.max=${hips.length + 10}&HIP=${hips.join(",")}`;
  const text = await (await fetch(url)).text();
  const out = new Map();
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const parts = line.trim().split(/\s+/);
    if (parts.length !== 3) continue;
    const [hip, ra, dec] = parts;
    if (!/^\d+$/.test(hip)) continue;
    const r = Number(ra), d = Number(dec);
    if (!Number.isFinite(r) || !Number.isFinite(d)) continue;
    out.set(Number(hip), { ra: r, dec: d });
  }
  return out;
}

/**
 * Bilinear resample of an RGBA source into one TILE x TILE cell of the sheet.
 *
 * Bilinear rather than nearest: these are line drawings, and nearest-neighbour
 * upscaling turns a 128px figure into visible staircases at 4x.
 */
function blitScaled(src, sheet, ox, oy, tile, cols) {
  const sheetW = tile * cols;
  const sx = src.width / tile;
  const sy = src.height / tile;

  for (let y = 0; y < tile; y++) {
    const fy = Math.min(src.height - 1, (y + 0.5) * sy - 0.5);
    const y0 = Math.max(0, Math.floor(fy));
    const y1 = Math.min(src.height - 1, y0 + 1);
    const wy = fy - y0;

    for (let x = 0; x < tile; x++) {
      const fx = Math.min(src.width - 1, (x + 0.5) * sx - 0.5);
      const x0 = Math.max(0, Math.floor(fx));
      const x1 = Math.min(src.width - 1, x0 + 1);
      const wx = fx - x0;

      const dst = ((oy + y) * sheetW + ox + x) * 4;
      for (let ch = 0; ch < 4; ch++) {
        const a = src.data[(y0 * src.width + x0) * 4 + ch];
        const b = src.data[(y0 * src.width + x1) * 4 + ch];
        const c2 = src.data[(y1 * src.width + x0) * 4 + ch];
        const d = src.data[(y1 * src.width + x1) * 4 + ch];
        sheet.data[dst + ch] =
          (a * (1 - wx) + b * wx) * (1 - wy) + (c2 * (1 - wx) + d * wx) * wy;
      }
    }
  }
}

const main = async () => {
  console.log("fetching skyculture index...");
  const index = await getJson(`${RAW}/index.json`);

  // Stellarium ids look like "CON modern Ori".
  const byAbbrev = new Map();
  for (const c of index.constellations ?? []) {
    const abbrev = String(c.id).split(/\s+/).pop();
    byAbbrev.set(abbrev, c);
  }

  const chosen = [];
  const without = [];
  for (const abbrev of LINE_IDS) {
    const c = byAbbrev.get(abbrev);
    if (!c?.image) { without.push(abbrev); continue; }
    if (c.image.anchors?.length !== 3) {
      throw new Error(`"${abbrev}" has ${c.image.anchors?.length} anchors, expected 3`);
    }
    chosen.push({ abbrev, c });
  }
  if (without.length) console.log(`no illustration in the pack: ${without.join(", ")}`);
  const ROWS = Math.ceil(chosen.length / COLS);

  const hips = [...new Set(chosen.flatMap(({ c }) => c.image.anchors.map((a) => a.hip)))];
  console.log(`resolving ${hips.length} anchor stars through VizieR...`);
  const positions = await resolveHip(hips);
  const missing = hips.filter((h) => !positions.has(h));
  if (missing.length) throw new Error(`VizieR returned nothing for HIP ${missing.join(", ")}`);

  const sheet = new PNG({ width: TILE * COLS, height: TILE * ROWS });
  sheet.data.fill(0);

  const figures = [];
  for (let i = 0; i < chosen.length; i++) {
    const { abbrev, c } = chosen[i];
    const file = c.image.file;
    process.stdout.write(`  ${abbrev.padEnd(4)} ${file} ... `);

    const png = PNG.sync.read(await getBuffer(`${RAW}/${file}`));
    const [sw, sh] = c.image.size;
    if (png.width !== sw || png.height !== sh) {
      throw new Error(`${abbrev}: index says ${sw}x${sh}, file is ${png.width}x${png.height}`);
    }

    // Illustrations come in several sizes (Crux ships at 128, Gemini and Ursa
    // Minor at 256). All are resampled into one tile size rather than packed
    // at native size, because a sheet of mixed tile sizes means the renderer
    // has to carry a per-figure source rect for no benefit.
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    blitScaled(png, sheet, col * TILE, row * TILE, TILE, COLS);

    figures.push({
      id: abbrev,
      tile: [col, row],
      // Normalised into 0..1 of the source image, so the tile size and any
      // resampling stay entirely a build-time concern.
      anchors: c.image.anchors.map((a) => {
        const p = positions.get(a.hip);
        return {
          u: a.pos[0] / sw,
          v: a.pos[1] / sh,
          ra: p.ra,
          dec: p.dec,
        };
      }),
    });
    console.log(`ok  (${sw}x${sh})`);
  }

  fs.mkdirSync(path.dirname(OUT_PNG), { recursive: true });
  fs.writeFileSync(OUT_PNG, PNG.sync.write(sheet, { colorType: 0 }));

  fs.writeFileSync(
    OUT_JSON,
    JSON.stringify({ tile: TILE, cols: COLS, figures }, null, 1) + "\n"
  );

  fs.writeFileSync(
    OUT_ATTR,
    [
      "# Constellation figure artwork",
      "",
      "`figures.png` is a sheet built by `scripts/build-constellation-art.mjs` from",
      "Stellarium's `modern` skyculture illustrations.",
      "",
      "- **Illustrations**: Johan Meuris, for the Stellarium project. **Free Art License 1.3**.",
      "  <https://artlibre.org/licence/lal/en/>",
      "- **Anchor and constellation data**: the Stellarium team. **CC BY-SA 4.0**.",
      "- **Source**: <https://github.com/Stellarium/stellarium/tree/master/skycultures/modern>",
      "",
      "The Free Art License is copyleft. These images stay under it inside this",
      "repository and in any build that ships them; TRACE's own source stays MIT.",
      "Attribution must remain visible in the app's credits.",
      "",
      "Figures included: " + chosen.map((f) => f.abbrev).join(", ") + ".",
      "",
    ].join("\n")
  );

  const kb = (fs.statSync(OUT_PNG).size / 1024).toFixed(0);
  console.log(`\nwrote ${OUT_PNG}  (${TILE * COLS}x${TILE * ROWS}, ${kb} KB)`);
  console.log(`wrote ${OUT_JSON}  (${figures.length} figures)`);
  console.log(`wrote ${OUT_ATTR}`);
};

main().catch((e) => {
  console.error("\nfailed:", e.message);
  process.exit(1);
});
