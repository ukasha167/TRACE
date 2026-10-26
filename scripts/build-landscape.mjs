/**
 * Builds the ground the sky view stands on.
 *
 *   node scripts/build-landscape.mjs [sources/guereins]
 *
 * SOURCE: Stellarium's default landscape, Guéreins (Fabien Chéreau, a field in
 * the Saône valley north of Lyon), GPL-2.0-or-later like the rest of
 * Stellarium. Download every .png in
 * https://github.com/Stellarium/stellarium/tree/master/landscapes/guereins
 * into sources/guereins/, which is gitignored.
 *
 * Stellarium draws it as an "old_style" landscape: eight side panels, each
 * 45 degrees of azimuth and 40 degrees of altitude from -21.4 up to +18.6, with
 * the sky left transparent above the trees, and a top-down ground texture laid
 * as a disc from -21.4 to the nadir, turned 45 degrees (landscape.ini). This
 * bakes all nine into one equirectangular panorama in azimuth and altitude, so
 * the renderer reads one texture per pixel along the same ray the stars use
 * (components/sky/landscapeShader.ts), as the Milky Way does.
 *
 * The panels go in at their own 6.4 pixels a degree, unscaled. The ground disc
 * is resampled into the rows below them; it is 3.7 pixels a degree at source,
 * which is as sharp as it gets.
 *
 * OUTPUT
 *   assets/sky/landscape.png    2048 x 696 RGBA
 *   src/data/landscape.json     { width, height, top, pxPerDeg }
 */
import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = process.argv[2] ?? path.join(ROOT, "sources/guereins");
const OUT_PNG = path.join(ROOT, "assets/sky/landscape.png");
const OUT_JSON = path.join(ROOT, "src/data/landscape.json");
const OUT_ATTR = path.join(ROOT, "assets/sky/ATTRIBUTION.md");

/** landscape.ini: tex0 to tex7, north round through east. */
const SIDES = ["guereins4", "guereins5", "guereins6", "guereins7", "guereins8", "guereins1", "guereins2", "guereins3"];
const DECOR_ALT = 40;
const DECOR_SHIFT = -21.4;
const GROUND_ROTATE = 45;
const PANEL = 256;
const PX_PER_DEG = PANEL / DECOR_ALT;
const TOP = DECOR_SHIFT + DECOR_ALT;
const W = PANEL * SIDES.length;
// Down to the nadir, rounded up to whole rows.
const H = Math.ceil((TOP + 90) * PX_PER_DEG);

const read = (name) => PNG.sync.read(fs.readFileSync(path.join(SRC, `${name}.png`)));

function bilinear(img, x, y) {
  const fx = Math.min(img.width - 1, Math.max(0, x - 0.5));
  const fy = Math.min(img.height - 1, Math.max(0, y - 0.5));
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = Math.min(img.width - 1, x0 + 1), y1 = Math.min(img.height - 1, y0 + 1);
  const wx = fx - x0, wy = fy - y0;
  const out = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) {
    const at = (xx, yy) => img.data[(yy * img.width + xx) * 4 + c];
    out[c] = (at(x0, y0) * (1 - wx) + at(x1, y0) * wx) * (1 - wy) + (at(x0, y1) * (1 - wx) + at(x1, y1) * wx) * wy;
  }
  return out;
}

const main = () => {
  if (!fs.existsSync(SRC)) throw new Error(`${SRC} is missing; see the header of this script for where to get it`);
  const out = new PNG({ width: W, height: H });
  out.data.fill(0);

  SIDES.forEach((name, i) => {
    const img = read(name);
    if (img.width !== PANEL || img.height !== PANEL) throw new Error(`${name} is ${img.width}x${img.height}, expected ${PANEL}`);
    for (let y = 0; y < PANEL; y++) {
      img.data.copy(out.data, (y * W + i * PANEL) * 4, y * PANEL * 4, (y + 1) * PANEL * 4);
    }
  });

  const ground = read("guereinsb");
  const reach = 90 + DECOR_SHIFT;
  for (let y = PANEL; y < H; y++) {
    const alt = TOP - (y + 0.5) / PX_PER_DEG;
    const r = Math.max(0, (alt + 90) / reach) * 0.5;
    for (let x = 0; x < W; x++) {
      const az = (((x + 0.5) / W) * 360 - GROUND_ROTATE) * (Math.PI / 180);
      const px = bilinear(ground, (0.5 + r * Math.sin(az)) * ground.width, (0.5 - r * Math.cos(az)) * ground.height);
      const o = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) out.data[o + c] = Math.round(px[c]);
      out.data[o + 3] = 255;
    }
  }

  fs.mkdirSync(path.dirname(OUT_PNG), { recursive: true });
  fs.writeFileSync(OUT_PNG, PNG.sync.write(out));
  fs.writeFileSync(OUT_JSON, JSON.stringify({ width: W, height: H, top: TOP, pxPerDeg: PX_PER_DEG }, null, 1) + "\n");
  fs.writeFileSync(
    OUT_ATTR,
    [
      "# Sky view images",
      "",
      "## landscape.png",
      "",
      "Built by `scripts/build-landscape.mjs` from Stellarium's default landscape, Guéreins.",
      "",
      "- **Photographs**: Fabien Chéreau, for the Stellarium project. **GPL-2.0-or-later**.",
      "  <https://www.gnu.org/licenses/old-licenses/gpl-2.0.html>",
      "- **Source**: <https://github.com/Stellarium/stellarium/tree/master/landscapes/guereins>",
      "",
      "The GPL is copyleft. This image stays under it inside this repository and in any build that",
      "ships it; TRACE's own source stays MIT. Attribution must remain visible in the app's credits.",
      "",
      "## milkyway.png",
      "",
      "Built by `scripts/build-milky-way.mjs` from NASA's Deep Star Maps 2020, Ernie Wright,",
      "NASA Scientific Visualization Studio (<https://svs.gsfc.nasa.gov/4851>). Public domain.",
      "",
    ].join("\n")
  );
  console.log(`wrote ${OUT_PNG} (${W}x${H}, ${(fs.statSync(OUT_PNG).size / 1024).toFixed(0)} KB), ${OUT_JSON}, ${OUT_ATTR}`);
};

main();
