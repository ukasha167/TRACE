import { test } from "node:test";
import assert from "node:assert/strict";
import { revealContent } from "@/lib/astronomy/revealLines";

const greenwich = { latitude: 51.4779, longitude: 0, label: "Greenwich, United Kingdom", timezoneOffsetMin: 0 };

test("the eclipse night reveals as full, with the eclipse as its fact", () => {
  // The 2015-09-28 total lunar eclipse peaked 02:47 UTC, so the evening of the
  // 27th is a full moon night with the eclipse in it.
  const r = revealContent({ date: "2015-09-27", type: "anniversary", location: greenwich }, "2026-10-01");
  assert.equal(r.line1, "Evening of 27 September 2015 · Greenwich");
  assert.match(r.line2, /^Full moon, 99\.\d+%\slit$/);
  assert.match(r.line3!, /^A total lunar eclipse peaked/);
  assert.match(r.line4!, /^1 in \d+\.\d days has a moon at least [\d.]+% lit\./);
});

test("without a place there is no night fact and no tilt, and nothing is invented", () => {
  const r = revealContent({ date: "2015-09-27", type: "birthday", location: null }, "2026-10-01");
  assert.equal(r.line1, "Evening of 27 September 2015");
  assert.equal(r.line3, null);
  assert.equal(r.moon.brightLimbAngleDeg, null);
});

test("ordinary near-full nights lead with the return instead of rarity", () => {
  const r = revealContent({ date: "2015-09-28", type: "birthday", location: greenwich }, "2026-10-01");
  assert.ok(r.moon.phaseFraction < 0.99);
  assert.ok(!r.line4?.startsWith("1 in"));
});

test("a place saved as 0, 0 before decision 4 gets no sky, as on the card", () => {
  const r = revealContent({ date: "2015-09-27", type: "custom", location: { latitude: 0, longitude: 0, label: "Lisbon", timezoneOffsetMin: 0 } }, "2026-10-01");
  assert.equal(r.moon.brightLimbAngleDeg, null);
  assert.equal(r.line3, null);
  assert.equal(r.line1, "Evening of 27 September 2015");
});

test("a date still ahead gives the frequency and no '0 of 0' count", () => {
  // Home's "Save this date" saves any of the next 30 nights.
  const r = revealContent({ date: "2027-01-21", type: "custom", location: null }, "2026-10-23");
  assert.ok(r.moon.phaseFraction >= 0.99, `setup: expected >=99%, got ${r.moon.phaseFraction}`);
  assert.match(r.line4!, /^1 in \d+\.\d days has a moon at least [\d.]+% lit\.$/);
});
