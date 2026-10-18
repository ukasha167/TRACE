/**
 * Names every star a constellation figure is drawn through.
 *
 *   node scripts/build-constellation-stars.mjs
 *
 * Reads src/data/constellations.json and src/data/bsc.json, both already in
 * the repository, and writes src/data/constellationStars.json. No network.
 *
 * A figure's vertices are star positions, but the line data carries no star
 * identity, only coordinates. Each vertex is matched to the nearest Yale
 * Bright Star Catalogue entry within MATCH_DEG, and the star is labelled the
 * way a chart labels it:
 *
 *   1. its IAU proper name, "Betelgeuse"
 *   2. else its Bayer letter, "γ", with the superscript a chart uses for a
 *      lettered pair, "κ¹"
 *   3. else its Flamsteed number, "47"
 *   4. else its Bright Star number, "HR 1234", which every vertex has
 *
 * so no vertex goes unnamed. The build fails if any vertex has no catalogue
 * star near it, because a label on the wrong star is worse than none.
 *
 * OUTPUT. { [IAU abbreviation]: [ra, dec, mag, label][] }, degrees, J2000.
 * Positions are the catalogue's, not the line data's, so a label sits on the
 * star the view draws.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const LINES = path.join(ROOT, "src/data/constellations.json");
const CATALOG = path.join(ROOT, "src/data/bsc.json");
const OUT = path.join(ROOT, "src/data/constellationStars.json");

/**
 * The line data and the catalogue are independent reductions of the same
 * stars, and agree to a few arcseconds. A tenth of a degree is far wider than
 * that and far narrower than the gap to any neighbour bright enough to be a
 * figure star.
 */
const MATCH_DEG = 0.1;

const GREEK = {
  Alp: "α", Bet: "β", Gam: "γ", Del: "δ", Eps: "ε", Zet: "ζ", Eta: "η", The: "θ",
  Iot: "ι", Kap: "κ", Lam: "λ", Mu: "μ", Nu: "ν", Xi: "ξ", Omi: "ο", Pi: "π",
  Rho: "ρ", Sig: "σ", Tau: "τ", Ups: "υ", Phi: "φ", Chi: "χ", Psi: "ψ", Ome: "ω",
};
const SUPERSCRIPT = ["⁰", "¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹"];

/**
 * The catalogue's `name` is the BSC designation with its fixed columns
 * squeezed: Flamsteed number, Bayer abbreviation, superscript, constellation.
 * "21Alp And", "Kap1Scl", "33 Psc", "Mu 2Boo".
 */
export function chartLabel(star) {
  if (star.proper) return star.proper;
  const m = /^(\d+)?\s*([A-Z][a-z]{1,2})?\s*(\d)?\s*[A-Z][A-Za-z]{2}$/.exec(star.name ?? "");
  if (m && m[2] && GREEK[m[2]]) return GREEK[m[2]] + (m[3] ? SUPERSCRIPT[Number(m[3])] : "");
  if (m && m[1]) return m[1];
  return `HR ${star.hr}`;
}

const DEG = Math.PI / 180;
const unit = (ra, dec) => [Math.cos(dec * DEG) * Math.cos(ra * DEG), Math.cos(dec * DEG) * Math.sin(ra * DEG), Math.sin(dec * DEG)];

const main = () => {
  const lines = JSON.parse(fs.readFileSync(LINES, "utf8"));
  const catalog = JSON.parse(fs.readFileSync(CATALOG, "utf8"));
  const vecs = catalog.map((s) => unit(s.ra, s.dec));
  const cosMax = Math.cos(MATCH_DEG * DEG);

  const out = {};
  const seenById = new Map();
  const misses = [];
  // Serpens comes as two entries, head and tail, under one id.
  for (const con of lines) {
    if (!seenById.has(con.id)) seenById.set(con.id, new Set());
    const seen = seenById.get(con.id);
    const stars = (out[con.id] ??= []);
    for (const line of con.lines) {
      for (let i = 0; i < line.length; i += 2) {
        const v = unit(line[i], line[i + 1]);
        let best = -1;
        let bestDot = cosMax;
        for (let k = 0; k < catalog.length; k++) {
          const w = vecs[k];
          const dot = v[0] * w[0] + v[1] * w[1] + v[2] * w[2];
          if (dot > bestDot) { bestDot = dot; best = k; }
        }
        if (best < 0) { misses.push(`${con.id} ${line[i].toFixed(3)} ${line[i + 1].toFixed(3)}`); continue; }
        if (seen.has(best)) continue;
        seen.add(best);
        const s = catalog[best];
        stars.push([s.ra, s.dec, s.mag, chartLabel(s)]);
      }
    }
  }
  let total = 0;
  for (const stars of Object.values(out)) {
    // Brightest first, so when two labels collide the brighter star keeps its name.
    stars.sort((a, b) => a[2] - b[2]);
    total += stars.length;
  }
  if (misses.length) {
    throw new Error(`${misses.length} figure vertices have no catalogue star within ${MATCH_DEG} degrees:\n  ${misses.join("\n  ")}`);
  }
  fs.writeFileSync(OUT, JSON.stringify(out) + "\n");
  console.log(`wrote ${OUT}: ${total} stars across ${Object.keys(out).length} figures`);
};

main();
