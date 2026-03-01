/**
 * Keep day in a safe range that always exists in every month.
 */
export function normalizeAutopayDay(dayOfMonth: number): number {
  if (!Number.isFinite(dayOfMonth)) return 1;
  return Math.max(1, Math.min(28, Math.floor(dayOfMonth)));
}

/**
 * Compute next monthly run time at 09:00 UTC.
 */
export function computeNextRunAt(dayOfMonth: number, now = new Date()): Date {
  const day = normalizeAutopayDay(dayOfMonth);
  const candidate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day, 9, 0, 0, 0)
  );
  if (candidate.getTime() > now.getTime()) {
    return candidate;
  }
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, day, 9, 0, 0, 0));
}

export function computeAutopayAmount(outstanding: number, maxAmount?: number | null): number {
  const cap = maxAmount && maxAmount > 0 ? maxAmount : outstanding;
  const amount = Math.min(outstanding, cap);
  return parseFloat(Math.max(0, amount).toFixed(2));
}
