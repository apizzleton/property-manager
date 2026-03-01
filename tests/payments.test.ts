import test from "node:test";
import assert from "node:assert/strict";
import {
  allocateOldestFirst,
  buildConfirmationJournalLines,
  computeOutstandingBalance,
} from "@/lib/payments";

test("allocateOldestFirst allocates exact payment oldest-first", () => {
  const charges = [
    { id: "c1", dueDate: "2026-01-01", createdAt: "2025-12-01", amount: 100, paidAmount: 0 },
    { id: "c2", dueDate: "2026-02-01", createdAt: "2026-01-01", amount: 100, paidAmount: 0 },
  ];

  const result = allocateOldestFirst(charges, 100);
  assert.equal(result.appliedAmount, 100);
  assert.equal(result.unallocatedAmount, 0);
  assert.deepEqual(result.allocations, [
    { ledgerChargeId: "c1", allocatedAmount: 100, allocationOrder: 1 },
  ]);
});

test("allocateOldestFirst supports partial across multiple charges", () => {
  const charges = [
    { id: "c1", dueDate: "2026-01-01", createdAt: "2025-12-01", amount: 100, paidAmount: 20 },
    { id: "c2", dueDate: "2026-02-01", createdAt: "2026-01-01", amount: 100, paidAmount: 0 },
  ];

  const result = allocateOldestFirst(charges, 120);
  assert.equal(result.appliedAmount, 120);
  assert.equal(result.unallocatedAmount, 0);
  assert.deepEqual(result.allocations, [
    { ledgerChargeId: "c1", allocatedAmount: 80, allocationOrder: 1 },
    { ledgerChargeId: "c2", allocatedAmount: 40, allocationOrder: 2 },
  ]);
});

test("allocateOldestFirst returns unallocated amount when payment exceeds open charges", () => {
  const charges = [
    { id: "c1", dueDate: "2026-01-01", createdAt: "2025-12-01", amount: 50, paidAmount: 0 },
  ];

  const result = allocateOldestFirst(charges, 100);
  assert.equal(result.appliedAmount, 50);
  assert.equal(result.unallocatedAmount, 50);
});

test("computeOutstandingBalance sums open charge amounts", () => {
  const outstanding = computeOutstandingBalance([
    { id: "c1", amount: 100, paidAmount: 25 },
    { id: "c2", amount: 90, paidAmount: 0 },
  ]);
  assert.equal(outstanding, 165);
});

test("buildConfirmationJournalLines creates debit cash and credit revenue lines", () => {
  const lines = buildConfirmationJournalLines("cash1", [
    { accountId: "revA", accountNumber: "4100", accountName: "Rental Income", amount: 100 },
    { accountId: "revB", accountNumber: "4110", accountName: "Other Revenue", amount: 50 },
  ]);

  assert.equal(lines.length, 3);
  assert.equal(lines[0].accountId, "cash1");
  assert.equal(lines[0].debit, 150);
  assert.equal(lines[0].credit, 0);

  const credits = lines.slice(1).reduce((sum, line) => sum + line.credit, 0);
  assert.equal(credits, 150);
});
