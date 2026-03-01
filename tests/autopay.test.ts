import test from "node:test";
import assert from "node:assert/strict";
import {
  computeAutopayAmount,
  computeNextRunAt,
  normalizeAutopayDay,
} from "@/lib/autopay";

test("normalizeAutopayDay clamps values to 1-28", () => {
  assert.equal(normalizeAutopayDay(0), 1);
  assert.equal(normalizeAutopayDay(29), 28);
  assert.equal(normalizeAutopayDay(15), 15);
});

test("computeNextRunAt returns this month when still ahead", () => {
  const now = new Date("2026-02-05T10:00:00.000Z");
  const next = computeNextRunAt(10, now);
  assert.equal(next.toISOString(), "2026-02-10T09:00:00.000Z");
});

test("computeNextRunAt rolls to next month when day has passed", () => {
  const now = new Date("2026-02-20T10:00:00.000Z");
  const next = computeNextRunAt(10, now);
  assert.equal(next.toISOString(), "2026-03-10T09:00:00.000Z");
});

test("computeAutopayAmount respects max cap", () => {
  assert.equal(computeAutopayAmount(1200, 500), 500);
  assert.equal(computeAutopayAmount(450, null), 450);
});
