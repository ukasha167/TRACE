import { test } from "node:test";
import assert from "node:assert/strict";
import { anniversaryOn } from "@/lib/astronomy/dateUtils";

// The night of the January 2000 total lunar eclipse, as seen from the Americas.
test("an ordinary date keeps its month and day in any later year", () => {
  assert.equal(anniversaryOn("2000-01-20", 2031), "2031-01-20");
  assert.equal(anniversaryOn("2000-01-20", 2000), "2000-01-20");
  assert.equal(anniversaryOn("2000-12-31", 2001), "2001-12-31");
});

test("29 February comes back as 29 February in a leap year", () => {
  assert.equal(anniversaryOn("2016-02-29", 2028), "2028-02-29");
});

test("29 February has no anniversary in a common year, and its neighbours are untouched", () => {
  assert.equal(anniversaryOn("2016-02-29", 2027), null);
  assert.equal(anniversaryOn("2016-02-28", 2027), "2027-02-28");
  assert.equal(anniversaryOn("2016-03-01", 2027), "2027-03-01");
});

test("century years follow the Gregorian rule: 1900 and 2100 are common, 2000 and 2400 are leap", () => {
  assert.equal(anniversaryOn("1896-02-29", 1900), null);
  assert.equal(anniversaryOn("1896-02-29", 2000), "2000-02-29");
  assert.equal(anniversaryOn("1896-02-29", 2100), null);
  assert.equal(anniversaryOn("1896-02-29", 2400), "2400-02-29");
});
