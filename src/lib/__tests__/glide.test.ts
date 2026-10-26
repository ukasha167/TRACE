import { test } from "node:test";
import assert from "node:assert/strict";
import { lenis } from "@/lib/glide";

test("lenis starts at 0 and lands on 1", () => {
  assert.equal(lenis(0), 0);
  assert.equal(lenis(1), 1);
  assert.equal(lenis(-0.5), 0);
  assert.equal(lenis(2), 1);
});

test("lenis never runs backwards and never passes 1", () => {
  let previous = lenis(0);
  for (let i = 1; i <= 1000; i++) {
    const v = lenis(i / 1000);
    assert.ok(v >= previous, `dropped at t=${i / 1000}`);
    assert.ok(v <= 1, `passed 1 at t=${i / 1000}`);
    previous = v;
  }
});
