import { test } from "node:test";
import assert from "node:assert/strict";
import * as Astronomy from "astronomy-engine";
import {
  equatorialToHorizontal,
  greenwichMeanSiderealTime,
  localSiderealTime,
  projectToDisc,
  projectToView,
  normalizeAzimuth,
  clampAltitude,
  visibleStars,
} from "@/lib/astronomy/skyTransform";
import {
  buildSkySphere,
  makeCameraBasis,
  projectSphere,
  projectVector,
  anchorTransform,
  CONSTELLATION_ART_TILE,
  CONSTELLATION_ART_COLS,
} from "@/lib/astronomy/skySphere";
import { CONSTELLATION_NAMES } from "@/data/constellationNames";
import catalog from "@/data/bsc.json";
import type { Star } from "@/types";

const STARS: Star[] = catalog as Star[];

/**
 * The transform is cross-validated against astronomy-engine — a separate,
 * independently written implementation. Asserting my own arithmetic against
 * numbers I derived from the same arithmetic would prove nothing; agreeing with
 * a different codebase to a small tolerance is real evidence.
 *
 * Both sides treat catalog J2000 coordinates as of-date (spec §6.6 skips
 * precession deliberately), so the comparison isolates sidereal time and the
 * spherical trigonometry, which is exactly what is under test.
 */

const SITES = [
  { name: "Tokyo", lat: 35.6762, lon: 139.6503 },
  { name: "Greenwich", lat: 51.4779, lon: 0 },
  { name: "Sydney", lat: -33.8688, lon: 151.2093 },
  { name: "Quito (equator)", lat: -0.1807, lon: -78.4678 },
  { name: "Tromso (arctic)", lat: 69.6492, lon: 18.9553 },
];

const EPOCHS = [
  new Date(Date.UTC(1990, 2, 15, 3, 20)),
  new Date(Date.UTC(2015, 8, 27, 15, 0)),
  new Date(Date.UTC(2026, 5, 1, 12, 0)),
  new Date(Date.UTC(2050, 11, 31, 23, 45)),
];

const TARGETS = [
  { name: "Sirius", ra: 101.2871, dec: -16.7161 },
  { name: "Vega", ra: 279.2347, dec: 38.7836 },
  { name: "Polaris", ra: 37.9529, dec: 89.2642 },
  { name: "Acrux", ra: 186.6496, dec: -63.0991 },
  { name: "Betelgeuse", ra: 88.7929, dec: 7.4071 },
];

test("agrees with astronomy-engine across sites, epochs and targets", () => {
  let worst = 0;
  let worstCase = "";
  let comparisons = 0;

  for (const site of SITES) {
    const observer = new Astronomy.Observer(site.lat, site.lon, 0);
    for (const when of EPOCHS) {
      for (const t of TARGETS) {
        const mine = equatorialToHorizontal(
          t.ra,
          t.dec,
          site.lat,
          site.lon,
          when
        );
        // astronomy-engine takes RA in HOURS; null = geometric, no refraction.
        const theirs = Astronomy.Horizon(
          when,
          observer,
          t.ra / 15,
          t.dec,
          null as any
        );

        const dAlt = Math.abs(mine.altitudeDeg - theirs.altitude);

        // Azimuth is meaningless near the zenith and wraps at 360.
        let dAz = Math.abs(mine.azimuthDeg - theirs.azimuth);
        if (dAz > 180) dAz = 360 - dAz;
        const nearZenith = Math.abs(mine.altitudeDeg) > 89;
        const delta = nearZenith ? dAlt : Math.max(dAlt, dAz);

        comparisons++;
        if (delta > worst) {
          worst = delta;
          worstCase = `${t.name} @ ${site.name} ${when.toISOString()}`;
        }
      }
    }
  }

  assert.ok(comparisons === 100, `expected 100 comparisons, ran ${comparisons}`);
  assert.ok(
    worst < 0.02,
    `worst disagreement ${worst.toFixed(4)}° at ${worstCase} (limit 0.02°)`
  );
});

test("GMST matches astronomy-engine sidereal time", () => {
  for (const when of EPOCHS) {
    const mineHours = greenwichMeanSiderealTime(when) / 15;
    const theirs = Astronomy.SiderealTime(when); // hours
    let d = Math.abs(mineHours - theirs);
    if (d > 12) d = 24 - d;
    assert.ok(
      d * 15 < 0.01,
      `GMST differs by ${(d * 15).toFixed(5)}° at ${when.toISOString()}`
    );
  }
});

test("azimuth is north-based clockwise", () => {
  // A star on the meridian south of an observer must sit at azimuth ~180.
  const when = new Date(Date.UTC(2026, 0, 1, 0, 0));
  const lat = 40;
  const lst = localSiderealTime(when, 0);
  const south = equatorialToHorizontal(lst, lat - 30, lat, 0, when);
  assert.ok(
    Math.abs(south.azimuthDeg - 180) < 0.5,
    `expected ~180 due south, got ${south.azimuthDeg.toFixed(2)}`
  );
  // ...and one north of the observer at azimuth ~0/360.
  const north = equatorialToHorizontal(lst, lat + 30, lat, 0, when);
  const offNorth = Math.min(north.azimuthDeg, 360 - north.azimuthDeg);
  assert.ok(offNorth < 0.5, `expected ~0 due north, got ${north.azimuthDeg}`);
});

test("Polaris sits near the pole for a northern observer, and never rises in Sydney", () => {
  const when = new Date(Date.UTC(2026, 5, 1, 22, 0));
  const polaris = { ra: 37.9529, dec: 89.2642 };

  const tokyo = equatorialToHorizontal(polaris.ra, polaris.dec, 35.68, 139.65, when);
  // Altitude of the celestial pole equals the observer's latitude.
  assert.ok(
    Math.abs(tokyo.altitudeDeg - 35.68) < 1,
    `Polaris altitude ${tokyo.altitudeDeg.toFixed(2)} should track latitude 35.68`
  );

  const sydney = equatorialToHorizontal(polaris.ra, polaris.dec, -33.87, 151.2, when);
  assert.ok(sydney.altitudeDeg < 0, "Polaris must be below the horizon in Sydney");
});

// ---- Catalog ----

test("catalog parsed correctly from the Yale BSC", () => {
  // Full BSC5 depth (mag <= 6.5). The renderer applies its own per-surface limit.
  assert.ok(STARS.length > 8000, `expected ~8400 stars, got ${STARS.length}`);
  assert.ok(STARS.every((s) => s.ra >= 0 && s.ra < 360), "RA in range");
  assert.ok(STARS.every((s) => s.dec >= -90 && s.dec <= 90), "Dec in range");
  assert.ok(STARS.every((s) => s.mag <= 6.5), "magnitude limit honoured");

  // Spot-check against independently known J2000 positions.
  const sirius = STARS.find((s) => s.hr === 2491)!;
  assert.ok(Math.abs(sirius.ra - 101.287) < 0.01, `Sirius RA ${sirius.ra}`);
  assert.ok(Math.abs(sirius.dec - -16.716) < 0.01, `Sirius Dec ${sirius.dec}`);
  assert.equal(sirius.mag, -1.46);

  const vega = STARS.find((s) => s.hr === 7001)!;
  assert.ok(Math.abs(vega.ra - 279.235) < 0.01, `Vega RA ${vega.ra}`);
  assert.ok(Math.abs(vega.dec - 38.784) < 0.01, `Vega Dec ${vega.dec}`);
});

test("visibleStars culls the hemisphere below the horizon", () => {
  const when = new Date(Date.UTC(2015, 8, 27, 15, 0));
  const visible = visibleStars(STARS, 35.6762, 139.6503, when, 6.5);
  assert.ok(visible.length > 2000, `too few visible: ${visible.length}`);
  assert.ok(
    visible.length < STARS.length * 0.6,
    `too many visible (${visible.length}/${STARS.length}) — culling is broken`
  );
  assert.ok(visible.every((s) => s.altitudeDeg > 0), "all above horizon");
  // Sorted brightest first.
  for (let i = 1; i < visible.length; i++) {
    assert.ok(visible[i].magnitude >= visible[i - 1].magnitude);
  }
});

test("disc projection puts zenith at centre and horizon on the rim", () => {
  const zenith = projectToDisc({ altitudeDeg: 90, azimuthDeg: 0 });
  assert.ok(Math.hypot(zenith.x, zenith.y) < 1e-9, "zenith at centre");

  const horizon = projectToDisc({ altitudeDeg: 0, azimuthDeg: 0 });
  assert.ok(Math.abs(Math.hypot(horizon.x, horizon.y) - 1) < 1e-9, "horizon on rim");

  // North (azimuth 0) must project upward, i.e. negative y in screen space.
  assert.ok(horizon.y < 0, "north points up");
  // A chart of the sky is read looking up, so east sits on the LEFT with north
  // up. This test used to assert east on the right, which mirrors every
  // constellation. See projectToDisc.
  const east = projectToDisc({ altitudeDeg: 0, azimuthDeg: 90 });
  assert.ok(east.x < -0.99, "east points left");
  const west = projectToDisc({ altitudeDeg: 0, azimuthDeg: 270 });
  assert.ok(west.x > 0.99, "west points right");
});

// ---- Immersive-mode camera ----

test("a body dead ahead projects to the centre of the frame", () => {
  const view = { azimuthDeg: 90, altitudeDeg: 20, fovDeg: 60 };
  const p = projectToView(
    { azimuthDeg: 90, altitudeDeg: 20 },
    view,
    400,
    800
  )!;
  assert.ok(p !== null);
  assert.ok(Math.abs(p.x - 200) < 1e-6, `x ${p.x}`);
  assert.ok(Math.abs(p.y - 400) < 1e-6, `y ${p.y}`);
});

test("a body behind the camera is culled", () => {
  const view = { azimuthDeg: 0, altitudeDeg: 0, fovDeg: 60 };
  assert.equal(projectToView({ azimuthDeg: 180, altitudeDeg: 0 }, view, 400, 800), null);
});

test("right of the look direction lands right of centre, higher lands above", () => {
  const view = { azimuthDeg: 0, altitudeDeg: 0, fovDeg: 60 };
  const right = projectToView({ azimuthDeg: 15, altitudeDeg: 0 }, view, 400, 800)!;
  assert.ok(right.x > 200, "east of north should be right of centre");
  assert.ok(Math.abs(right.y - 400) < 1e-6, "same altitude stays level");

  const high = projectToView({ azimuthDeg: 0, altitudeDeg: 15 }, view, 400, 800)!;
  assert.ok(high.y < 400, "higher altitude should be above centre (screen y grows down)");
  assert.ok(Math.abs(high.x - 200) < 1e-6, "same azimuth stays centred");
});

test("field of view controls the scale", () => {
  const target = { azimuthDeg: 10, altitudeDeg: 0 };
  const narrow = projectToView(target, { azimuthDeg: 0, altitudeDeg: 0, fovDeg: 30 }, 400, 800)!;
  const wide = projectToView(target, { azimuthDeg: 0, altitudeDeg: 0, fovDeg: 90 }, 400, 800)!;
  assert.ok(
    narrow.x - 200 > wide.x - 200,
    "a narrower FOV must magnify: same star sits further from centre"
  );
});

test("the horizon stays level regardless of camera elevation", () => {
  // Two stars at equal altitude must project to the same screen y, which is
  // what "camera right stays horizontal" buys us.
  for (const camAlt of [-40, 0, 35, 70]) {
    const view = { azimuthDeg: 0, altitudeDeg: camAlt, fovDeg: 70 };
    const a = projectToView({ azimuthDeg: -20, altitudeDeg: 10 }, view, 400, 800);
    const b = projectToView({ azimuthDeg: 20, altitudeDeg: 10 }, view, 400, 800);
    if (a && b) {
      assert.ok(
        Math.abs(a.y - b.y) < 1e-6,
        `equal-altitude stars differ in y by ${Math.abs(a.y - b.y)} at cam alt ${camAlt}`
      );
    }
  }
});

test("azimuth normalisation and altitude clamping", () => {
  assert.equal(normalizeAzimuth(-90), 270);
  assert.equal(normalizeAzimuth(450), 90);
  assert.equal(clampAltitude(120), 88);
  assert.equal(clampAltitude(-120), -88);
});

// ---- Precomputed sphere (immersive rendering path) ----

test("sky sphere holds unit vectors and matches the direct transform", () => {
  const when = new Date(Date.UTC(2015, 8, 27, 15, 0));
  const loc = { latitude: 35.6762, longitude: 139.6503 };
  const sphere = buildSkySphere(STARS, loc, when, 6.5);

  assert.ok(sphere.count > 8000, `expected the full catalog, got ${sphere.count}`);

  for (let i = 0; i < sphere.count; i += 500) {
    const x = sphere.vec[i * 3];
    const y = sphere.vec[i * 3 + 1];
    const z = sphere.vec[i * 3 + 2];
    assert.ok(Math.abs(Math.hypot(x, y, z) - 1) < 1e-5, "vectors must be unit length");

    // Cross-check one against the direct transform it was built from.
    const star = STARS.find((s) => s.hr === sphere.hr[i])!;
    const h = equatorialToHorizontal(star.ra, star.dec, loc.latitude, loc.longitude, when);
    assert.ok(
      Math.abs(Math.asin(z) * (180 / Math.PI) - h.altitudeDeg) < 1e-3,
      "sphere altitude must match equatorialToHorizontal"
    );
  }
});

test("the sphere keeps the whole sky, including below the horizon", () => {
  const when = new Date(Date.UTC(2015, 8, 27, 15, 0));
  const sphere = buildSkySphere(
    STARS,
    { latitude: 35.6762, longitude: 139.6503 },
    when,
    6.5
  );
  let below = 0;
  for (let i = 0; i < sphere.count; i++) if (sphere.vec[i * 3 + 2] < 0) below++;
  assert.ok(
    below > sphere.count * 0.3,
    `expected a full hemisphere below the horizon, got ${below}/${sphere.count}`
  );
});

test("projection is allocation-free and respects the buffer bound", () => {
  const when = new Date(Date.UTC(2015, 8, 27, 15, 0));
  const sphere = buildSkySphere(
    STARS,
    { latitude: 35.6762, longitude: 139.6503 },
    when,
    6.5
  );
  const cam = makeCameraBasis(180, 30, 65, 400);
  const out = new Float32Array(300); // deliberately small
  const n = projectSphere(sphere, cam, 400, 800, out, 6.5);
  assert.ok(n * 3 <= out.length, `wrote ${n * 3} floats into a ${out.length} buffer`);
  for (let i = 0; i < n; i++) {
    assert.ok(Number.isFinite(out[i * 3]) && Number.isFinite(out[i * 3 + 1]));
    assert.ok(out[i * 3 + 2] > 0, "radius must be positive");
  }
});

test("looking down shows a different sky than looking up", () => {
  // The regression guard for "I point the phone anywhere and see the same thing".
  const when = new Date(Date.UTC(2015, 8, 27, 15, 0));
  const sphere = buildSkySphere(
    STARS,
    { latitude: 35.6762, longitude: 139.6503 },
    when,
    6.5
  );
  const out = new Float32Array(sphere.count * 3);

  const up = projectSphere(sphere, makeCameraBasis(180, 70, 65, 400), 400, 800, out, 5.5);
  const upFirst = [out[0], out[1]];
  const down = projectSphere(sphere, makeCameraBasis(180, -70, 65, 400), 400, 800, out, 5.5);
  const downFirst = [out[0], out[1]];

  assert.ok(up > 0 && down > 0, "both directions should show stars");
  assert.notDeepEqual(upFirst, downFirst, "up and down must not render identically");
});

// ---------------------------------------------------------------------------
// WHAT THE SPHERE DECIDES TO SHOW
// ---------------------------------------------------------------------------

// Tokyo at local midnight on the eve of the 2015 total lunar eclipse.
const TOKYO = { latitude: 35.6762, longitude: 139.6503 };
const NIGHT = new Date("2015-09-27T15:00:00Z");

test("constellation figures are grouped and named", () => {
  const sphere = buildSkySphere(STARS, TOKYO, NIGHT, 6.2);

  // 89 entries for 88 constellations: Serpens is drawn as two figures, because
  // Ophiuchus splits it across the sky. Both halves take the name "Serpens".
  assert.equal(sphere.figures.length, 89);
  assert.equal(new Set(sphere.figures.map((c) => c.id)).size, 88);
  assert.equal(sphere.figures.filter((c) => c.id === "Ser").length, 2);

  const orion = sphere.figures.find((c) => c.id === "Ori");
  assert.ok(orion, "Orion must be present");
  assert.equal(orion.name, "Orion", "abbreviations are resolved to real names");
  assert.ok(orion.lines.length > 0);

  // The centroid must be a unit vector, or the dot product against the camera
  // forward stops being a cosine and the fade threshold means nothing.
  for (const con of sphere.figures) {
    const len = Math.hypot(...con.centroid);
    assert.ok(
      Math.abs(len - 1) < 1e-5,
      `${con.id} centroid is not a unit vector (length ${len})`
    );
    // Ara and Leo are their own full names, so compare against the map rather
    // than asserting the name differs from the abbreviation.
    assert.equal(
      con.name,
      CONSTELLATION_NAMES[con.id],
      `${con.id} did not resolve through the IAU name map`
    );
  }
});

test("the centroid lands inside the figure it names", () => {
  const sphere = buildSkySphere(STARS, TOKYO, NIGHT, 6.2);

  // Averaging unit vectors, rather than azimuths, is what keeps this true for
  // figures that straddle the azimuth seam. Ursa Minor contains the pole and is
  // the worst case: every azimuth appears in it.
  for (const id of ["Ori", "UMi", "Cas", "Cru"]) {
    const con = sphere.figures.find((c) => c.id === id);
    assert.ok(con, `${id} must be present`);

    let worst = 1;
    for (const line of con.lines) {
      for (let i = 0; i < line.length; i += 3) {
        const dot =
          line[i] * con.centroid[0] +
          line[i + 1] * con.centroid[1] +
          line[i + 2] * con.centroid[2];
        worst = Math.min(worst, dot);
      }
    }
    const spread = (Math.acos(Math.max(-1, worst)) * 180) / Math.PI;
    assert.ok(
      spread < 90,
      `${id}: centroid is ${spread.toFixed(1)}° from its furthest vertex`
    );
  }
});

test("every star a figure is drawn through carries a name, and sits on a vertex", () => {
  const sphere = buildSkySphere(STARS, TOKYO, NIGHT, 6.2);
  const ids = new Set(sphere.figures.map((f) => f.id));
  assert.equal(ids.size, 88);

  for (const id of ids) {
    const parts = sphere.figures.filter((f) => f.id === id);
    const stars = parts.flatMap((f) => f.stars);
    const vertices = parts.flatMap((f) => f.lines.flatMap((l) => Array.from({ length: l.length / 3 }, (_, i) => [l[i * 3], l[i * 3 + 1], l[i * 3 + 2]])));
    assert.ok(stars.length >= 2, `${id} has ${stars.length} named stars`);
    for (const st of stars) {
      assert.ok(st.label.trim().length > 0, `${id}: an unnamed star`);
      // Every label must land on the line, or it names empty sky.
      const nearest = Math.max(...vertices.map((v) => v[0] * st.vec[0] + v[1] * st.vec[1] + v[2] * st.vec[2]));
      assert.ok(nearest > Math.cos((0.1 * Math.PI) / 180), `${id}: ${st.label} is off its figure`);
    }
    for (const v of vertices) {
      const nearest = Math.max(...stars.map((st) => v[0] * st.vec[0] + v[1] * st.vec[1] + v[2] * st.vec[2]));
      assert.ok(nearest > Math.cos((0.1 * Math.PI) / 180), `${id}: a vertex with no label`);
    }
  }

  const orion = sphere.figures.find((f) => f.id === "Ori")!.stars.map((s) => s.label);
  for (const name of ["Betelgeuse", "Rigel", "Bellatrix", "Alnilam", "η", "π⁴"]) {
    assert.ok(orion.includes(name), `Orion should name ${name}`);
  }
});

test("the illustrations cover the whole pack", () => {
  const sphere = buildSkySphere(STARS, TOKYO, NIGHT, 6.2);
  const without = sphere.figures.filter((f) => !f.art).map((f) => f.id);
  // Stellarium draws Puppis and Vela inside Argo Navis, and Serpens has none.
  assert.deepEqual([...new Set(without)].sort(), ["Pup", "Ser", "Vel"]);
});

test("the star density cut keeps three quarters of the catalogue", () => {
  // The immersive view builds its sphere at 6.2 rather than the catalogue's 6.5.
  const full = buildSkySphere(STARS, TOKYO, NIGHT, 6.5);
  const shown = buildSkySphere(STARS, TOKYO, NIGHT, 6.2);

  const ratio = shown.count / full.count;
  assert.ok(
    ratio > 0.74 && ratio < 0.76,
    `expected about 75% of the catalogue, got ${(ratio * 100).toFixed(1)}%`
  );

  // Every star anyone has a name for must survive the cut.
  assert.equal(
    shown.labels.length,
    full.labels.length,
    "the density cut must not drop a named star"
  );
});

// ---------------------------------------------------------------------------
// CONSTELLATION ARTWORK
// ---------------------------------------------------------------------------

test("artwork data is well formed and fits its sheet", () => {
  const sphere = buildSkySphere(STARS, TOKYO, NIGHT, 6.2);
  const withArt = sphere.figures.filter((c) => c.art);

  assert.equal(withArt.length, 85, "every illustration in the pack");
  const rows = Math.ceil(withArt.length / CONSTELLATION_ART_COLS);

  const seen = new Set<string>();
  for (const con of withArt) {
    const art = con.art!;
    const [col, row] = art.tile;
    const key = `${col},${row}`;
    assert.ok(!seen.has(key), `${con.id} shares tile ${key} with another figure`);
    seen.add(key);
    assert.ok(col >= 0 && col < CONSTELLATION_ART_COLS, `${con.id} column out of sheet`);
    assert.ok(row >= 0 && row < rows, `${con.id} row out of sheet`);

    assert.equal(art.anchors.length, 3, `${con.id} needs exactly three anchors`);
    for (const a of art.anchors) {
      assert.ok(a.u >= 0 && a.u <= 1, `${con.id} anchor u out of range`);
      assert.ok(a.v >= 0 && a.v <= 1, `${con.id} anchor v out of range`);
      const len = Math.hypot(...a.vec);
      assert.ok(Math.abs(len - 1) < 1e-5, `${con.id} anchor is not a unit vector`);
    }
  }

  // Orion has to be there or the whole exercise was pointless.
  assert.ok(withArt.some((c) => c.id === "Ori"));
});

test("the anchor transform puts each anchor exactly where it projects", () => {
  const sphere = buildSkySphere(STARS, TOKYO, NIGHT, 6.2);
  const tile = CONSTELLATION_ART_TILE;
  const W = 400, H = 800;

  let checked = 0;
  for (const con of sphere.figures) {
    if (!con.art) continue;

    // Look straight at the figure, so all three anchors are in front.
    const [e, n, u] = con.art.anchors[1].vec;
    const alt = (Math.asin(u) * 180) / Math.PI;
    const az = (Math.atan2(e, n) * 180) / Math.PI;
    const cam = makeCameraBasis(az, alt, 90, W);

    const m = anchorTransform(con.art, cam, W, H, tile);
    if (!m) continue;
    const [a, b, c, d, ee, f] = m;

    for (const anchor of con.art.anchors) {
      const want = projectVector(anchor.vec, cam, W, H);
      assert.ok(want, `${con.id}: anchor should be in front of the camera`);
      const x = a * anchor.u * tile + b * anchor.v * tile + c;
      const y = d * anchor.u * tile + ee * anchor.v * tile + f;
      assert.ok(
        Math.hypot(x - want.x, y - want.y) < 1e-6,
        `${con.id}: anchor lands at ${x.toFixed(2)},${y.toFixed(2)} not ${want.x.toFixed(2)},${want.y.toFixed(2)}`
      );
    }
    checked++;
  }
  assert.ok(checked >= 10, `only ${checked} figures were transformable`);
});

test("the anchor transform refuses to place a figure it cannot see", () => {
  const sphere = buildSkySphere(STARS, TOKYO, NIGHT, 6.2);
  const orion = sphere.figures.find((c) => c.id === "Ori");
  assert.ok(orion?.art);

  // Face the exact opposite direction. With every anchor behind the camera
  // there is no honest placement, and a fitted affine would smear the figure
  // across the sphere rather than simply not draw.
  const [e, n, u] = orion.art.anchors[0].vec;
  const alt = (Math.asin(u) * 180) / Math.PI;
  const az = (Math.atan2(e, n) * 180) / Math.PI;
  const behind = makeCameraBasis((az + 180) % 360, -alt, 60, 400);

  assert.equal(anchorTransform(orion.art, behind, 400, 800, CONSTELLATION_ART_TILE), null);
});
