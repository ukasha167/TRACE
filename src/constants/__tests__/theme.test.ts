import { test } from "node:test";
import assert from "node:assert/strict";
import { Colors, SkyColors } from "@/constants/theme";

/**
 * THE PALETTE IS CHECKED, NOT ARGUED ABOUT.
 *
 * The Keepsake palette shipped with three of these nine pairs below WCAG AA,
 * and the worst was the accent on paper at 3.47:1 — the token that carries
 * every date, every illumination figure and every return year. "The colours
 * feel off" turned out to have a number behind it, and nothing in the build
 * would have caught it.
 *
 * theme.ts imports nothing, so it runs under tsx like the astronomy library
 * does. This is the only test in the suite that is about how the app looks, and
 * it earns its place because a colour swap is exactly the kind of change that
 * gets made quickly and reviewed by eye.
 */

const channels = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

const linearise = (c: number) =>
  c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

/** WCAG 2.1 relative luminance. */
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map(linearise);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * Body text and small labels take AA (4.5). Anything that carries a whole
 * surface, or a photograph's ground, takes AAA (7): those pairs have no excuse,
 * and holding them there is what keeps the app readable outdoors at night.
 */
const PAIRS: [keyof typeof Colors, keyof typeof Colors, number][] = [
  ["ink", "paper", 7],
  ["ink", "paperDim", 7],
  ["inkMuted", "paper", 4.5],
  ["signal", "paper", 4.5],
  ["signal", "paperDim", 4.5],
  ["danger", "paper", 4.5],
  ["paper", "ink", 7],
  ["plateInk", "plate", 7],
  ["plateMuted", "plate", 4.5],
  ["signalOnPlate", "plate", 4.5],
  ["moonlight", "plate", 7],
];

for (const [fg, bg, min] of PAIRS) {
  test(`${fg} on ${bg} clears ${min}:1`, () => {
    const r = contrast(Colors[fg], Colors[bg]);
    assert.ok(
      r >= min,
      `${Colors[fg]} on ${Colors[bg]} is ${r.toFixed(2)}:1, needs ${min}:1`
    );
  });
}

test("hairlines are visible against the surface they divide", () => {
  // Not a text pair, so AA does not apply, but a rule nobody can see is not
  // structure. 1.2:1 is about where a hairline stops registering on a phone.
  assert.ok(contrast(Colors.rule, Colors.paper) >= 1.2);
  assert.ok(contrast(Colors.plateRule, Colors.plate) >= 1.2);
});

test("earthshine sits above the plate without becoming a visible disc", () => {
  // The unlit side of the moon. Below the plate it would punch a hole; far
  // above it, a new moon reads as a grey coin.
  const r = contrast(Colors.earthshine, Colors.plate);
  assert.ok(r > 1.0 && r < 1.6, `earthshine is ${r.toFixed(2)}:1 against the plate`);
});

test("the accent is never red", () => {
  // danger owns red. One colour cannot mean both "this is the important figure"
  // and "this will delete something", and this rule has now outlived two
  // accents. Hue distance is the honest check: an accent that merely differs in
  // lightness from danger still reads as the same warning colour.
  const hue = (hex: string) => {
    const [r, g, b] = channels(hex);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max === min) return 0;
    const d = max - min;
    const h =
      max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return ((h * 60) % 360 + 360) % 360;
  };
  const separation = Math.abs(((hue(Colors.signal) - hue(Colors.danger) + 540) % 360) - 180);
  assert.ok(
    separation > 60,
    `signal and danger are only ${separation.toFixed(0)}° apart in hue`
  );
});

test("planets do not borrow the accent", () => {
  // Regression guard. Planets used to take Colors.signalOnPlate, which was safe
  // while the accent was brass and became a bug the moment it went cool: a
  // planet drawn in the grid's own blue reads as a coordinate line.
  assert.notEqual(SkyColors.planet, Colors.signalOnPlate);
  assert.notEqual(SkyColors.planet, SkyColors.grid);
  assert.notEqual(SkyColors.planet, SkyColors.figure);
});
