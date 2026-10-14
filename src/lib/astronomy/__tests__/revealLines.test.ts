import { test } from "node:test";
import assert from "node:assert/strict";
import { revealContent } from "@/lib/astronomy/revealLines";

const greenwich = { latitude: 51.4779, longitude: 0, label: "Greenwich, United Kingdom", timezoneOffsetMin: 0 };

test("the eclipse night reveals as full, with the eclipse as its fact", () => {
  // The 2015-09-28 total lunar eclipse peaked 02:47 UTC, so the evening of the
  // 27th is a full moon night with the eclipse in it.
  const r = revealContent({ date: "2015-09-27", type: "anniversary", location: greenwich }, "2026-10-01");
  assert.equal(r.line1, "27 September 2015 · Greenwich");
  assert.match(r.line2, /^Full Moon, 99\.\d+% lit$/);
  assert.match(r.line3!, /^A total lunar eclipse peaked/);
  assert.match(r.line4!, /^1 in \d+ days has a moon at least [\d.]+% lit\./);
});

test("without a place there is no night fact and no tilt, and nothing is invented", () => {
  const r = revealContent({ date: "2015-09-27", type: "birthday", location: null }, "2026-10-01");
  assert.equal(r.line1, "27 September 2015");
  assert.equal(r.line3, null);
  assert.equal(r.moon.brightLimbAngleDeg, null);
});
