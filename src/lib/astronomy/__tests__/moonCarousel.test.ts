import { test } from "node:test";
import assert from "node:assert/strict";
import { clampMoonDay, moonCarouselItems } from "../moonCarousel";

const greenwich = { latitude: 51.4779, longitude: 0, label: "Greenwich", timezoneOffsetMin: 0 };

test("the carousel stops thirty calendar days either side of today", () => {
  const before = moonCarouselItems("2024-03-01", -100, greenwich);
  const after = moonCarouselItems("2024-03-01", 100, greenwich);
  assert.equal(before[0].date, "2024-01-31");
  assert.equal(before[0].offset, -30);
  assert.equal(after.at(-1)!.date, "2024-03-31");
  assert.equal(after.at(-1)!.offset, 30);
  assert.equal(clampMoonDay(NaN), 0);
  assert.equal(clampMoonDay(Infinity), 0);
});

test("swiping across leap day keeps each calendar date once", () => {
  assert.deepEqual(moonCarouselItems("2024-03-01", 0, greenwich).map((item) => item.date),
    ["2024-02-28", "2024-02-29", "2024-03-01", "2024-03-02", "2024-03-03"]);
});

test("the eclipse evening has a full moon and the next evening is dimmer", () => {
  const items = moonCarouselItems("2015-09-27", 0, greenwich);
  assert.ok(items.find((item) => item.offset === 0)!.phase.phaseFraction > 0.999);
  assert.ok(items.find((item) => item.offset === 1)!.phase.phaseFraction < 0.99);
});

test("a carousel without a place never invents a tilt", () => {
  assert.ok(moonCarouselItems("2026-10-14", 0, null).every((item) => item.brightLimbAngleDeg === null && item.northAngleDeg === null));
});
