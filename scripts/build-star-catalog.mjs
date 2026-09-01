/**
 * Builds src/data/bsc.json from the Yale Bright Star Catalog.
 *
 * SOURCE: Yale Bright Star Catalog, 5th Revised Edition (Hoffleit & Warren 1991),
 *   http://tdc-www.harvard.edu/catalogs/bsc5.dat.gz  — public domain.
 *   Vizier catalogue V/50. 9,110 entries.
 *
 * This script exists so the bundled data is REPRODUCIBLE rather than a blob
 * someone has to trust. Re-run it against a fresh download and you should get a
 * byte-identical file.
 *
 *   node scripts/build-star-catalog.mjs path/to/bsc5.dat
 *
 * Byte offsets are the documented V/50 layout (1-indexed, inclusive) and are
 * verified in the test suite against four stars with independently known
 * J2000 positions.
 */
import fs from "node:fs";

// The full BSC5 depth. Naked eye under a dark sky reaches ~6.5, and the
// immersive view renders the whole catalog — a denser field is most of what
// separates "a picture of stars" from "standing outside". The renderer applies
// its own magnitude limit per surface.
const MAG_LIMIT = 6.5;

const src = process.argv[2];
if (!src) {
  console.error("usage: node scripts/build-star-catalog.mjs <bsc5.dat>");
  process.exit(1);
}

const col = (line, a, b) => line.slice(a - 1, b);
const stars = [];
let skippedNoCoords = 0;
let skippedFaint = 0;

for (const line of fs.readFileSync(src, "utf8").split("\n")) {
  if (line.length < 107) continue;

  const raH = col(line, 76, 77).trim();
  // Deleted/nova entries carry a blank position block.
  if (raH === "") { skippedNoCoords++; continue; }

  const mag = parseFloat(col(line, 103, 107));
  if (!Number.isFinite(mag)) { skippedNoCoords++; continue; }
  if (mag > MAG_LIMIT) { skippedFaint++; continue; }

  const ra =
    (parseInt(raH, 10) +
      parseInt(col(line, 78, 79), 10) / 60 +
      parseFloat(col(line, 80, 83)) / 3600) *
    15; // hours -> degrees

  const sign = col(line, 84, 84) === "-" ? -1 : 1;
  const dec =
    sign *
    (parseInt(col(line, 85, 86), 10) +
      parseInt(col(line, 87, 88), 10) / 60 +
      parseInt(col(line, 89, 90), 10) / 3600);

  const star = {
    hr: parseInt(col(line, 1, 4), 10),
    ra: Number(ra.toFixed(4)),
    dec: Number(dec.toFixed(4)),
    mag: Number(mag.toFixed(2)),
  };

  // Bayer/Flamsteed designation straight from the catalog. Not a proper name —
  // those need a separate sourced mapping, so we don't invent them here.
  const desig = col(line, 5, 14).trim();
  if (desig) star.name = desig.replace(/\s+/g, " ");

  stars.push(star);
}

stars.sort((a, b) => a.hr - b.hr);
fs.writeFileSync("src/data/bsc.json", JSON.stringify(stars));

const bytes = fs.statSync("src/data/bsc.json").size;
console.log(`stars written : ${stars.length}`);
console.log(`skipped faint : ${skippedFaint} (mag > ${MAG_LIMIT})`);
console.log(`skipped nocoord: ${skippedNoCoords}`);
console.log(`brightest     : ${Math.min(...stars.map((s) => s.mag))}`);
console.log(`file size     : ${(bytes / 1024).toFixed(0)} KB`);
