"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LedgerTable, type LedgerTableRow } from "@/components/ledger/ledger-table";
import { formatDate } from "@/lib/utils";

interface LedgerCharge {
  id: string;
  description: string;
  dueDate: string;
  amount: number;
  account: { accountNumber: string; name: string };
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
  allocations?: PaymentAllocation[];
}

interface TenantLedgerResponse {
  summary: {
    currentBalance: number;
  };
  charges: LedgerCharge[];
  payments: PaymentRecord[];
  autopays: Array<{
    status: "active" | "inactive";
    nextRun: string | null;
    dayOfMonth: number;
    maxAmount: number | null;
    paymentMethodLast4: string | null;
    lastStatus: string | null;
  }>;
}

export function TenantTransactions({
  openPayOnLoad = false,
  checkoutSessionId = "",
  paymentResult = "",
}: {
  openPayOnLoad?: boolean;
  checkoutSessionId?: string;
  paymentResult?: string;
}) {
  const [loading, setLoading] = useState(true);
  const [ledger, setLedger] = useState<TenantLedgerResponse | null>(null);
  const [ledgerError, setLedgerError] = useState("");
  const [dateSort, setDateSort] = useState<"asc" | "desc">("desc");
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showAutopayDialog, setShowAutopayDialog] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMemo, setPaymentMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [autopaySaving, setAutopaySaving] = useState(false);
  const [autopayMessage, setAutopayMessage] = useState("");
  const [autopayDay, setAutopayDay] = useState("1");
  const [autopayMaxAmount, setAutopayMaxAmount] = useState("");
  const [checkoutNotice, setCheckoutNotice] = useState("");

  const refreshLedger = useCallback(async () => {
    try {
      const res = await fetch("/api/tenant-ledger/me");
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setLedger(null);
        setLedgerError(data?.error || "Unable to load tenant transactions.");
        setLoading(false);
        return;
      }
      setLedger(await res.json());
      setLedgerError("");
      setLoading(false);
    } catch {
      setLedger(null);
      setLedgerError("Unable to load tenant transactions.");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshLedger();
  }, [refreshLedger]);

  useEffect(() => {
    if (openPayOnLoad) {
      setShowPaymentDialog(true);
    }
  }, [openPayOnLoad]);

  useEffect(() => {
    const config = ledger?.autopays?.[0];
    if (!config) return;
    setAutopayDay(String(config.dayOfMonth || 1));
    setAutopayMaxAmount(config.maxAmount ? String(config.maxAmount) : "");
  }, [ledger]);

  const payDisabled = useMemo(() => {
    const parsed = parseFloat(paymentAmount);
    return !parsed || parsed <= 0 || submitting;
  }, [paymentAmount, submitting]);

  const ledgerRows = useMemo((): LedgerTableRow[] => {
    if (!ledger) return [];
    const rows: LedgerTableRow[] = [];

    for (const c of ledger.charges) {
      rows.push({
        id: `charge-${c.id}`,
        date: c.dueDate,
        type: "charge",
        description: c.description,
        account: `${c.account.accountNumber} ${c.account.name}`,
        amount: c.amount,
        runningBalance: 0,
        paymentStatus: undefined,
      });
    }

    // Show pending and confirmed payments so tenants can see submissions immediately.
    for (const p of ledger.payments) {
      const allocs = p.allocations ?? [];
      if (allocs.length === 0) {
        rows.push({
          id: `payment-${p.id}`,
          date: p.submittedAt,
          type: "payment",
          description: "Payment",
          account: "-",
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

    const byDateAsc = [...rows].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let balance = 0;
    for (const row of byDateAsc) {
      const amountForBalance = row.type === "payment" && row.paymentStatus !== "confirmed" ? 0 : row.amount;
      balance += amountForBalance;
      row.runningBalance = balance;
    }

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
        body: JSON.stringify({ amount: parsed, memo: paymentMemo }),
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

  useEffect(() => {
    const processCheckoutResult = async () => {
      if (!checkoutSessionId || paymentResult !== "success") {
        if (paymentResult === "cancelled") {
          setCheckoutNotice("Payment was cancelled before completion.");
          window.history.replaceState({}, "", "/transactions");
        }
        return;
      }

      try {
        const res = await fetch("/api/tenant-payments/sync-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: checkoutSessionId }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setCheckoutNotice(data?.error || "Payment was submitted, but we could not verify Stripe status yet.");
        } else if (data?.payment?.paymentCapturedAt) {
          setCheckoutNotice("Payment submitted successfully and is pending manager confirmation.");
        } else {
          setCheckoutNotice("Payment submitted. Stripe is still finalizing status, please refresh in a moment.");
        }
        await refreshLedger();
      } catch {
        setCheckoutNotice("Payment was submitted, but status sync failed. Please refresh in a moment.");
      } finally {
        window.history.replaceState({}, "", "/transactions");
      }
    };

    processCheckoutResult();
  }, [checkoutSessionId, paymentResult, refreshLedger]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading transactions...</p>;
  }

  if (!ledger) {
    return (
      <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
        {ledgerError || "Unable to load transactions."}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Transactions</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowAutopayDialog(true)}>
            Set Up AutoPay
          </Button>
          <Button onClick={() => setShowPaymentDialog(true)}>
            <Wallet className="mr-2 h-4 w-4" />
            Make Payment
          </Button>
        </div>
      </div>

      <Card id="ledger" className="scroll-mt-20">
        <CardHeader>
          <CardTitle className="text-base">Ledger</CardTitle>
          <p className="text-sm text-muted-foreground">
            Charges and payments for your lease. Click the date column header to sort.
          </p>
        </CardHeader>
        {checkoutNotice ? (
          <CardContent className="pb-0">
            <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              {checkoutNotice}
            </p>
          </CardContent>
        ) : null}
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
              <Input type="number" placeholder="0.00" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} />
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

      <Dialog open={showAutopayDialog} onOpenChange={setShowAutopayDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Up AutoPay</DialogTitle>
            <DialogDescription>
              Use your saved Stripe payment method for automatic monthly payments.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2 max-w-[220px]">
              <Label>Run day (1-28)</Label>
              <Input
                type="number"
                min={1}
                max={28}
                value={autopayDay}
                onChange={(e) => setAutopayDay(e.target.value)}
              />
            </div>
            <div className="space-y-2 max-w-[220px]">
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
              <Label>Saved payment method</Label>
              <p className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
                {ledger.autopays[0]?.paymentMethodLast4
                  ? `Method ending in ${ledger.autopays[0].paymentMethodLast4}`
                  : "No saved method yet"}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              Status: {ledger.autopays[0]?.status === "active" ? "Active" : "Inactive"}
              {ledger.autopays[0]?.nextRun ? ` - Next run ${formatDate(ledger.autopays[0].nextRun)}` : ""}
            </p>
            {ledger.autopays[0]?.lastStatus ? (
              <p className="text-xs text-muted-foreground">Last run: {ledger.autopays[0].lastStatus}</p>
            ) : null}
            {autopayMessage ? (
              <p className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm">
                {autopayMessage}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAutopayDialog(false)} disabled={autopaySaving}>
              Close
            </Button>
            <Button variant="outline" disabled={autopaySaving} onClick={() => saveAutopay(false)}>
              Disable AutoPay
            </Button>
            <Button disabled={autopaySaving} onClick={() => saveAutopay(true)}>
              {autopaySaving ? "Saving..." : "Enable AutoPay"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
