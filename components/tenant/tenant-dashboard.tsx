"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, DollarSign, ReceiptText, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LedgerTable, type LedgerTableRow } from "@/components/ledger/ledger-table";
import { formatCurrency, formatDate } from "@/lib/utils";

interface LedgerCharge {
  id: string;
  description: string;
  dueDate: string;
  amount: number;
  paidAmount: number;
  status: "unpaid" | "partially_paid" | "paid";
  pendingAppliedAmount: number;
  account: { id: string; accountNumber: string; name: string };
}

interface PaymentAllocation {
  allocatedAmount: number;
  ledgerCharge: { description: string; account: { accountNumber: string; name: string } };
}

interface PaymentRecord {
  id: string;
  amount: number;
  status: "pending_confirmation" | "confirmed" | "rejected";
  submittedAt: string;
  initiatedFrom: string;
  memo: string | null;
  allocations?: PaymentAllocation[];
}

interface TenantLedgerResponse {
  lease: {
    id: string;
    startDate: string;
    endDate: string | null;
    monthlyRent: number;
    deposit: number;
    tenantName: string;
    unitNumber: string;
    propertyName: string;
  } | null;
  summary: {
    currentBalance: number;
    outstandingCharges: number;
    pendingConfirmationAmount: number;
  };
  charges: LedgerCharge[];
  upcomingCharges: Array<{ id: string; description: string; dueDate: string; amount: number }>;
  payments: PaymentRecord[];
  autopays: Array<{
    label: string;
    status: "active" | "inactive";
    nextRun: string | null;
    dayOfMonth: number;
    maxAmount: number | null;
    paymentMethodLast4: string | null;
    lastStatus: string | null;
  }>;
}


export function TenantDashboard() {
  const connectBypassActive = process.env.NEXT_PUBLIC_STRIPE_ALLOW_PLATFORM_FALLBACK === "true";
  const [loading, setLoading] = useState(true);
  const [ledger, setLedger] = useState<TenantLedgerResponse | null>(null);
  const [ledgerError, setLedgerError] = useState("");
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMemo, setPaymentMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [autopaySaving, setAutopaySaving] = useState(false);
  const [autopayMessage, setAutopayMessage] = useState("");
  const [autopayDay, setAutopayDay] = useState("1");
  const [autopayMaxAmount, setAutopayMaxAmount] = useState("");
  const [dateSort, setDateSort] = useState<"asc" | "desc">("desc");

  const refreshLedger = useCallback(async () => {
    try {
      const res = await fetch("/api/tenant-ledger/me");
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setLedger(null);
        setLedgerError(data?.error || "Unable to load tenant ledger.");
        setLoading(false);
        return;
      }
      setLedger(await res.json());
      setLedgerError("");
      setLoading(false);
    } catch {
      setLedger(null);
      setLedgerError("Unable to load tenant ledger.");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshLedger();
  }, [refreshLedger]);

  useEffect(() => {
    const config = ledger?.autopays?.[0];
    if (!config) return;
    setAutopayDay(String(config.dayOfMonth || 1));
    setAutopayMaxAmount(config.maxAmount ? String(config.maxAmount) : "");
  }, [ledger]);

  const openPaymentDialog = () => {
    setPaymentAmount("");
    setPaymentMemo("");
    setPaymentError("");
    setShowPaymentDialog(true);
  };

  const payDisabled = useMemo(() => {
    const parsed = parseFloat(paymentAmount);
    return !parsed || parsed <= 0 || submitting;
  }, [paymentAmount, submitting]);

  // Build unified ledger rows from charges and payment allocations, with running balance
  const ledgerRows = useMemo((): LedgerTableRow[] => {
    if (!ledger) return [];
    const rows: LedgerTableRow[] = [];

    // Each charge = one row
    for (const c of ledger.charges) {
      rows.push({
        id: `charge-${c.id}`,
        date: c.dueDate,
        type: "charge",
        description: c.description,
        account: `${c.account.accountNumber} ${c.account.name}`,
        amount: c.amount,
        runningBalance: 0, // computed below
        paymentStatus: undefined,
      });
    }

    // Each payment allocation = one row (exclude pending — PM approval is PM-side only)
    for (const p of ledger.payments.filter((x) => x.status !== "pending_confirmation")) {
      const allocs = p.allocations ?? [];
      if (allocs.length === 0) {
        rows.push({
          id: `payment-${p.id}`,
          date: p.submittedAt,
          type: "payment",
          description: "Payment",
          account: "—",
          amount: -p.amount,
          runningBalance: 0,
          paymentStatus: p.status,
        });
      } else {
        for (let i = 0; i < allocs.length; i++) {
          const a = allocs[i];
          rows.push({
            id: `payment-${p.id}-${i}`,
            date: p.submittedAt,
            type: "payment",
            description: a.ledgerCharge.description,
            account: `${a.ledgerCharge.account.accountNumber} ${a.ledgerCharge.account.name}`,
            amount: -a.allocatedAmount,
            runningBalance: 0,
            paymentStatus: p.status,
          });
        }
      }
    }

    // Sort by date ascending for running balance calculation
    const byDateAsc = [...rows].sort((a, b) => {
      const dA = new Date(a.date).getTime();
      const dB = new Date(b.date).getTime();
      return dA - dB;
    });

    // Compute running balance chronologically — only confirmed payments reduce balance
    let balance = 0;
    for (const row of byDateAsc) {
      const amountForBalance =
        row.type === "payment" && row.paymentStatus !== "confirmed"
          ? 0
          : row.amount;
      balance += amountForBalance;
      row.runningBalance = balance;
    }

    // Apply display sort
    return byDateAsc.sort((a, b) => {
      const dA = new Date(a.date).getTime();
      const dB = new Date(b.date).getTime();
      return dateSort === "asc" ? dA - dB : dB - dA;
    });
  }, [ledger, dateSort]);

  const submitPayment = async () => {
    const parsed = parseFloat(paymentAmount);
    if (!parsed || parsed <= 0) return;

    setSubmitting(true);
    setPaymentError("");
    try {
      const res = await fetch("/api/tenant-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parsed,
          memo: paymentMemo,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setPaymentError(data?.error || "Unable to submit payment.");
        return;
      }

      if (!data?.checkoutUrl) {
        setPaymentError("Unable to start Stripe checkout.");
        return;
      }

      setShowPaymentDialog(false);
      // Redirect to Stripe-hosted checkout page.
      window.location.assign(data.checkoutUrl);
    } catch {
      setPaymentError("Unable to reach the payment service. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const saveAutopay = async (enabled: boolean) => {
    setAutopaySaving(true);
    setAutopayMessage("");
    try {
      const maxAmount = autopayMaxAmount.trim() ? parseFloat(autopayMaxAmount) : null;
      const res = await fetch("/api/tenant-autopay/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          dayOfMonth: parseInt(autopayDay, 10) || 1,
          maxAmount: Number.isFinite(maxAmount) ? maxAmount : null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setAutopayMessage(data?.error || "Failed to update AutoPay settings.");
        return;
      }
      setAutopayMessage(enabled ? "AutoPay enabled." : "AutoPay disabled.");
      await refreshLedger();
    } catch {
      setAutopayMessage("Unable to update AutoPay right now. Please try again.");
    } finally {
      setAutopaySaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-sm text-muted-foreground">Loading tenant dashboard...</p>
      </div>
    );
  }

  if (!ledger || !ledger.lease) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tenant Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your account summary, charges, and payment activity.
          </p>
        </div>
        <Card>
          <CardContent className="py-10 text-sm text-muted-foreground">
            {ledgerError
              ? `${ledgerError} Please refresh and try again.`
              : "No active lease found. Your balance and ledger will appear once an active lease is assigned."}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tenant Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {ledger.lease.propertyName} - Unit {ledger.lease.unitNumber}
          </p>
        </div>
        <Button onClick={openPaymentDialog}>
          <Wallet className="mr-2 h-4 w-4" />
          Make Payment
        </Button>
      </div>

      {connectBypassActive ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Dev mode: Stripe Connect is temporarily bypassed. Checkout runs on the platform test
          account until property onboarding is completed.
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-rose-500 overflow-hidden hover:shadow-md transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2 bg-rose-50/50 dark:bg-rose-950/20">
            <CardTitle className="text-sm font-medium text-rose-700 dark:text-rose-400">Current Balance</CardTitle>
            <div className="p-2 bg-rose-100 dark:bg-rose-900/50 rounded-lg">
              <DollarSign className="h-4 w-4 text-rose-600 dark:text-rose-400" />
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold tracking-tight text-foreground">{formatCurrency(ledger.summary.currentBalance)}</div>
            <p className="mt-1 text-xs text-muted-foreground">Outstanding confirmed balance.</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500 overflow-hidden hover:shadow-md transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2 bg-blue-50/50 dark:bg-blue-950/20">
            <CardTitle className="text-sm font-medium text-blue-700 dark:text-blue-400">Monthly Rent</CardTitle>
            <div className="p-2 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
              <ReceiptText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold tracking-tight text-foreground">{formatCurrency(ledger.lease.monthlyRent)}</div>
            <p className="mt-1 text-xs text-muted-foreground">Lease charge cadence.</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500 overflow-hidden hover:shadow-md transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2 bg-purple-50/50 dark:bg-purple-950/20">
            <CardTitle className="text-sm font-medium text-purple-700 dark:text-purple-400">Lease Term</CardTitle>
            <div className="p-2 bg-purple-100 dark:bg-purple-900/50 rounded-lg">
              <CalendarClock className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="text-sm font-bold tracking-tight text-foreground">
              {formatDate(ledger.lease.startDate)} - {ledger.lease.endDate ? formatDate(ledger.lease.endDate) : "Open"}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Current active lease window.</p>
          </CardContent>
        </Card>
      </div>

      {/* Ledger table — sortable by date, shows charges and payments with accounts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">AutoPay</CardTitle>
          <p className="text-sm text-muted-foreground">
            Use your last saved Stripe payment method for monthly automatic payments.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Run day (1-28)</Label>
              <Input
                type="number"
                min={1}
                max={28}
                value={autopayDay}
                onChange={(e) => setAutopayDay(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Max payment (optional)</Label>
              <Input
                type="number"
                min={0}
                placeholder="No cap"
                value={autopayMaxAmount}
                onChange={(e) => setAutopayMaxAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Saved method</Label>
              <p className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
                {ledger.autopays[0]?.paymentMethodLast4
                  ? `Card ending in ${ledger.autopays[0].paymentMethodLast4}`
                  : "No saved method yet"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={autopaySaving}
              onClick={() => saveAutopay(true)}
            >
              {autopaySaving ? "Saving..." : "Enable AutoPay"}
            </Button>
            <Button
              variant="outline"
              disabled={autopaySaving}
              onClick={() => saveAutopay(false)}
            >
              Disable AutoPay
            </Button>
            <p className="text-sm text-muted-foreground">
              Status: {ledger.autopays[0]?.status === "active" ? "Active" : "Inactive"}
              {ledger.autopays[0]?.nextRun
                ? ` • Next run ${formatDate(ledger.autopays[0].nextRun)}`
                : ""}
            </p>
          </div>
          {ledger.autopays[0]?.lastStatus ? (
            <p className="text-xs text-muted-foreground">Last run: {ledger.autopays[0].lastStatus}</p>
          ) : null}
          {autopayMessage ? (
            <p className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm">
              {autopayMessage}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* Ledger table — sortable by date, shows charges and payments with accounts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ledger</CardTitle>
          <p className="text-sm text-muted-foreground">
            Charges and payments for your lease. Click the date column header to sort.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <LedgerTable
            rows={ledgerRows}
            dateSort={dateSort}
            onDateSortChange={() => setDateSort((s) => (s === "asc" ? "desc" : "asc"))}
          />
        </CardContent>
      </Card>

      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Payment</DialogTitle>
            <DialogDescription>
              Payment is allocated to your oldest charges first, then processed in Stripe Checkout.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input
                type="number"
                placeholder="0.00"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Memo (optional)</Label>
              <Textarea
                placeholder="Optional note for this payment"
                value={paymentMemo}
                onChange={(e) => setPaymentMemo(e.target.value)}
              />
            </div>
          </div>
          {paymentError ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {paymentError}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>
              Cancel
            </Button>
            <Button onClick={submitPayment} disabled={payDisabled}>
              {submitting ? "Submitting..." : "Continue to Checkout"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
