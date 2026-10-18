import { test } from "node:test";
import assert from "node:assert/strict";
import { inferOccasion } from "@/lib/occasion";

test("a title that names a birthday or a wedding says so", () => {
  assert.equal(inferOccasion("Ammi's birthday"), "birthday");
  assert.equal(inferOccasion("The night Zain was born"), "birthday");
  assert.equal(inferOccasion("Our wedding"), "anniversary");
  assert.equal(inferOccasion("Nikah"), "anniversary");
  assert.equal(inferOccasion("10th Anniversary"), "anniversary");
});

test("a title that names neither leaves the type to the caller", () => {
  assert.equal(inferOccasion("First night in Hunza"), null);
  // Whole words only: "rebirth" and "Bornholm" are not birthdays.
  assert.equal(inferOccasion("Rebirth"), null);
  assert.equal(inferOccasion("Bornholm trip"), null);
});
