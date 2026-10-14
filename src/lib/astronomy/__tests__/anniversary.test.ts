import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nextAnniversary,
  daysBetween,
  countdownLabel,
  describeComingMoon,
  occasionLabel,
} from "@/lib/astronomy/anniversary";

// Impersonal fixtures only: the 2015-09-28 total lunar eclipse, from Greenwich.
const greenwich = { latitude: 51.4779, longitude: 0, label: "Greenwich", timezoneOffsetMin: 0 };

test("the next anniversary is this year's when it is still ahead", () => {
  const a = nextAnniversary({ date: "2015-09-28", type: "anniversary", location: greenwich }, "2034-09-01");
  assert.equal(a.date, "2034-09-28");
  assert.equal(a.daysLeft, 27);
  assert.equal(a.age, 19);
});

test("a date already past this year rolls to next year", () => {
  const a = nextAnniversary({ date: "2015-09-28", type: "anniversary", location: greenwich }, "2034-09-29");
  assert.equal(a.date, "2035-09-28");
  assert.equal(a.daysLeft, 364);
});

test("the day itself counts as zero days left", () => {
  const a = nextAnniversary({ date: "2015-09-28", type: "anniversary", location: greenwich }, "2030-09-28");
  assert.equal(a.daysLeft, 0);
  assert.equal(countdownLabel(a.daysLeft), "Tonight");
});

test("the Metonic anniversary is flagged as a return, 19 years on", () => {
  const a = nextAnniversary({ date: "2015-09-28", type: "anniversary", location: greenwich }, "2034-01-01");
  assert.ok(a.moonReturn, "2034 should be a return year");
  assert.equal(a.moonReturn!.offsetYears, 19);
  // The forecast is taken at the same instant of night as the original.
  assert.ok(a.phase.phaseFraction > 0.98, `expected near full, got ${a.phase.phaseFraction}`);
});

test("a Feb 29 record skips to the next leap year rather than sliding to Mar 1", () => {
  const a = nextAnniversary({ date: "2000-02-29", type: "birthday", location: null }, "2025-03-01");
  assert.equal(a.date, "2028-02-29");
});

test("a record dated in the future counts down to the date itself", () => {
  const a = nextAnniversary({ date: "2030-05-01", type: "custom", location: null }, "2026-01-01");
  assert.equal(a.date, "2030-05-01");
  assert.equal(a.age, 0);
  assert.equal(a.moonReturn, null);
});

test("daysBetween counts calendar days across a leap day", () => {
  assert.equal(daysBetween("2024-02-28", "2024-03-01"), 2);
  assert.equal(daysBetween("2023-02-28", "2023-03-01"), 1);
});

test("the coming moon is called full only at 99% and always carries its figure", () => {
  assert.equal(describeComingMoon({ phaseFraction: 0.995, waxing: true }, "99.5%"), "The moon will be full, 99.5% lit.");
  assert.equal(describeComingMoon({ phaseFraction: 0.97, waxing: true }, "97.0%"), "The moon will be 97.0% lit, waxing.");
  assert.equal(describeComingMoon({ phaseFraction: 0.004, waxing: false }, "0%"), "The moon will be new, 0% lit.");
});

test("occasion labels read as ordinals", () => {
  assert.equal(occasionLabel("birthday", 21), "21st birthday");
  assert.equal(occasionLabel("anniversary", 12), "12th anniversary");
  assert.equal(occasionLabel("custom", 1), "1 year on");
});
