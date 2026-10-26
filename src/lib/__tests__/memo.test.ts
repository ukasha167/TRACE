import { test } from "node:test";
import assert from "node:assert/strict";
import { lru } from "@/lib/memo";

test("lru returns a stored value and computes only on a miss", () => {
  const cache = lru<number>(2);
  let calls = 0;
  const compute = () => ++calls;
  assert.equal(cache.through("a", compute), 1);
  assert.equal(cache.through("a", compute), 1);
  assert.equal(calls, 1);
  assert.equal(cache.get("b"), undefined);
});

test("lru evicts the least recently used entry", () => {
  const cache = lru<string>(2);
  cache.set("a", "A");
  cache.set("b", "B");
  cache.get("a"); // a is now newer than b
  cache.set("c", "C");
  assert.deepEqual(cache.keys(), ["a", "c"]);
  assert.equal(cache.get("b"), undefined);
});

test("lru re-setting a key refreshes it rather than duplicating it", () => {
  const cache = lru<number>(2);
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("a", 3);
  cache.set("c", 4);
  assert.deepEqual(cache.keys(), ["a", "c"]);
  assert.equal(cache.get("a"), 3);
});
