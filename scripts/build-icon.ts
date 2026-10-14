/**
 * Renders the app icon, the Android adaptive layers, the splash mark and the
 * favicon from the moon maps, with the same lighting the app draws.
 *
 *   assets/images/icon.png                    1024, iOS and the store
 *   assets/images/android-icon-foreground.png 1024, moon inside the safe circle
 *   assets/images/android-icon-background.png 1024, black
 *   assets/images/android-icon-monochrome.png 1024, the lit crescent in white
 *   assets/images/splash-icon.png             1024, the moon alone on transparent
 *   assets/images/favicon.png                 48
 *
 * WHICH MOON. A thin waxing crescent with its earthshine, lit from the lower
 * right. It was picked from three in the prototype. It is not any record's moon
 * and claims no date: an icon is a mark, and the only rule it follows is the
 * lighting model, so the icon cannot look like a different moon from the one
 * the app opens on.
 *
 * WHY IT DUPLICATES THE SHADER. The SkSL in components/moon/moonShader.ts runs
 * inside Skia, which does not run in Node. This is that shader's per-pixel
 * arithmetic in TypeScript, reading the same geometry from moonLighting.ts and
 * the same darkroom constants, copied below with a note. Change one, change
 * both, and rebuild.
 *
 * Usage:  npx tsx scripts/build-icon.ts
 */
import fs from "node:fs";
import { PNG } from "pngjs";
import {
  lunarLambertL,
  sunDirection,
  earthshineGain,
  earthshineTerm,
  printExposure,
} from "../src/lib/astronomy/moonLighting";
import { generateStarField } from "../src/components/moon/starGrain";
import { Colors } from "../src/constants/theme";

// ---- Must match components/moon/moonShader.ts ----
const MINERAL_SATURATION = 9.0;
const PRINT_CONTRAST = 1.5;
const ALBEDO_MID = 0.6227;
const ALBEDO_WHITE: [number, number, number] = [1.0134, 1.0003, 0.9578];
const RELIEF = 1.0;
// Hero glow, from components/moon/moonUniforms.ts.
const GLOW = 0.16, HALO = 0.3, HALO_W = 0.045, HALO_FAR = 0.09, HALO_WIDE = 0.22;

// ---- The icon's moon ----
const PHASE_FRACTION = 0.14;
/** Clockwise from the right, y down: 35 puts the lit limb at the lower right. */
const LIT_ROTATION_DEG = 35;

const rgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255,
];
const TINT = rgb(Colors.moonlight);
const EARTH = rgb(Colors.earthshine);

const albedoMap = PNG.sync.read(fs.readFileSync("assets/moon_disc.png"));
const normalMap = PNG.sync.read(fs.readFileSync("assets/moon_normal.png"));

function sample(img: PNG, u: number, v: number, out: number[]) {
  const x = Math.min(img.width - 1.001, Math.max(0, u * img.width - 0.5));
  const y = Math.min(img.height - 1.001, Math.max(0, v * img.height - 0.5));
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  for (let c = 0; c < 3; c++) {
    const at = (xx: number, yy: number) => img.data[(yy * img.width + xx) * 4 + c] / 255;
    const top = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx;
    const bot = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx;
    out[c] = top * (1 - fy) + bot * fy;
  }
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * One moon into an RGBA buffer, premultiplied over what is there, the way the
 * shader composites its disc over its halo. `litOnly` writes the lit area as
 * white alpha and nothing else, for the monochrome layer.
 */
function drawMoon(
  png: PNG,
  cx: number,
  cy: number,
  r: number,
  opts: { halo: boolean; litOnly?: boolean }
) {
  const sun = sunDirection(PHASE_FRACTION, LIT_ROTATION_DEG);
  const L = lunarLambertL(sun.phaseAngle);
  const exposure = printExposure(PHASE_FRACTION);
  const earthGain = earthshineGain(PHASE_FRACTION);
  const aa = 1.2 / r;
  const tex = [0, 0, 0], nrm = [0, 0, 0];

  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const px = (x + 0.5 - cx) / r, py = (y + 0.5 - cy) / r;
      const rr = Math.hypot(px, py);
      if (rr > (opts.halo ? 2.2 : 1.02)) continue;
      const i = (y * png.width + x) * 4;

      // Halo behind the disc, gated on sunlit ground in this direction.
      const dx = px / Math.max(rr, 1e-6), dy = py / Math.max(rr, 1e-6);
      const qx = dx * 0.97, qy = dy * 0.97, qz = Math.sqrt(Math.max(0, 1 - qx * qx - qy * qy));
      const around = smooth(0, 0.22, qx * sun.x + qy * sun.y + qz * sun.z);
      const dr = Math.max(rr - 1, 0);
      const haloA = opts.halo ? around * (HALO * Math.exp(-dr / HALO_W) + HALO_FAR * Math.exp(-dr / HALO_WIDE)) : 0;
      const cov = 1 - smooth(1 - aa, 1 + aa, rr);

      let col = [0, 0, 0];
      let lit = 0;
      if (cov > 0) {
        const z = Math.sqrt(Math.max(0, 1 - Math.min(rr, 1) ** 2));
        sample(albedoMap, px * 0.5 + 0.5, py * 0.5 + 0.5, tex);
        sample(normalMap, px * 0.5 + 0.5, py * 0.5 + 0.5, nrm);
        const reliefAmt = RELIEF * smooth(1.0, 0.82, rr);
        let nx = px + (nrm[0] * 2 - 1 - px) * reliefAmt;
        let ny = py + (nrm[1] * 2 - 1 - py) * reliefAmt;
        let nz = z + (nrm[2] * 2 - 1 - z) * reliefAmt;
        const nl = Math.hypot(nx, ny, nz) || 1;
        nx /= nl; ny /= nl; nz /= nl;
        const mu0 = nx * sun.x + ny * sun.y + nz * sun.z;
        const mu = z;

        let albedo = tex.map((v, c) => v / ALBEDO_WHITE[c]);
        const grey = 0.2126 * albedo[0] + 0.7152 * albedo[1] + 0.0722 * albedo[2];
        albedo = albedo.map((v) => grey + (v - grey) * MINERAL_SATURATION);
        albedo = albedo.map((v, c) => Math.max(ALBEDO_MID + (v - ALBEDO_MID) * PRINT_CONTRAST, 0) * TINT[c]);

        const l = Math.max(mu0, 0);
        const shade = Math.min((2 * L * l) / Math.max(l + mu, 1e-4) + (1 - L) * l, 1.35);
        lit = shade;
        const earth = earthshineTerm(mu0, mu);
        col = albedo.map((a, c) => a * shade + EARTH[c] * earthGain * earth * (0.55 + 0.45 * grey));
        const glow = GLOW * Math.pow(1 - mu, 3) * smooth(0, 0.25, shade);
        col = col.map((v, c) => v + TINT[c] * glow);
        const lum = 0.2126 * col[0] + 0.7152 * col[1] + 0.0722 * col[2];
        const toned = 1 - Math.exp(-exposure * lum);
        col = col.map((v) => Math.min(v * (toned / Math.max(lum, 1e-4)), 1));
      }

      if (opts.litOnly) {
        const a = cov * smooth(0.02, 0.12, lit);
        png.data[i] = png.data[i + 1] = png.data[i + 2] = 255;
        png.data[i + 3] = Math.round(Math.max(png.data[i + 3] / 255, a) * 255);
        continue;
      }
      // Disc over halo, then that over whatever is already in the buffer.
      const srcA = cov + haloA * (1 - cov);
      const src = [0, 1, 2].map((c) => col[c] * cov + TINT[c] * haloA * (1 - cov));
      const dstA = png.data[i + 3] / 255;
      for (let c = 0; c < 3; c++) {
        const dst = (png.data[i + c] / 255) * dstA;
        png.data[i + c] = Math.round(Math.min(1, src[c] + dst * (1 - srcA)) / Math.max(srcA + dstA * (1 - srcA), 1e-6) * 255);
      }
      png.data[i + 3] = Math.round((srcA + dstA * (1 - srcA)) * 255);
    }
  }
}

function canvas(size: number, fill: string | null): PNG {
  const png = new PNG({ width: size, height: size });
  const c = fill ? rgb(fill) : [0, 0, 0];
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = c[0] * 255;
    png.data[i + 1] = c[1] * 255;
    png.data[i + 2] = c[2] * 255;
    png.data[i + 3] = fill ? 255 : 0;
  }
  return png;
}

/** The decorative grain every plate in the app draws, at icon scale. */
function grain(png: PNG) {
  const stars = generateStarField({ width: png.width, height: png.height, scale: png.width / 400 });
  for (const s of stars) {
    const c = rgb(s.color);
    const rad = s.r * 1.4;
    for (let y = Math.floor(s.y - rad - 2); y <= s.y + rad + 2; y++) {
      for (let x = Math.floor(s.x - rad - 2); x <= s.x + rad + 2; x++) {
        if (x < 0 || y < 0 || x >= png.width || y >= png.height) continue;
        const a = s.a * (1 - smooth(rad * 0.4, rad + 1, Math.hypot(x + 0.5 - s.x, y + 0.5 - s.y)));
        const i = (y * png.width + x) * 4;
        for (let k = 0; k < 3; k++) png.data[i + k] = Math.round(png.data[i + k] * (1 - a) + c[k] * 255 * a);
      }
    }
  }
}

const write = (png: PNG, path: string) => {
  fs.writeFileSync(path, PNG.sync.write(png));
  console.log("wrote", path);
};

const S = 1024;

// The icon: black, the grain, the crescent a little left of centre so the lit
// limb has room before the corner mask.
const icon = canvas(S, Colors.space);
grain(icon);
drawMoon(icon, S * 0.46, S * 0.5, S * 0.37, { halo: true });
write(icon, "assets/images/icon.png");

// Android's adaptive mask keeps the centre 66%, so the moon shrinks into it.
const fg = canvas(S, null);
drawMoon(fg, S * 0.48, S * 0.5, S * 0.25, { halo: true });
write(fg, "assets/images/android-icon-foreground.png");
const bg = canvas(S, Colors.space);
grain(bg);
write(bg, "assets/images/android-icon-background.png");
const mono = canvas(S, null);
drawMoon(mono, S * 0.48, S * 0.5, S * 0.25, { halo: false, litOnly: true });
write(mono, "assets/images/android-icon-monochrome.png");

// The splash: the moon alone, on the splash's own black.
const splash = canvas(S, null);
drawMoon(splash, S * 0.5, S * 0.5, S * 0.36, { halo: true });
write(splash, "assets/images/splash-icon.png");

// Favicon, box-filtered down from the icon.
const fav = new PNG({ width: 48, height: 48 });
const k = S / 48;
for (let y = 0; y < 48; y++) {
  for (let x = 0; x < 48; x++) {
    const acc = [0, 0, 0, 0];
    for (let yy = 0; yy < k; yy++) for (let xx = 0; xx < k; xx++) {
      const i = ((y * k + yy) * S + (x * k + xx)) * 4;
      for (let c = 0; c < 4; c++) acc[c] += icon.data[i + c];
    }
    const o = (y * 48 + x) * 4;
    for (let c = 0; c < 4; c++) fav.data[o + c] = Math.round(acc[c] / (k * k));
  }
}
write(fav, "assets/images/favicon.png");
