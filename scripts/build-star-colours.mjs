/**
 * Merges each star's B-V colour index into src/data/bsc.json.
 *
 *   node scripts/build-star-colours.mjs
 *
 * SOURCE: the same Yale Bright Star Catalogue the positions come from, V/50 on
 * VizieR, which publishes B-V for 9,110 entries. The download is cached under
 * .cache/star-colours/ so a rerun needs no network.
 *
 * B-V is the measured difference between a star's blue and visual magnitudes,
 * and it is what decides the colour the sky view draws (lib/astronomy/
 * starColour.ts). Stars with no published value keep no `bv` and draw white,
 * which is what the eye sees of a star whose colour nobody measured.
 *
 * Run after build-star-catalog.mjs and build-sky-data.mjs, which rewrite the
 * file without it.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const CATALOG = path.join(ROOT, "src/data/bsc.json");
const CACHE = path.join(ROOT, ".cache/star-colours/v50_bv.tsv");
const URL = "https://vizier.cds.unistra.fr/viz-bin/asu-tsv?-source=V/50/catalog&-out=HR&-out=B-V&-out.max=20000";

const main = async () => {
  if (!fs.existsSync(CACHE)) {
    const r = await fetch(URL, { signal: AbortSignal.timeout(60_000) });
    if (!r.ok) throw new Error(`${r.status} ${URL}`);
    fs.mkdirSync(path.dirname(CACHE), { recursive: true });
    fs.writeFileSync(CACHE, await r.text());
  }
  const bv = new Map();
  for (const line of fs.readFileSync(CACHE, "utf8").split("\n")) {
    const m = /^\s*(\d+)\t\s*(-?\d+\.\d+)\s*$/.exec(line);
    if (m) bv.set(Number(m[1]), Number(m[2]));
  }
  if (bv.size < 8500) throw new Error(`only ${bv.size} B-V values; expected about 8,800`);

  const stars = JSON.parse(fs.readFileSync(CATALOG, "utf8"));
  let matched = 0;
  for (const s of stars) {
    delete s.bv;
    if (bv.has(s.hr)) {
      s.bv = bv.get(s.hr);
      matched++;
    }
  }
  fs.writeFileSync(CATALOG, JSON.stringify(stars));
  console.log(`B-V merged for ${matched} of ${stars.length} stars`);
};

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
