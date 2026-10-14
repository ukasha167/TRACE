import { test } from "node:test";
import assert from "node:assert/strict";
import { nextPhases, phaseEventsBetween, moonRiseSet } from "@/lib/astronomy/tonight";

const greenwich = { latitude: 51.4779, longitude: 0 };

test("the next full moon after the 2015 eclipse's eve is the eclipse itself", () => {
  // Greatest eclipse 2015-09-28 02:47 UTC, which can only happen at an exact full.
  const [first] = nextPhases(new Date(Date.UTC(2015, 8, 27, 12)));
  assert.equal(first.kind, "full");
  assert.ok(Math.abs(first.at.getTime() - Date.UTC(2015, 8, 28, 2, 50)) < 15 * 60_000);
});

test("thirty days hold one full and one new moon, in order", () => {
  const events = phaseEventsBetween(new Date(Date.UTC(2015, 8, 1)), 30);
  assert.deepEqual(events.map((e) => e.kind).sort(), ["full", "new"]);
  for (let i = 1; i < events.length; i++) assert.ok(events[i].at > events[i - 1].at);
});

test("tonight's moonset comes after tonight's moonrise", () => {
  const { rise, set } = moonRiseSet(new Date(Date.UTC(2015, 8, 27, 20)), greenwich);
  assert.ok(rise && set);
  assert.ok(set!.getTime() > rise!.getTime());
  // A full moon rises near sunset; that evening it rose at 17:33 UTC.
  assert.ok(Math.abs(rise!.getTime() - Date.UTC(2015, 8, 27, 17, 33)) < 30 * 60_000);
});
