import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyApod } from "@/lib/apod/apodClassify";

test("videos classify as video regardless of text", () => {
  assert.equal(
    classifyApod({ mediaType: "video", explanation: "a lovely photograph" }),
    "video"
  );
});

test("a positional self-description marks it illustrative", () => {
  assert.equal(
    classifyApod({
      mediaType: "image",
      explanation:
        "Go outside tonight. The above illustration shows how the eclipse will appear across the Earth.",
    }),
    "illustrative"
  );
});

test("a passing mention of a map does NOT mark it illustrative", () => {
  // Regression: a bare keyword scan false-positives on prose like this.
  assert.equal(
    classifyApod({
      mediaType: "image",
      explanation:
        "Astronomers used a map of the outer galaxy to identify the source of this glow.",
    }),
    "photograph"
  );
});

test("plain photographs classify as photographs", () => {
  assert.equal(
    classifyApod({
      mediaType: "image",
      explanation: "This deep exposure reveals the dust lanes of NGC 3628.",
    }),
    "photograph"
  );
});

test("artist's concepts are illustrative when pointed at", () => {
  assert.equal(
    classifyApod({
      mediaType: "image",
      explanation: "Pictured above is an artist's concept of the exoplanet.",
    }),
    "illustrative"
  );
});
