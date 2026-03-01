"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  FileSignature,
  Users,
  Home,
  Building2,
  ReceiptText,
  DollarSign,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { LedgerTable, type LedgerTableRow } from "@/components/ledger/ledger-table";
import { formatCurrency, formatDate } from "@/lib/utils";

/* ============================================================================
   Lease Detail Page — PM view with Details and Ledger tabs
   ============================================================================ */

interface LeaseDetail {
  id: string;
  startDate: string;
  endDate: string | null;
  monthlyRent: number;
  deposit: number;
  status: string;
  notes: string | null;
  tenant: { id: string; firstName: string; lastName: string; email: string | null };
  unit: {
    unitNumber: string;
    address: {
      street: string;
      city: string;
      state: string;
      property: { name: string };
    };
  };
}

interface LedgerCharge {
  id: string;
  description: string;
  dueDate: string;
  amount: number;
  paidAmount: number;
  status: string;
  account: { accountNumber: string; name: string };
  pendingAppliedAmount?: number;
}

interface LedgerPayment {
  id: string;
  amount: number;
  status: string;
  submittedAt: string;
  confirmedAt: string | null;
  memo: string | null;
  allocations: {
    ledgerChargeDescription: string;
    allocatedAmount: number;
    account?: { accountNumber: string; name: string };
  }[];
}

interface LeaseLedgerResponse {
  lease: {
    id: string;
    tenantName: string;
    tenantEmail: string | null;
    unitNumber: string;
    propertyName: string;
    address: string;
    monthlyRent: number;
    deposit: number;
    startDate: string;
    endDate: string | null;
    status: string;
  };
  summary: {
    currentBalance: number;
    outstandingCharges: number;
    pendingConfirmationAmount: number;
  };
  charges: LedgerCharge[];
  payments: LedgerPayment[];
}

export default function LeaseDetailPage() {
  const params = useParams<{ id: string }>();
  const leaseId = params?.id;

  const [lease, setLease] = useState<LeaseDetail | null>(null);
  const [ledger, setLedger] = useState<LeaseLedgerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("details");
  const [dateSort, setDateSort] = useState<"asc" | "desc">("desc");
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState<"all" | "charge" | "payment">("all");

  // PM manual ledger actions
  const [showChargeDialog, setShowChargeDialog] = useState(false);
  const [chargeDescription, setChargeDescription] = useState("");
  const [chargeAmount, setChargeAmount] = useState("");
  const [chargeDueDate, setChargeDueDate] = useState(new Date().toISOString().split("T")[0]);

  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMemo, setPaymentMemo] = useState("");

  const [showCreditDialog, setShowCreditDialog] = useState(false);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditMemo, setCreditMemo] = useState("");
  const [posting, setPosting] = useState(false);
  const [postMessage, setPostMessage] = useState("");

  const fetchLease = useCallback(async () => {
    if (!leaseId) return;
    const res = await fetch(`/api/leases/${leaseId}`);
    if (res.ok) {
      setLease(await res.json());
    } else {
      setLease(null);
    }
    setLoading(false);
  }, [leaseId]);

  const fetchLedger = useCallback(async () => {
    if (!leaseId) return;
    setLedgerLoading(true);
    const res = await fetch(`/api/leases/${leaseId}/ledger`);
    if (res.ok) {
      setLedger(await res.json());
    } else {
      setLedger(null);
    }
    setLedgerLoading(false);
  }, [leaseId]);

  useEffect(() => {
    fetchLease();
  }, [fetchLease]);

  // Fetch ledger when user switches to Ledger tab
  useEffect(() => {
    if (activeTab === "ledger" && leaseId) {
      fetchLedger();
    }
  }, [activeTab, leaseId, fetchLedger]);

  // Build unified ledger rows (same format as tenant portal)
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
      });
    }

    for (const p of ledger.payments) {
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
          const acct = a.account
            ? `${a.account.accountNumber} ${a.account.name}`
            : "—";
          rows.push({
            id: `payment-${p.id}-${i}`,
            date: p.submittedAt,
            type: "payment",
            description: a.ledgerChargeDescription,
            account: acct,
            amount: -a.allocatedAmount,
            runningBalance: 0,
            paymentStatus: p.status,
          });
        }
      }
    }

    // Sort by date ascending for running balance
    const byDateAsc = [...rows].sort((a, b) => {
      const dA = new Date(a.date).getTime();
      const dB = new Date(b.date).getTime();
      return dA - dB;
    });

    // Only confirmed payments reduce balance; rejected/pending never applied
    let balance = 0;
    for (const row of byDateAsc) {
      const amountForBalance =
        row.type === "payment" && row.paymentStatus !== "confirmed"
          ? 0
          : row.amount;
      balance += amountForBalance;
      row.runningBalance = balance;
    }

    return byDateAsc.sort((a, b) => {
      const dA = new Date(a.date).getTime();
      const dB = new Date(b.date).getTime();
      return dateSort === "asc" ? dA - dB : dB - dA;
    });
  }, [ledger, dateSort]);

  const filteredLedgerRows = useMemo(() => {
    const query = ledgerSearch.trim().toLowerCase();
    return ledgerRows.filter((row) => {
      if (ledgerTypeFilter !== "all" && row.type !== ledgerTypeFilter) return false;
      if (!query) return true;
      return (
        row.description.toLowerCase().includes(query) ||
        row.account.toLowerCase().includes(query)
      );
    });
  }, [ledgerRows, ledgerSearch, ledgerTypeFilter]);

  const postLedgerEntry = async (payload: Record<string, unknown>) => {
    if (!leaseId) return;
    setPosting(true);
    setPostMessage("");
    try {
      const res = await fetch(`/api/leases/${leaseId}/ledger/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setPostMessage(data?.error || "Failed to post ledger entry.");
        return;
      }
      setPostMessage("Ledger updated successfully.");
      await fetchLedger();
      setShowChargeDialog(false);
      setShowPaymentDialog(false);
      setShowCreditDialog(false);
      setChargeDescription("");
      setChargeAmount("");
      setPaymentAmount("");
      setPaymentMemo("");
      setCreditAmount("");
      setCreditMemo("");
    } finally {
      setPosting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge variant="success">Active</Badge>;
      case "expired":
        return <Badge variant="secondary">Expired</Badge>;
      case "terminated":
        return <Badge variant="destructive">Terminated</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Loading lease...</p>
      </div>
    );
  }

  if (!lease) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" asChild>
          <Link href="/leases">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Leases
          </Link>
        </Button>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileSignature className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-lg font-medium">Lease not found</p>
            <p className="text-sm text-muted-foreground">
              The lease may have been deleted or the link is invalid.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const tenantName = `${lease.tenant.firstName} ${lease.tenant.lastName}`;

  return (
    <div className="space-y-6">
      {/* Header with back link */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/leases">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Leases
          </Link>
        </Button>
      </div>

      {/* Lease title and status */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {tenantName} — Unit {lease.unit.unitNumber}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {lease.unit.address.property.name} · {lease.unit.address.street},{" "}
            {lease.unit.address.city}
          </p>
        </div>
        {getStatusBadge(lease.status)}
      </div>

      {/* Tabs: Details, Ledger */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
        </TabsList>

        {/* ── Details Tab ───────────────────────────────────────────────── */}
        <TabsContent value="details" className="mt-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-4 w-4" /> Tenant
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="font-medium">{tenantName}</p>
                {lease.tenant.email && (
                  <p className="text-sm text-muted-foreground">{lease.tenant.email}</p>
                )}
                <Button variant="outline" size="sm" asChild>
                  <Link href="/tenants">View Tenants</Link>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Home className="h-4 w-4" /> Unit & Property
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-1">
                  <Building2 className="h-3 w-3 text-muted-foreground" />
                  <span>{lease.unit.address.property.name}</span>
                </div>
                <p className="text-sm">
                  {lease.unit.address.street}, {lease.unit.address.city},{" "}
                  {lease.unit.address.state}
                </p>
                <p className="text-sm font-medium">Unit {lease.unit.unitNumber}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Calendar className="h-4 w-4" /> Lease Term
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p>
                  <span className="text-muted-foreground">Start:</span>{" "}
                  {formatDate(lease.startDate)}
                </p>
                <p>
                  <span className="text-muted-foreground">End:</span>{" "}
                  {lease.endDate ? formatDate(lease.endDate) : "Month-to-month"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <DollarSign className="h-4 w-4" /> Financial
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p>
                  <span className="text-muted-foreground">Monthly Rent:</span>{" "}
                  {formatCurrency(lease.monthlyRent)}
                </p>
                <p>
                  <span className="text-muted-foreground">Security Deposit:</span>{" "}
                  {formatCurrency(lease.deposit)}
                </p>
              </CardContent>
            </Card>
          </div>

          {lease.notes && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-base">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {lease.notes}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Ledger Tab ────────────────────────────────────────────────── */}
        <TabsContent value="ledger" className="mt-6">
          {ledgerLoading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">Loading ledger...</p>
            </div>
          ) : ledger ? (
            <div className="space-y-6">
              {/* Summary cards */}
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Current Balance
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-semibold">
                      {formatCurrency(ledger.summary.currentBalance)}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Pending Confirmation
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-semibold">
                      {formatCurrency(ledger.summary.pendingConfirmationAmount)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Tenant payments awaiting PM approval
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Monthly Rent
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-semibold">
                      {formatCurrency(ledger.lease.monthlyRent)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Manual Ledger Actions (PM)</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" onClick={() => setShowChargeDialog(true)}>Post Charge</Button>
                  <Button variant="outline" onClick={() => setShowPaymentDialog(true)}>Receive Payment</Button>
                  <Button variant="outline" onClick={() => setShowCreditDialog(true)}>Issue Credit</Button>
                  <p className="text-xs text-muted-foreground">
                    These actions update lease ledger balances only and do not create accounting journal entries.
                  </p>
                  {postMessage ? <p className="w-full text-sm text-muted-foreground">{postMessage}</p> : null}
                </CardContent>
              </Card>

              {/* Ledger table — same format as tenant portal */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ReceiptText className="h-4 w-4" /> Ledger
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Charges and payments for this lease. Click the date column header to sort.
                  </p>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <Input
                      value={ledgerSearch}
                      onChange={(e) => setLedgerSearch(e.target.value)}
                      placeholder="Search description or account..."
                      className="w-64"
                    />
                    <Select
                      value={ledgerTypeFilter}
                      onChange={(e) => setLedgerTypeFilter(e.target.value as "all" | "charge" | "payment")}
                      className="w-40"
                    >
                      <option value="all">All types</option>
                      <option value="charge">Charges</option>
                      <option value="payment">Payments</option>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <LedgerTable
                    rows={filteredLedgerRows}
                    dateSort={dateSort}
                    onDateSortChange={() => setDateSort((s) => (s === "asc" ? "desc" : "asc"))}
                  />
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <p className="text-muted-foreground">Unable to load ledger.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={showChargeDialog} onOpenChange={setShowChargeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Post Charge</DialogTitle>
            <DialogDescription>Add a manual charge to this lease ledger.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Description</Label>
              <Input value={chargeDescription} onChange={(e) => setChargeDescription(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Amount</Label>
                <Input type="number" min="0" step="0.01" value={chargeAmount} onChange={(e) => setChargeAmount(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Due Date</Label>
                <Input type="date" value={chargeDueDate} onChange={(e) => setChargeDueDate(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowChargeDialog(false)}>Cancel</Button>
            <Button
              onClick={() => postLedgerEntry({
                action: "charge",
                description: chargeDescription,
                amount: chargeAmount,
                dueDate: chargeDueDate,
              })}
              disabled={posting || !chargeDescription.trim() || !chargeAmount || !chargeDueDate}
            >
              {posting ? "Posting..." : "Post Charge"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Receive Payment</DialogTitle>
            <DialogDescription>Apply a manual payment to oldest outstanding charges.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Amount</Label>
              <Input type="number" min="0" step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Memo (optional)</Label>
              <Textarea value={paymentMemo} onChange={(e) => setPaymentMemo(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>Cancel</Button>
            <Button
              onClick={() => postLedgerEntry({
                action: "payment",
                amount: paymentAmount,
                memo: paymentMemo,
              })}
              disabled={posting || !paymentAmount}
            >
              {posting ? "Posting..." : "Receive Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreditDialog} onOpenChange={setShowCreditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Issue Credit</DialogTitle>
            <DialogDescription>Apply a credit against outstanding charges for this lease.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Amount</Label>
              <Input type="number" min="0" step="0.01" value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Memo (optional)</Label>
              <Textarea value={creditMemo} onChange={(e) => setCreditMemo(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreditDialog(false)}>Cancel</Button>
            <Button
              onClick={() => postLedgerEntry({
                action: "credit",
                amount: creditAmount,
                memo: creditMemo,
              })}
              disabled={posting || !creditAmount}
            >
              {posting ? "Posting..." : "Issue Credit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
