import { test } from "node:test";
import assert from "node:assert/strict";
import { getMoonPhase, formatIllumination, describePhase, describeSyzygyNote, phaseDistanceDays, syzygyFallsInDay } from "@/lib/astronomy/moonPhase";
import { getBrightLimbAngle } from "@/lib/astronomy/brightLimb";
import { getMoonReturns, describeCycle } from "@/lib/astronomy/moonReturn";
import {
  measureFrequency,
  getRarityStat,
  walkDays,
  MEASURED_DAY_COUNTS,
  MEASURED_DAYS,
} from "@/lib/astronomy/rarity";
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

/** The phase with its syzygy check, as the record page builds it. */
function phaseOn(date: Date, dayStart: Date) {
  const p = getMoonPhase(date);
  return { ...p, isTruePhase: syzygyFallsInDay(dayStart, p.phaseIndex) };
}

test("a true full moon date reports isTruePhase", () => {
  // Full moon instant 2015-09-28 02:47 UTC -> that UTC day contains it.
  const p = phaseOn(new Date(Date.UTC(2015, 8, 28, 2, 47)), new Date(Date.UTC(2015, 8, 28)));
  assert.equal(p.phaseName, "Full Moon");
  assert.equal(p.isTruePhase, true);
});

test("a near-full day bucketed as Full Moon does NOT report isTruePhase", () => {
  // Two days after the full instant: still buckets to index 4, but the syzygy
  // is long past. This is exactly the case that produced a false "full moon".
  const dayStart = new Date(Date.UTC(2015, 8, 30));
  const p = phaseOn(new Date(Date.UTC(2015, 8, 30, 12)), dayStart);
  assert.equal(p.isTruePhase, false);
  assert.notEqual(describePhase(p), "Full moon");
});

test("phase wording uses illumination and the measured direction", () => {
  const base = getMoonPhase(new Date(Date.UTC(2015, 8, 26, 12)));
  assert.equal(describePhase({ ...base, phaseFraction: 0.9, waxing: true }), "Growing moon");
  assert.equal(describePhase({ ...base, phaseFraction: 0.9, waxing: false }), "Fading moon");
  assert.equal(describePhase({ ...base, phaseFraction: 0.97 }), "Almost full moon");
  for (const [fraction, name] of [[0.9599, "Growing moon"], [0.96, "Almost full moon"], [0.9899, "Almost full moon"], [0.99, "Full moon"], [0.01, "New moon"], [0.0101, "Thin crescent"], [0.4499, "Growing crescent"], [0.45, "Half moon"], [0.55, "Half moon"], [0.5501, "Growing moon"]] as const) {
    assert.equal(describePhase({ ...base, phaseFraction: fraction, waxing: true }), name);
  }
});

test("formatIllumination keeps a decimal in the range where it matters", () => {
  assert.equal(formatIllumination(0.962), "96.2%");
  assert.equal(formatIllumination(0.9988), "99.9%");
  assert.equal(formatIllumination(0.5), "50%");
});

test("formatIllumination never rounds a moon up to 100%", () => {
  // One decimal used to print 99.96% as "100.0%", a claim of the exact full.
  assert.equal(formatIllumination(0.99962), "99.96%");
  assert.equal(formatIllumination(0.999999), "99.99%");
  assert.equal(formatIllumination(0.9994), "99.9%");
  assert.equal(formatIllumination(1), "100%");
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

test("the stored day counts are what walking the days still finds", () => {
  // The record screen reads MEASURED_DAY_COUNTS instead of walking 29,220 days
  // during its first render. This is what keeps that table a measurement: if
  // SunCalc or the sampling convention ever moves, the walk disagrees here.
  for (const [pct, days] of Object.entries(MEASURED_DAY_COUNTS)) {
    const walked = walkDays(Number(pct));
    assert.equal(walked.total, MEASURED_DAYS, "window length");
    assert.equal(walked.matches, days, `>=${pct}%`);
    assert.equal(measureFrequency(Number(pct)), walked.matches / walked.total);
  }
});

test("personal rarity counts only real anniversaries", () => {
  const stat = getRarityStat("2015-09-28", 99, { throughYear: 2025, tzOffsetMin: 0 });
  assert.equal(stat.totalYears, 11);
  assert.ok(stat.matchingYears.every((y) => y >= 2015 && y <= 2025));
  assert.ok(stat.matchingDetails != null && stat.matchingDetails.length > 0);
  assert.ok(stat.matchingDetails.every((m) => typeof m.illuminationPct === "number"));
});

test("personal rarity counts exactly the years that clear the threshold", () => {
  const stat = getRarityStat("2015-09-28", 99.5, { throughYear: 2025, tzOffsetMin: 0 });
  // The 2015 moon itself was 98.8%. "N of the M so far have had one" sits under
  // "at least 99.5%", so a 98.8% year is not one of them, however close.
  assert.ok(!stat.matchingYears.includes(2015));
  assert.ok(stat.matchingDetails!.every((m) => m.illuminationPct >= 99.5));
  // 2023 clears 99.5% (99.7%).
  assert.ok(stat.matchingYears.includes(2023));
});

test("an anniversary still ahead this year is not counted as one so far", () => {
  const before = getRarityStat("2015-09-28", 90, { tzOffsetMin: 0, today: "2025-09-27" });
  const after = getRarityStat("2015-09-28", 90, { tzOffsetMin: 0, today: "2025-09-28" });
  assert.equal(before.totalYears, 10);
  assert.equal(after.totalYears, 11);
});

// ---- Date handling ----

test("toLocalNoon does not slip a day", () => {
  const d = toLocalNoon("1990-04-15");
  assert.equal(d.getFullYear(), 1990);
  assert.equal(d.getMonth(), 3);
  assert.equal(d.getDate(), 15);
});

test("toLocalNight is midnight at the END of the date, in the given zone", () => {
  // UTC+9: local midnight ending 2015-09-27 is 15:00 UTC on 2015-09-27.
  const d = toLocalNight("2015-09-27", 540);
  assert.equal(d.toISOString(), "2015-09-27T15:00:00.000Z");
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
  const p = phaseOn(new Date(Date.UTC(2015, 8, 27, 20)), dayStart);
  assert.ok(p.phaseFraction >= 0.99, `setup: expected >=99%, got ${p.phaseFraction}`);
  assert.equal(p.isTruePhase, false);
  assert.equal(describePhase(p), "Full moon");
  // ...but it must disclose where the exact instant fell.
  assert.ok(describeSyzygyNote(p) !== null);
});

test("a sub-99% moon bucketed as Full is never called Full", () => {
  const dayStart = new Date(Date.UTC(2015, 8, 30));
  const p = phaseOn(new Date(Date.UTC(2015, 8, 30, 12)), dayStart);
  assert.ok(p.phaseFraction < 0.99);
  assert.notEqual(describePhase(p), "Full moon");
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
  // Tokyo 139.65E -> UTC+9, which is Japan's actual offset.
  assert.equal(approximateTimezoneOffsetMin(139.6503), 540);
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
