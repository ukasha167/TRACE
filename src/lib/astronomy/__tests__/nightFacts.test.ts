import { test } from "node:test";
import assert from "node:assert/strict";
import { getNightFacts, nightFactsFor, headlineSentences, formatDuration } from "@/lib/astronomy/nightFacts";

/**
 * Eclipse nights are the fixtures because an eclipse can only happen at an
 * exact full moon, which pins the search against physics rather than against a
 * number someone typed in. Both are public, well-documented events.
 */
const greenwich = { latitude: 51.4779, longitude: 0, label: "Greenwich, United Kingdom" };
const CLOCK = /\b\d{1,2}:\d{2}\b/;

test("the 2015-09-28 total lunar eclipse is found on the evening of the 27th", () => {
  const f = getNightFacts("2015-09-27", greenwich, 0);
  assert.ok(f.eclipse, "expected an eclipse");
  assert.equal(f.eclipse!.kind, "total");
  // Greatest eclipse 02:47 UTC.
  assert.ok(Math.abs(f.eclipse!.peak.getTime() - Date.UTC(2015, 8, 28, 2, 47)) < 5 * 60_000);
  assert.ok(f.eclipse!.moonAltitudeDeg > 0, "the moon was up over Greenwich");
  assert.match(f.sentences.eclipse!, /^A total lunar eclipse peaked .+ before sunrise, with the moon \d+° up over Greenwich\.$/);
});

test("the 2000-01-21 total lunar eclipse is found on the evening of the 20th", () => {
  const f = getNightFacts("2000-01-20", greenwich, 0);
  assert.equal(f.eclipse?.kind, "total");
  assert.ok(Math.abs(f.eclipse!.peak.getTime() - Date.UTC(2000, 0, 21, 4, 44)) < 5 * 60_000);
});

test("an ordinary night reports no eclipse", () => {
  const f = getNightFacts("2015-09-10", greenwich, 0);
  assert.equal(f.eclipse, null);
  assert.equal(f.sentences.eclipse, null);
});

test("a full moon rises near sunset and culminates due south", () => {
  const f = getNightFacts("2015-09-27", greenwich, 0);
  assert.ok(f.sunset && f.moonrise);
  assert.ok(Math.abs(f.moonrise!.getTime() - f.sunset!.getTime()) < 90 * 60_000);
  // Moon near the celestial equator from 51.5° N: about 90 - 51.5 = 38.5°.
  assert.ok(Math.abs(f.highest!.altitudeDeg - 38.5) < 3, `highest ${f.highest!.altitudeDeg}`);
  assert.ok(Math.abs(f.highest!.azimuthDeg - 180) < 10, `azimuth ${f.highest!.azimuthDeg}`);
});

test("the moon's constellation comes from the J2000 boundaries", () => {
  assert.equal(getNightFacts("2015-09-27", greenwich, 0).constellation, "Pisces");
});

test("nothing is said as a clock time, because the offset is an estimate", () => {
  for (const date of ["2015-09-27", "2000-01-20", "2015-09-10"]) {
    const f = getNightFacts(date, greenwich, 0);
    for (const s of [...headlineSentences(f), f.sentences.sky]) assert.doesNotMatch(s, CLOCK, s);
    for (const r of f.rows) assert.doesNotMatch(r.value, CLOCK, `${r.label}: ${r.value}`);
  }
});

test("the headline leads with the eclipse when there is one", () => {
  const lines = headlineSentences(getNightFacts("2015-09-27", greenwich, 0));
  assert.equal(lines.length, 2);
  assert.match(lines[0], /eclipse/);
});

test("durations read as hours and minutes", () => {
  assert.equal(formatDuration(14 * 60_000), "14 min");
  assert.equal(formatDuration(2 * 3_600_000), "2 h");
  assert.equal(formatDuration(3 * 3_600_000 + 7 * 60_000), "3 h 7 min");
});

test("above the Arctic Circle the sun can fail to set or fail to rise, and the words say which", () => {
  const tromso = { latitude: 69.6492, longitude: 18.9553, label: "Tromso, Norway" };
  const june = getNightFacts("2015-06-21", tromso, 120);
  assert.equal(june.sentences.motion, "The sun did not set in Tromso that night.");
  const december = getNightFacts("2015-12-21", tromso, 60);
  assert.equal(december.sentences.motion, "The sun did not rise in Tromso that day, so the whole of it was night.");
});

test("nightFactsFor computes once per date and place and agrees with getNightFacts", () => {
  const first = nightFactsFor("2015-09-27", greenwich, 0);
  assert.equal(nightFactsFor("2015-09-27", { ...greenwich }, 0), first, "a second call is the same object");
  assert.deepEqual(first, getNightFacts("2015-09-27", greenwich, 0));
  assert.notEqual(nightFactsFor("2015-09-27", greenwich, 60), first, "another offset is another night");
  assert.ok(Object.isFrozen(first) && Object.isFrozen(first.rows));
});
