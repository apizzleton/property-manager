import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeAssetCategory,
  normalizeAssetCondition,
  sortAssetEventsNewestFirst,
} from "@/lib/assets";

test("normalizeAssetCondition falls back to good for unknown value", () => {
  assert.equal(normalizeAssetCondition("bad_value"), "good");
  assert.equal(normalizeAssetCondition("poor"), "poor");
});

test("normalizeAssetCategory trims, lowers, and collapses spaces", () => {
  assert.equal(normalizeAssetCategory("  Water   Heater "), "water heater");
  assert.equal(normalizeAssetCategory("FLOORING"), "flooring");
});

test("sortAssetEventsNewestFirst orders by eventDate descending", () => {
  const sorted = sortAssetEventsNewestFirst([
    { id: "one", eventDate: "2026-01-10T00:00:00.000Z" },
    { id: "two", eventDate: "2026-03-01T00:00:00.000Z" },
    { id: "three", eventDate: "not-a-date" },
  ]);
  assert.deepEqual(
    sorted.map((event) => event.id),
    ["two", "one", "three"]
  );
});
