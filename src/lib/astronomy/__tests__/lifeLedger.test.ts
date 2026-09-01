import { test } from "node:test";
import assert from "node:assert/strict";
import { getLifeLedger, brightestYears } from "@/lib/astronomy/lifeLedger";

// Impersonal reference date throughout (spec §14).
const REF = "2015-09-28";

test("ledger has one row per year, inclusive of both ends", () => {
  const rows = getLifeLedger(REF, { throughYear: 2025 });
  assert.equal(rows.length, 11);
  assert.equal(rows[0].year, 2015);
  assert.equal(rows[0].age, 0);
  assert.equal(rows[10].year, 2025);
  assert.equal(rows[10].age, 10);
});

test("every row carries real phase data", () => {
  for (const row of getLifeLedger(REF, { throughYear: 2025 })) {
    assert.ok(row.phaseFraction >= 0 && row.phaseFraction <= 1);
    assert.ok(row.phaseIndex >= 0 && row.phaseIndex <= 7);
    assert.equal(typeof row.waxing, "boolean");
  }
});

test("the source year is itself a 100% match but not flagged as a return", () => {
  const rows = getLifeLedger(REF, { throughYear: 2025 });
  assert.equal(rows[0].isReturn, false, "a date does not 'return' to itself");
});

test("return years are flagged and labelled", () => {
  const rows = getLifeLedger(REF, { throughYear: 2040 });
  const returns = rows.filter((r) => r.isReturn);
  assert.ok(returns.length > 0, "expected at least one return in 25 years");
  for (const r of returns) {
    assert.ok(r.cycleLabel, `return at ${r.year} must explain itself`);
  }
  // The Metonic hit must be among them.
  assert.ok(returns.some((r) => r.age === 19));
});

test("tilt is null without a location and populated with one", () => {
  const noLoc = getLifeLedger(REF, { throughYear: 2020 });
  assert.ok(noLoc.every((r) => r.brightLimbAngleDeg === null));

  const withLoc = getLifeLedger(REF, {
    throughYear: 2020,
    location: { latitude: 51.4779, longitude: 0, label: "Greenwich" },
  });
  assert.ok(withLoc.every((r) => typeof r.brightLimbAngleDeg === "number"));
  assert.ok(withLoc.every((r) => r.brightLimbAngleDeg! > -180 && r.brightLimbAngleDeg! <= 180));
});

test("Feb 29 sources skip common years rather than sliding the date", () => {
  const rows = getLifeLedger("2016-02-29", { throughYear: 2028 });
  assert.deepEqual(
    rows.map((r) => r.year),
    [2016, 2020, 2024, 2028]
  );
  assert.ok(rows.every((r) => r.date.endsWith("-02-29")));
});

test("brightestYears ranks by illumination", () => {
  const rows = getLifeLedger(REF, { throughYear: 2035 });
  const top = brightestYears(rows, 3);
  assert.equal(top.length, 3);
  assert.ok(top[0].phaseFraction >= top[1].phaseFraction);
  assert.ok(top[1].phaseFraction >= top[2].phaseFraction);
});
