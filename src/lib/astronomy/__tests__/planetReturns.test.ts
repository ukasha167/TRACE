import { test } from "node:test";
import assert from "node:assert/strict";
import { planetReturns, geocentricLongitude } from "@/lib/astronomy/planetReturns";

// The 2000-01-21 total lunar eclipse night again: impersonal and well documented.
const night = new Date(Date.UTC(2000, 0, 21, 0));
const YEAR = 365.25 * 86_400_000;

test("Jupiter comes back to the same stars about twelve years on, and each return lands on the spot", () => {
  const r = planetReturns("Jupiter", night, new Date(Date.UTC(2026, 9, 1)));
  const target = geocentricLongitude("Jupiter", night);
  assert.ok(r.returns.length >= 3, `returns ${r.returns.length}`);
  for (const d of r.returns) {
    const off = Math.abs(((geocentricLongitude("Jupiter", d) - target + 540) % 360) - 180);
    assert.ok(off < 0.01, `off by ${off}° at ${d.toISOString()}`);
  }
  const firstGap = (r.returns[0].getTime() - night.getTime()) / YEAR;
  assert.ok(firstGap > 10.8 && firstGap < 12.9, `first return after ${firstGap} years`);
});

test("a retrograde loop is one return, not three", () => {
  const r = planetReturns("Jupiter", night, new Date(Date.UTC(2040, 0, 1)));
  for (let i = 1; i < r.returns.length; i++) {
    const gap = (r.returns[i].getTime() - r.returns[i - 1].getTime()) / YEAR;
    assert.ok(gap > 10, `returns ${gap} years apart`);
  }
});

test("Saturn's first return is about thirty years on", () => {
  const r = planetReturns("Saturn", night, new Date(Date.UTC(2026, 9, 1)));
  const gap = (r.returns[0].getTime() - night.getTime()) / YEAR;
  // The mean period is 29.46 years, but the first crossing can come early: the
  // retrograde loop before the planet settles brings it to the spot months
  // ahead. For this night it is 28.5.
  assert.ok(gap > 28 && gap < 31, `Saturn back after ${gap} years`);
  assert.equal(typeof r.constellation, "string");
});
