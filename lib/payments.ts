import type { JournalLine } from "@/lib/accounting";

export interface AllocatableCharge {
  id: string;
  dueDate: Date | string;
  createdAt: Date | string;
  amount: number;
  paidAmount: number;
}

export interface PaymentAllocationDraft {
  ledgerChargeId: string;
  allocatedAmount: number;
  allocationOrder: number;
}

export interface AllocationResult {
  allocations: PaymentAllocationDraft[];
  appliedAmount: number;
  unallocatedAmount: number;
}

export interface ChargeBalance {
  id: string;
  amount: number;
  paidAmount: number;
}

/**
 * Compute outstanding balance for a set of ledger charges.
 */
export function computeOutstandingBalance(charges: ChargeBalance[]): number {
  return charges.reduce((sum, charge) => {
    const remaining = Math.max(0, charge.amount - charge.paidAmount);
    return sum + remaining;
  }, 0);
}

/**
 * Allocate a payment amount to oldest open charges first.
 * Sorting: dueDate ASC, then createdAt ASC.
 */
export function allocateOldestFirst(
  charges: AllocatableCharge[],
  paymentAmount: number
): AllocationResult {
  if (paymentAmount <= 0) {
    return { allocations: [], appliedAmount: 0, unallocatedAmount: 0 };
  }

  const sorted = [...charges].sort((a, b) => {
    const dueA = new Date(a.dueDate).getTime();
    const dueB = new Date(b.dueDate).getTime();
    if (dueA !== dueB) return dueA - dueB;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  let remaining = paymentAmount;
  const allocations: PaymentAllocationDraft[] = [];

  for (const charge of sorted) {
    if (remaining <= 0) break;
    const openAmount = Math.max(0, charge.amount - charge.paidAmount);
    if (openAmount <= 0) continue;

    const applied = Math.min(remaining, openAmount);
    allocations.push({
      ledgerChargeId: charge.id,
      allocatedAmount: parseFloat(applied.toFixed(2)),
      allocationOrder: allocations.length + 1,
    });
    remaining -= applied;
  }

  const appliedAmount = parseFloat((paymentAmount - remaining).toFixed(2));
  return {
    allocations,
    appliedAmount,
    unallocatedAmount: parseFloat(Math.max(0, remaining).toFixed(2)),
  };
}

interface RevenueAllocationLine {
  accountId: string;
  accountNumber: string;
  accountName: string;
  amount: number;
}

/**
 * Build journal lines for posting a confirmed tenant payment.
 * Debits the settlement asset account (cash or undeposited funds),
 * then credits one or more revenue accounts sourced by ledger charges.
 */
export function buildConfirmationJournalLines(
  settlementAccountId: string,
  revenueLines: RevenueAllocationLine[]
): JournalLine[] {
  const totalRevenue = revenueLines.reduce((sum, line) => sum + line.amount, 0);
  if (totalRevenue <= 0) return [];

  const lines: JournalLine[] = [
    {
      accountId: settlementAccountId,
      debit: parseFloat(totalRevenue.toFixed(2)),
      credit: 0,
      description: "Tenant payment settlement recognized",
    },
  ];

  for (const line of revenueLines) {
    if (line.amount <= 0) continue;
    lines.push({
      accountId: line.accountId,
      debit: 0,
      credit: parseFloat(line.amount.toFixed(2)),
      description: `Revenue recognized — ${line.accountNumber} ${line.accountName}`,
    });
  }

  return lines;
}
