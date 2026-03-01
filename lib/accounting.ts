/**
 * Double-entry accounting helper functions.
 * Ensures all journal entries balance (total debits == total credits).
 */

export interface JournalLine {
  accountId: string;
  debit: number;
  credit: number;
  description?: string;
}

/**
 * Validate that a set of journal entry lines is balanced.
 * In double-entry bookkeeping, total debits must equal total credits.
 * Returns true if balanced, false otherwise.
 */
export function isBalanced(lines: JournalLine[]): boolean {
  const totalDebits = lines.reduce((sum, line) => sum + line.debit, 0);
  const totalCredits = lines.reduce((sum, line) => sum + line.credit, 0);
  // Use a small epsilon for floating-point comparison
  return Math.abs(totalDebits - totalCredits) < 0.01;
}

/**
 * Calculate total debits from journal entry lines.
 */
export function totalDebits(lines: JournalLine[]): number {
  return lines.reduce((sum, line) => sum + line.debit, 0);
}

/**
 * Calculate total credits from journal entry lines.
 */
export function totalCredits(lines: JournalLine[]): number {
  return lines.reduce((sum, line) => sum + line.credit, 0);
}

/**
 * Determine the normal balance side for an account type.
 * Assets & Expenses have a normal debit balance.
 * Liabilities, Equity & Revenue have a normal credit balance.
 */
export function normalBalance(accountType: string): "debit" | "credit" {
  switch (accountType.toLowerCase()) {
    case "asset":
    case "expense":
      return "debit";
    case "liability":
    case "equity":
    case "revenue":
      return "credit";
    default:
      return "debit";
  }
}

/**
 * Calculate the balance for an account given its lines and type.
 * For debit-normal accounts: balance = debits - credits
 * For credit-normal accounts: balance = credits - debits
 */
export function accountBalance(
  lines: { debit: number; credit: number }[],
  accountType: string
): number {
  const debits = lines.reduce((sum, l) => sum + l.debit, 0);
  const credits = lines.reduce((sum, l) => sum + l.credit, 0);

  if (normalBalance(accountType) === "debit") {
    return debits - credits;
  }
  return credits - debits;
}

/**
 * Create journal lines for a rent payment.
 * Debit Cash, Credit Rental Income.
 */
export function createRentPaymentLines(
  cashAccountId: string,
  rentalIncomeAccountId: string,
  amount: number
): JournalLine[] {
  return [
    { accountId: cashAccountId, debit: amount, credit: 0, description: "Cash received" },
    { accountId: rentalIncomeAccountId, debit: 0, credit: amount, description: "Rental income" },
  ];
}

/**
 * Create journal lines for an expense payment.
 * Debit Expense account, Credit Cash.
 */
export function createExpenseLines(
  expenseAccountId: string,
  cashAccountId: string,
  amount: number,
  expenseDescription?: string
): JournalLine[] {
  return [
    { accountId: expenseAccountId, debit: amount, credit: 0, description: expenseDescription || "Expense" },
    { accountId: cashAccountId, debit: 0, credit: amount, description: "Cash paid" },
  ];
}

/**
 * Create journal lines for a security deposit received.
 * Debit Security Deposit Cash, Credit Security Deposits Held (Liability).
 */
export function createSecurityDepositLines(
  depositCashAccountId: string,
  depositLiabilityAccountId: string,
  amount: number
): JournalLine[] {
  return [
    { accountId: depositCashAccountId, debit: amount, credit: 0, description: "Security deposit received" },
    { accountId: depositLiabilityAccountId, debit: 0, credit: amount, description: "Security deposit held" },
  ];
}
