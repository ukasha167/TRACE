import { test } from "node:test";
import assert from "node:assert/strict";
import { makeBackup, readBackup, newRecords } from "@/lib/backup/backup";
import type { Milestone } from "@/types";

const tokyo = { latitude: 35.6762, longitude: 139.6503, label: "Tokyo, Japan", timezoneOffsetMin: 540 };
const a: Milestone = { id: "a", title: "Eclipse eve", type: "custom", date: "2015-09-27", location: tokyo, createdAt: "2026-01-01T00:00:00.000Z" };
const b: Milestone = { id: "b", title: "Leap day", type: "birthday", date: "2000-02-29", location: null, notes: "a note", createdAt: "2026-01-02T00:00:00.000Z" };

test("a backup reads back to the same records and bells", () => {
  const text = JSON.stringify(makeBackup([a, b], ["b", "gone"]));
  const read = readBackup(text);
  assert.ok(read.ok);
  assert.deepEqual(read.milestones, [a, b]);
  // A bell for a record that is not in the file is not carried.
  assert.deepEqual(read.reminders, ["b"]);
  assert.equal(read.skipped, 0);
});

test("a file that is not a backup is refused, with a reason", () => {
  for (const text of ["not json", "{}", JSON.stringify({ format: "other", milestones: [] }), "[]"]) {
    const read = readBackup(text);
    assert.equal(read.ok, false, text);
  }
});

test("a backup from a newer version is refused rather than half read", () => {
  const read = readBackup(JSON.stringify({ ...makeBackup([a], []), version: 99 }));
  assert.equal(read.ok, false);
});

test("a bad record is skipped and counted, and the good ones still come in", () => {
  const bad = [
    { ...a, id: "" },
    { ...a, id: "x1", date: "2015-02-30" },
    { ...a, id: "x2", date: "27/09/2015" },
    { ...a, id: "x3", type: "wedding" },
    { ...a, id: "x4", title: "   " },
    { ...a, id: "x5", location: { latitude: 200, longitude: 0, label: "Nowhere" } },
    { ...a, id: "x6", location: "Tokyo" },
  ];
  const read = readBackup(JSON.stringify({ ...makeBackup([a], []), milestones: [a, ...bad] }));
  assert.ok(read.ok);
  assert.deepEqual(read.milestones.map((m) => m.id), ["a"]);
  assert.equal(read.skipped, bad.length);
});

test("restoring never overwrites a record already on the phone", () => {
  const edited = { ...a, title: "Edited since the backup" };
  const added = newRecords([edited], [a, b, b]);
  assert.deepEqual(added.map((m) => m.id), ["b"]);
});
