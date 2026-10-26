import { test } from "node:test";
import assert from "node:assert/strict";
import { diffReminders, planReminders, reminderBody, reminderId } from "@/lib/reminders/planReminders";

const greenwich = { latitude: 51.4779, longitude: 0, label: "Greenwich, United Kingdom", timezoneOffsetMin: 0 };
const eclipse = { id: "e", title: "Eclipse night", date: "2015-09-28", location: greenwich };
const leap = { id: "l", title: "Leap day", date: "2000-02-29", location: null };
const CLOCK = /\b\d{1,2}:\d{2}\b/;

test("a return year says so, with the number of years", () => {
  const body = reminderBody(eclipse, 2034);
  assert.match(body, /^Tonight's moon over Greenwich is [\d.]+% lit\. On this night in 2015 it was [\d.]+% lit\. The moon is back to that night's phase, 19 years on\.$/);
});

test("an ordinary year gives tonight's figure and the original's", () => {
  const body = reminderBody(eclipse, 2026);
  assert.doesNotMatch(body, /back to that night/);
  assert.match(body, /On this night in 2015/);
});

test("a record without a place leaves the place out rather than guessing one", () => {
  assert.match(reminderBody(leap, 2028), /^Tonight's moon is [\d.]+% lit\./);
});

test("the plan covers only records with the bell on, soonest first", () => {
  const plan = planReminders([eclipse, leap], ["e"], "2026-01-01");
  assert.equal(plan.length, 3);
  assert.ok(plan.every((p) => p.milestoneId === "e"));
  assert.deepEqual(plan.map((p) => p.date), ["2026-09-28", "2027-09-28", "2028-09-28"]);
});

test("Feb 29 reminders land only in leap years", () => {
  const plan = planReminders([leap], ["l"], "2026-01-01");
  assert.deepEqual(plan.map((p) => p.date), ["2028-02-29", "2032-02-29", "2036-02-29"]);
});

test("today's anniversary is still scheduled", () => {
  const plan = planReminders([eclipse], ["e"], "2026-09-28");
  assert.equal(plan[0].date, "2026-09-28");
});

test("the plan never exceeds the limit iOS leaves room for", () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ ...eclipse, id: `r${i}` }));
  const plan = planReminders(many, many.map((m) => m.id), "2026-01-01", 3, 60);
  assert.equal(plan.length, 60);
  assert.equal(new Set(plan.map((p) => p.key)).size, 60);
});

test("a full moon in the text carries its figure", () => {
  const full = { ...eclipse, date: "2015-09-27" };
  assert.match(reminderBody(full, 2026), /it was full, 99\.\d+% lit\./);
});

test("reminder text never prints a clock time", () => {
  for (const p of planReminders([eclipse, leap], ["e", "l"], "2026-01-01")) assert.doesNotMatch(p.body, CLOCK);
});

test("a second sync over an unchanged plan cancels and schedules nothing", () => {
  const plan = planReminders([eclipse, leap], ["e", "l"], "2026-10-01");
  const first = diffReminders([], plan);
  assert.equal(first.schedule.length, plan.length);
  const second = diffReminders(first.schedule.map((s) => s.identifier), plan);
  assert.deepEqual(second, { cancel: [], schedule: [] });
});

test("an edited title replaces exactly the edited record's ids, and leaves other apps' alone", () => {
  const before = planReminders([eclipse, leap], ["e", "l"], "2026-10-01");
  const after = planReminders([{ ...eclipse, title: "Blood moon" }, leap], ["e", "l"], "2026-10-01");
  const scheduled = [...before.map(reminderId), "someone-else:1"];
  const { cancel, schedule } = diffReminders(scheduled, after);
  const edited = before.filter((p) => p.milestoneId === "e").map(reminderId);
  assert.ok(edited.length > 0);
  assert.deepEqual(cancel.sort(), edited.sort());
  assert.equal(schedule.length, edited.length);
  assert.ok(schedule.every((s) => s.reminder.title === "Blood moon"));
});
