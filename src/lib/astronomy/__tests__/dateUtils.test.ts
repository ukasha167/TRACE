import { test } from "node:test";
import assert from "node:assert/strict";
import { anniversaryOn, formatLocalTime, toLocalDayStart } from "@/lib/astronomy/dateUtils";

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

// Greatest eclipse of the 2015-09-28 total lunar eclipse: 02:47 UTC.
const eclipse = new Date(Date.UTC(2015, 8, 28, 2, 47));

test("formatLocalTime reads the clock at a positive, a negative and a half-hour offset", () => {
  assert.equal(formatLocalTime(eclipse, 0), "02:47");
  assert.equal(formatLocalTime(eclipse, 60), "03:47");
  assert.equal(formatLocalTime(eclipse, -240), "22:47");
  assert.equal(formatLocalTime(eclipse, 330), "08:17");
});

test("formatLocalTime crosses midnight in both directions once the offset is applied", () => {
  assert.equal(formatLocalTime(new Date(Date.UTC(2015, 8, 28, 20, 0)), 330), "01:30");
  assert.equal(formatLocalTime(new Date(Date.UTC(2015, 8, 28, 1, 15)), -300), "20:15");
});

test("toLocalDayStart is local midnight: Tokyo begins 20 March 2015 at 15:00 UTC on the 19th", () => {
  assert.equal(toLocalDayStart("2015-03-20", 540).getTime(), Date.UTC(2015, 2, 19, 15, 0));
  assert.equal(toLocalDayStart("2015-03-20", 330).getTime(), Date.UTC(2015, 2, 19, 18, 30));
  assert.equal(toLocalDayStart("2015-03-20", 0).getTime(), Date.UTC(2015, 2, 20, 0, 0));
  assert.equal(toLocalDayStart("2015-03-20", -300).getTime(), Date.UTC(2015, 2, 20, 5, 0));
});

test("the start of a local day reads as 00:00 on that day's clock", () => {
  for (const offset of [-300, 0, 330, 540]) {
    assert.equal(formatLocalTime(toLocalDayStart("2015-03-20", offset), offset), "00:00");
  }
});
