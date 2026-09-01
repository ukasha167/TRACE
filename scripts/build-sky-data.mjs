/**
 * Builds src/data/constellations.json and merges IAU proper names into bsc.json.
 *
 * SOURCES
 *  - Constellation figures: d3-celestial (BSD-3-Clause, MIT-compatible),
 *    data/constellations.lines.json. GeoJSON MultiLineStrings whose coordinates
 *    are [RA_deg, Dec_deg] in J2000 — usable directly, which is why this no
 *    longer needs the HIP<->HR cross-index that blocked it earlier.
 *  - Star names: IAU Working Group on Star Names, Catalog of Star Names
 *    (IAU-CSN). The official list; names are matched onto the Yale catalog by
 *    the HR number the IAU itself publishes, so nothing is guessed.
 *
 *   node scripts/build-sky-data.mjs <constellations.lines.json> <IAU-CSN.txt>
 */
import fs from "node:fs";

const [linesPath, csnPath] = process.argv.slice(2);
if (!linesPath || !csnPath) {
  console.error("usage: node scripts/build-sky-data.mjs <lines.json> <IAU-CSN.txt>");
  process.exit(1);
}

// ---- Constellation figures ----
const geo = JSON.parse(fs.readFileSync(linesPath, "utf8"));
const constellations = [];
let segmentCount = 0;
let pointCount = 0;

for (const f of geo.features) {
  const lines = [];
  for (const seg of f.geometry.coordinates) {
    // Flatten to [ra, dec, ra, dec, ...] — half the JSON size of nested pairs,
    // and the renderer walks it as a flat array anyway.
    const flat = [];
    for (const [ra, dec] of seg) {
      flat.push(Number(((ra % 360) + 360) % 360), Number(dec));
      pointCount++;
    }
    if (flat.length >= 4) { lines.push(flat); segmentCount++; }
  }
  if (lines.length) constellations.push({ id: f.id, lines });
}

fs.writeFileSync("src/data/constellations.json", JSON.stringify(constellations));
console.log(`constellations : ${constellations.length}`);
console.log(`segments       : ${segmentCount}`);
console.log(`points         : ${pointCount}`);
console.log(`size           : ${(fs.statSync("src/data/constellations.json").size / 1024).toFixed(0)} KB`);

// ---- IAU proper names, keyed by HR ----
const names = new Map();
for (const line of fs.readFileSync(csnPath, "utf8").split("\n")) {
  if (!line || line.startsWith("#") || line.startsWith("$")) continue;
  const hr = line.match(/\bHR\s+(\d+)/);
  if (!hr) continue;
  const name = line.slice(0, 18).trim();
  if (!name || name === "_") continue;
  // First name wins; the file is ordered and later rows are variants.
  if (!names.has(Number(hr[1]))) names.set(Number(hr[1]), name);
}

const stars = JSON.parse(fs.readFileSync("src/data/bsc.json", "utf8"));
let named = 0;
for (const s of stars) {
  const proper = names.get(s.hr);
  if (proper) { s.proper = proper; named++; }
}
fs.writeFileSync("src/data/bsc.json", JSON.stringify(stars));
console.log(`\nIAU names found: ${names.size}`);
console.log(`matched to BSC : ${named}`);
console.log(`bsc.json size  : ${(fs.statSync("src/data/bsc.json").size / 1024).toFixed(0)} KB`);
const bright = stars.filter((s) => s.proper && s.mag < 2).map((s) => s.proper);
console.log(`brightest named: ${bright.slice(0, 12).join(", ")}`);

// ---- Messier deep-sky catalogue ----
// SOURCE: d3-celestial data/messier.json (BSD-3-Clause). 110 objects, every one
// named, with magnitudes and common names. Galaxies, nebulae and clusters —
// the classic naked-eye-to-binocular deep sky.
const messierPath = process.argv[4];
if (messierPath) {
  const dso = JSON.parse(fs.readFileSync(messierPath, "utf8"));
  const TYPE_LABEL = {
    g: "galaxy", s: "galaxy", e: "galaxy", i: "galaxy",
    oc: "open cluster", gc: "globular cluster",
    pn: "planetary nebula", snr: "supernova remnant",
    bn: "nebula", en: "nebula", rn: "nebula", dn: "nebula", sfr: "nebula",
    pos: "asterism",
  };
  const objects = dso.features.map((f) => {
    const [ra, dec] = f.geometry.coordinates;
    return {
      id: f.properties.name,
      name: f.properties.alt || f.properties.name,
      ra: ((ra % 360) + 360) % 360,
      dec,
      mag: typeof f.properties.mag === "number" ? f.properties.mag : 99,
      kind: TYPE_LABEL[f.properties.type] ?? "deep sky",
    };
  });
  fs.writeFileSync("src/data/messier.json", JSON.stringify(objects));
  const galaxies = objects.filter((o) => o.kind === "galaxy").length;
  console.log(`\nmessier objects: ${objects.length} (${galaxies} galaxies)`);
  console.log(`size           : ${(fs.statSync("src/data/messier.json").size / 1024).toFixed(0)} KB`);
  console.log(`named sample   : ${objects.filter(o => o.name !== o.id).slice(0, 6).map(o => o.name).join(", ")}`);
}
