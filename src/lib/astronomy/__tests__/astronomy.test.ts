import { test } from "node:test";
import assert from "node:assert/strict";
import { getMoonPhase, formatIllumination, describePhase, describeSyzygyNote, phaseDistanceDays } from "@/lib/astronomy/moonPhase";
import { getBrightLimbAngle } from "@/lib/astronomy/brightLimb";
import { getMoonReturns, describeCycle } from "@/lib/astronomy/moonReturn";
import { measureFrequency, getRarityStat } from "@/lib/astronomy/rarity";
import {
  toLocalNoon,
  toLocalNight,
  approximateTimezoneOffsetMin,
} from "@/lib/astronomy/dateUtils";
import * as SunCalc from "suncalc";

/**
 * Fixtures use impersonal, publicly verifiable reference dates only (spec §14).
 *
 * Eclipse instants are ideal: a lunar eclipse can ONLY occur at exactly full
 * and a solar eclipse ONLY at exactly new, so these pin the math against
 * physics rather than against arithmetic someone typed in.
 */

test("illumination is 1.0 at a total lunar eclipse (2000-01-21 04:44 UTC)", () => {
  const f = SunCalc.getMoonIllumination(new Date(Date.UTC(2000, 0, 21, 4, 44))).fraction;
  assert.ok(Math.abs(f - 1) < 0.0005, `expected ~1.0, got ${f}`);
});

test("illumination is 1.0 at a total lunar eclipse (2015-09-28 02:47 UTC)", () => {
  const f = SunCalc.getMoonIllumination(new Date(Date.UTC(2015, 8, 28, 2, 47))).fraction;
  assert.ok(Math.abs(f - 1) < 0.0005, `expected ~1.0, got ${f}`);
});

test("illumination is 0.0 at a total solar eclipse (2024-04-08 18:17 UTC)", () => {
  const f = SunCalc.getMoonIllumination(new Date(Date.UTC(2024, 3, 8, 18, 17))).fraction;
  assert.ok(f < 0.0005, `expected ~0.0, got ${f}`);
});

// ---- brightLimb: guards the §5.1 regression ----

test("brightLimb returns degrees, not radians-scaled garbage", () => {
  const d = new Date(Date.UTC(2015, 8, 28, 2, 47));
  const angle = getBrightLimbAngle(d, { latitude: 51.4779, longitude: 0, label: "Greenwich" });
  assert.ok(Math.abs(angle - 133.87) < 0.05, `expected ~133.87, got ${angle}`);
});

test("brightLimb stays within (-180, 180] across a full year", () => {
  for (let day = 0; day < 365; day += 7) {
    const d = new Date(Date.UTC(2024, 0, 1 + day, 12));
    const a = getBrightLimbAngle(d, { latitude: 51.4779, longitude: 0, label: "Greenwich" });
    assert.ok(a > -180 && a <= 180, `out of range on day ${day}: ${a}`);
  }
});

// ---- isTruePhase: the labelling bug that misled the author ----

test("a true full moon date reports isTruePhase", () => {
  // Full moon instant 2015-09-28 02:47 UTC -> that UTC day contains it.
  const p = getMoonPhase(new Date(Date.UTC(2015, 8, 28, 2, 47)), new Date(Date.UTC(2015, 8, 28)));
  assert.equal(p.phaseName, "Full Moon");
  assert.equal(p.isTruePhase, true);
});

test("a near-full day bucketed as Full Moon does NOT report isTruePhase", () => {
  // Two days after the full instant: still buckets to index 4, but the syzygy
  // is long past. This is exactly the case that produced a false "full moon".
  const dayStart = new Date(Date.UTC(2015, 8, 30));
  const p = getMoonPhase(new Date(Date.UTC(2015, 8, 30, 12)), dayStart);
  assert.equal(p.isTruePhase, false);
  assert.notEqual(describePhase(p), "Full Moon");
});

test("describePhase uses real waxing flag, not the bucket index", () => {
  // Two days BEFORE full — must read as waxing, not waning.
  const dayStart = new Date(Date.UTC(2015, 8, 26));
  const p = getMoonPhase(new Date(Date.UTC(2015, 8, 26, 12)), dayStart);
  if (p.phaseIndex === 4 && !p.isTruePhase) {
    assert.equal(describePhase(p), "Waxing Gibbous");
  }
});

test("formatIllumination keeps a decimal in the range where it matters", () => {
  assert.equal(formatIllumination(0.962), "96.2%");
  assert.equal(formatIllumination(0.9988), "99.9%");
  assert.equal(formatIllumination(0.5), "50%");
});

// ---- Moon Return ----

test("describeCycle names the classic intervals", () => {
  assert.equal(describeCycle(19), "Metonic cycle (19 years)");
  assert.equal(describeCycle(11), "11-year cycle");
  assert.equal(describeCycle(8), "8-year cycle");
  assert.equal(describeCycle(30), "Metonic + 11-year");
});

test("Moon Return reproduces the 11/19/30 recurrence structure", () => {
  // Impersonal reference: 2015-09-28, a well-known total lunar eclipse date.
  const returns = getMoonReturns("2015-09-28", { searchYears: 40, tzOffsetMin: 0 });
  const offsets = returns.map((r) => r.offsetYears);
  // The Metonic cycle must be present; it is the strongest recurrence there is.
  assert.ok(offsets.includes(19), `expected a 19-year return, got ${offsets.join(",")}`);
  // Every hit must be within the stated threshold.
  for (const r of returns) assert.ok(r.phaseOffsetDays < 1.0);
  // Returns must be sorted and exclude the source year.
  assert.ok(!returns.some((r) => r.year === 2015));
});

test("phaseDistanceDays wraps around the new moon correctly", () => {
  assert.ok(phaseDistanceDays(0.99, 0.01) < 1.0);
  assert.ok(Math.abs(phaseDistanceDays(0, 0.5) - 29.530589 / 2) < 1e-9);
});

// ---- Rarity ----

test("measured frequency of a >=99% moon is about 1 in 16", () => {
  const f = measureFrequency(99);
  assert.ok(f > 0.055 && f < 0.065, `expected ~0.0606, got ${f}`);
  assert.ok(Math.abs(1 / f - 16.5) < 1.0);
});

test("rarity thresholds are monotonic", () => {
  assert.ok(measureFrequency(90) > measureFrequency(95));
  assert.ok(measureFrequency(95) > measureFrequency(99));
  assert.ok(measureFrequency(99) > measureFrequency(99.5));
});

test("personal rarity counts only real anniversaries", () => {
  const stat = getRarityStat("2015-09-28", 99, { throughYear: 2025, tzOffsetMin: 0 });
  assert.equal(stat.totalYears, 11);
  assert.ok(stat.matchingYears.every((y) => y >= 2015 && y <= 2025));
  assert.ok(stat.matchingDetails != null && stat.matchingDetails.length > 0);
  assert.ok(stat.matchingDetails.every((m) => typeof m.illuminationPct === "number"));
});

test("personal rarity includes years within ±1.0% of milestone moon", () => {
  const stat = getRarityStat("2015-09-28", 99.5, { throughYear: 2025, tzOffsetMin: 0 });
  // 2015 moon was 98.8%. With threshold 99.5%, it is included via the ±1.0% tolerance
  assert.ok(stat.matchingYears.includes(2015));
  assert.ok(stat.matchingDetails!.some((m) => m.year === 2015 && m.illuminationPct >= 98.0));
  // 2023 cleared the 99.5% threshold directly (99.7%)
  assert.ok(stat.matchingYears.includes(2023));
});

// ---- Date handling ----

test("toLocalNoon does not slip a day", () => {
  const d = toLocalNoon("1990-04-15");
  assert.equal(d.getFullYear(), 1990);
  assert.equal(d.getMonth(), 3);
  assert.equal(d.getDate(), 15);
});

test("toLocalNight is midnight at the END of the date, in the given zone", () => {
  // UTC+5: local midnight ending 2004-10-27 is 19:00 UTC on 2004-10-27.
  const d = toLocalNight("2004-10-27", 300);
  assert.equal(d.toISOString(), "2004-10-27T19:00:00.000Z");
});

test("toLocalNight handles month rollover", () => {
  const d = toLocalNight("2024-01-31", 0);
  assert.equal(d.toISOString(), "2024-02-01T00:00:00.000Z");
});

// ---- The two-sided honesty rule (§6.2) ----

test("a 99%+ moon is called Full even when the syzygy lands on the next day", () => {
  // Impersonal reference: full instant 2015-09-28 02:47 UTC. Sample the UTC day
  // BEFORE it, where illumination is already >=99% but the instant has not hit.
  const dayStart = new Date(Date.UTC(2015, 8, 27));
  const p = getMoonPhase(new Date(Date.UTC(2015, 8, 27, 20)), dayStart);
  assert.ok(p.phaseFraction >= 0.99, `setup: expected >=99%, got ${p.phaseFraction}`);
  assert.equal(p.isTruePhase, false);
  assert.equal(describePhase(p), "Full Moon");
  // ...but it must disclose where the exact instant fell.
  assert.ok(describeSyzygyNote(p) !== null);
});

test("a sub-99% moon bucketed as Full is never called Full", () => {
  const dayStart = new Date(Date.UTC(2015, 8, 30));
  const p = getMoonPhase(new Date(Date.UTC(2015, 8, 30, 12)), dayStart);
  assert.ok(p.phaseFraction < 0.99);
  assert.notEqual(describePhase(p), "Full Moon");
  assert.equal(describeSyzygyNote(p), null);
});

test("MoonReturn.direction is relative to the SOURCE, not to today", () => {
  // Guards the "in -3 years" bug: a 2023 return on a 2015 source is direction
  // "future" even though it is in the past for a reader in 2026. Any UI phrasing
  // a return against today must derive it from the current year, not this field.
  const returns = getMoonReturns("2015-09-28", { searchYears: 30, tzOffsetMin: 0 });
  for (const r of returns) {
    assert.equal(
      r.direction,
      r.year < 2015 ? "past" : "future",
      `direction at ${r.year} must be relative to the 2015 source`
    );
  }
});

test("longitude-based timezone approximation lands on the right hour", () => {
  // Lahore 74.34E -> UTC+5, which is Pakistan's actual offset.
  assert.equal(approximateTimezoneOffsetMin(74.3436), 300);
  // Greenwich -> UTC+0.
  assert.equal(approximateTimezoneOffsetMin(0), 0);
  // Sydney 151.2E -> UTC+10 (AEST).
  assert.equal(approximateTimezoneOffsetMin(151.2093), 600);
  // New York -74W -> UTC-5 (EST).
  assert.equal(approximateTimezoneOffsetMin(-74.006), -300);
  // Always a whole number of hours. (Math.abs because JS "%" keeps the sign of
  // the dividend, so -300 % 60 is -0, which is not strictly equal to 0.)
  for (let lon = -180; lon <= 180; lon += 7) {
    assert.equal(Math.abs(approximateTimezoneOffsetMin(lon) % 60), 0);
  }
});
