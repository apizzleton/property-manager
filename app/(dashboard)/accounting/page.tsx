"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Plus, Calculator, ChevronRight, ChevronDown, Trash2, DollarSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { formatCurrency, formatDate } from "@/lib/utils";

/* ============================================================================
   Accounting Page — Chart of Accounts + Journal Entries
   ============================================================================ */

interface Account {
  id: string;
  accountNumber: string;
  name: string;
  type: string;
  subType: string | null;
  isActive: boolean;
  parentId: string | null;
  children: Account[];
  journalEntryLines: { debit: number; credit: number }[];
}

interface JournalLine {
  id: string;
  accountId: string;
  debit: number;
  credit: number;
  description: string | null;
  account: { accountNumber: string; name: string };
}

interface JournalEntry {
  id: string;
  date: string;
  memo: string | null;
  reference: string | null;
  property: { name: string } | null;
  lines: JournalLine[];
}

interface Property {
  id: string;
  name: string;
}

interface PendingTransaction {
  id: string;
  amount: number;
  status: "pending_confirmation";
  initiatedByRole: "tenant" | "property_manager";
  initiatedFrom: string;
  memo: string | null;
  submittedAt: string;
  tenant: {
    firstName: string;
    lastName: string;
  };
  lease: {
    id: string;
    unit: {
      unitNumber: string;
      address: {
        property: { id: string; name: string };
      };
    };
  };
  allocationSummary: {
    id: string;
    amount: number;
    charge: {
      id: string;
      description: string;
      dueDate: string;
      accountNumber: string;
      accountName: string;
    };
  }[];
}

type DatePreset = "mtd" | "qtd" | "ytd" | "last_30" | "last_90" | "all_time" | "custom";

function toDateInputValue(date: Date) {
  return date.toISOString().split("T")[0];
}

function resolveDateRange(
  preset: DatePreset,
  customStart: string,
  customEnd: string
): { start: string; end: string } {
  const now = new Date();
  const end = toDateInputValue(now);

  if (preset === "custom") {
    return { start: customStart, end: customEnd };
  }
  if (preset === "all_time") {
    return { start: "", end: "" };
  }
  if (preset === "mtd") {
    return { start: toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)), end };
  }
  if (preset === "qtd") {
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
    return { start: toDateInputValue(new Date(now.getFullYear(), quarterStartMonth, 1)), end };
  }
  if (preset === "ytd") {
    return { start: toDateInputValue(new Date(now.getFullYear(), 0, 1)), end };
  }

  const rollingDays = preset === "last_90" ? 89 : 29;
  const startDate = new Date(now);
  startDate.setDate(now.getDate() - rollingDays);
  return { start: toDateInputValue(startDate), end };
}

// Form line for new journal entry
interface FormLine {
  accountId: string;
  debit: string;
  credit: string;
  description: string;
}

interface Portfolio { id: string; name: string; propertyIds: string[]; }

export default function AccountingPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [pendingTransactions, setPendingTransactions] = useState<PendingTransaction[]>([]);
  const [glLines, setGlLines] = useState<Array<{
    id: string;
    debit: number;
    credit: number;
    description: string | null;
    account: { accountNumber: string; name: string };
    journalEntry: { date: string; memo: string | null; reference: string | null; property: { name: string } | null };
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [portfolioId, setPortfolioId] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [activeTab, setActiveTab] = useState("transactions");
  const [datePreset, setDatePreset] = useState<DatePreset>("mtd");
  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    return toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1));
  });
  const [endDate, setEndDate] = useState(() => toDateInputValue(new Date()));
  const [glAccountId, setGlAccountId] = useState("");

  // Expanded accounts for tree view
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Journal entry dialog
  const [showEntryDialog, setShowEntryDialog] = useState(false);
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split("T")[0]);
  const [entryMemo, setEntryMemo] = useState("");
  const [entryRef, setEntryRef] = useState("");
  const [entryPropertyId, setEntryPropertyId] = useState("");
  const [entryLines, setEntryLines] = useState<FormLine[]>([
    { accountId: "", debit: "", credit: "", description: "" },
    { accountId: "", debit: "", credit: "", description: "" },
  ]);

  // Account dialog
  const [showAccountDialog, setShowAccountDialog] = useState(false);
  const [acctNumber, setAcctNumber] = useState("");
  const [acctName, setAcctName] = useState("");
  const [acctType, setAcctType] = useState("Asset");
  const [acctSubType, setAcctSubType] = useState("");
  const [acctParentId, setAcctParentId] = useState("");

  const fetchData = useCallback(async () => {
    const params = new URLSearchParams();
    if (portfolioId) params.set("portfolioId", portfolioId);
    if (propertyId) params.set("propertyId", propertyId);
    const qs = params.toString();
    const { fetchPortfolios } = await import("@/lib/fetchPortfolios");
    const [acctRes, entriesRes, propRes, ports, pendingRes] = await Promise.all([
      fetch("/api/accounts"),
      fetch(`/api/journal-entries${qs ? `?${qs}` : ""}`),
      fetch("/api/properties"),
      fetchPortfolios(),
      fetch(`/api/accounting/pending-transactions${qs ? `?${qs}` : ""}`),
    ]);
    setAccounts(await acctRes.json());
    setEntries(await entriesRes.json());
    const propData = await propRes.json();
    setProperties(Array.isArray(propData) ? propData.map((p: Property) => ({ id: p.id, name: p.name })) : []);
    setPortfolios(ports);
    if (pendingRes.ok) {
      setPendingTransactions(await pendingRes.json());
    } else {
      setPendingTransactions([]);
    }
    setLoading(false);
  }, [portfolioId, propertyId]);

  const fetchGeneralLedger = useCallback(async () => {
    const params = new URLSearchParams({ type: "general-ledger" });
    const range = resolveDateRange(datePreset, startDate, endDate);
    if (range.start) params.set("startDate", range.start);
    if (range.end) params.set("endDate", range.end);
    if (portfolioId) params.set("portfolioId", portfolioId);
    if (propertyId) params.set("propertyId", propertyId);
    if (glAccountId) params.set("accountId", glAccountId);

    const res = await fetch(`/api/reports?${params.toString()}`);
    const data = await res.json().catch(() => null);
    if (res.ok && Array.isArray(data?.lines)) {
      setGlLines(data.lines);
    } else {
      setGlLines([]);
    }
  }, [datePreset, startDate, endDate, portfolioId, propertyId, glAccountId]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchGeneralLedger(); }, [fetchGeneralLedger]);

  // ── Account helpers ─────────────────────────────────────────────────
  const toggleExpanded = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  // Compute account balance from its journal entry lines
  const getBalance = (acct: Account) => {
    const debits = acct.journalEntryLines.reduce((s, l) => s + l.debit, 0);
    const credits = acct.journalEntryLines.reduce((s, l) => s + l.credit, 0);
    if (acct.type === "Asset" || acct.type === "Expense") return debits - credits;
    return credits - debits;
  };

  // Build tree of accounts (only top-level parents)
  const topLevelAccounts = accounts.filter((a) => !a.parentId);

  const getChildren = (parentId: string) => accounts.filter((a) => a.parentId === parentId);

  const saveAccount = async () => {
    await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountNumber: acctNumber,
        name: acctName,
        type: acctType,
        subType: acctSubType || null,
        parentId: acctParentId || null,
      }),
    });
    setShowAccountDialog(false);
    fetchData();
  };

  // ── Journal entry helpers ───────────────────────────────────────────
  const addLine = () => {
    setEntryLines([...entryLines, { accountId: "", debit: "", credit: "", description: "" }]);
  };

  const removeLine = (idx: number) => {
    if (entryLines.length <= 2) return;
    setEntryLines(entryLines.filter((_, i) => i !== idx));
  };

  const updateLine = (idx: number, field: keyof FormLine, value: string) => {
    const updated = [...entryLines];
    updated[idx] = { ...updated[idx], [field]: value };
    // If user types in debit, clear credit and vice versa
    if (field === "debit" && value) updated[idx].credit = "";
    if (field === "credit" && value) updated[idx].debit = "";
    setEntryLines(updated);
  };

  const totalDebits = entryLines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
  const totalCredits = entryLines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01 && totalDebits > 0;

  const saveEntry = async () => {
    const lines = entryLines
      .filter((l) => l.accountId)
      .map((l) => ({
        accountId: l.accountId,
        debit: parseFloat(l.debit) || 0,
        credit: parseFloat(l.credit) || 0,
        description: l.description,
      }));

    const res = await fetch("/api/journal-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: entryDate,
        memo: entryMemo,
        reference: entryRef,
        propertyId: entryPropertyId || null,
        lines,
      }),
    });

    if (res.ok) {
      setShowEntryDialog(false);
      setEntryLines([
        { accountId: "", debit: "", credit: "", description: "" },
        { accountId: "", debit: "", credit: "", description: "" },
      ]);
      setEntryMemo("");
      setEntryRef("");
      setEntryPropertyId("");
      fetchData();
    } else {
      const err = await res.json();
      alert(err.error || "Failed to save entry");
    }
  };

  const deleteEntry = async (id: string) => {
    if (!confirm("Delete this journal entry?")) return;
    await fetch(`/api/journal-entries/${id}`, { method: "DELETE" });
    fetchData();
  };

  const confirmPendingTransaction = async (id: string) => {
    const res = await fetch(`/api/accounting/pending-transactions/${id}/confirm`, {
      method: "POST",
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "Failed to confirm transaction.");
      return;
    }
    fetchData();
  };

  const rejectPendingTransaction = async (id: string) => {
    const res = await fetch(`/api/accounting/pending-transactions/${id}/reject`, {
      method: "POST",
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "Failed to reject transaction.");
      return;
    }
    fetchData();
  };

  // Render an account row with children (recursive)
  const renderAccountRow = (acct: Account, depth: number = 0) => {
    const children = getChildren(acct.id);
    const hasChildren = children.length > 0;
    const isExp = expanded.has(acct.id);
    const balance = getBalance(acct);

    return (
      <React.Fragment key={acct.id}>
        <TableRow className={depth === 0 ? "font-semibold" : ""}>
          <TableCell style={{ paddingLeft: `${depth * 24 + 16}px` }}>
            <div className="flex items-center gap-1">
              {hasChildren ? (
                <button onClick={() => toggleExpanded(acct.id)} className="p-0.5">
                  {isExp ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
              ) : (
                <span className="w-5" />
              )}
              <span className="text-muted-foreground">{acct.accountNumber}</span>
            </div>
          </TableCell>
          <TableCell>{acct.name}</TableCell>
          <TableCell>
            <Badge variant="outline" className="text-[10px]">{acct.type}</Badge>
          </TableCell>
          <TableCell className="text-right">
            {balance !== 0 ? formatCurrency(balance) : "—"}
          </TableCell>
        </TableRow>
        {isExp && children.map((child) => renderAccountRow(child, depth + 1))}
      </React.Fragment>
    );
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><p className="text-muted-foreground">Loading...</p></div>;
  }

  // Flat list of leaf accounts for select dropdowns
  const leafAccounts = accounts.filter(
    (a) => !accounts.some((child) => child.parentId === a.id)
  );

  const propertyOptions = portfolioId
    ? properties.filter((p) => {
        const port = portfolios.find((pf) => pf.id === portfolioId);
        return port && port.propertyIds.includes(p.id);
      })
    : properties;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Accounting</h1>
        <p className="text-muted-foreground">Double-entry bookkeeping for your properties.</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Period</Label>
          <Select value={datePreset} onChange={(e) => setDatePreset(e.target.value as DatePreset)} className="w-40">
            <option value="mtd">MTD</option>
            <option value="qtd">QTD</option>
            <option value="ytd">YTD</option>
            <option value="last_30">Last 30 Days</option>
            <option value="last_90">Last 90 Days</option>
            <option value="all_time">All Time</option>
            <option value="custom">Custom</option>
          </Select>
        </div>
        {datePreset === "custom" ? (
          <>
            <div className="space-y-1">
              <Label className="text-xs">Start</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-36" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">End</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-36" />
            </div>
          </>
        ) : null}
        <div className="space-y-1">
          <Label className="text-xs">Portfolio</Label>
          <Select value={portfolioId} onChange={(e) => { setPortfolioId(e.target.value); setPropertyId(""); }} className="w-44">
            <option value="">All Portfolios</option>
            {portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Property</Label>
          <Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className="w-44">
            <option value="">All Properties</option>
            {propertyOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </div>
      </div>

      <Tabs defaultValue="transactions" value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="chart">Chart of Accounts</TabsTrigger>
          <TabsTrigger value="journal">Journal Entries</TabsTrigger>
          <TabsTrigger value="pending">Pending Transactions</TabsTrigger>
        </TabsList>

        {/* ── Transactions Tab (General Ledger) ─────────────────────────── */}
        <TabsContent value="transactions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>General Ledger</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Account</Label>
                  <Select value={glAccountId} onChange={(e) => setGlAccountId(e.target.value)} className="w-72">
                    <option value="">All Accounts</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.accountNumber} — {a.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button variant="outline" onClick={fetchGeneralLedger}>Refresh</Button>
              </div>

              {glLines.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No ledger lines found for the selected filters.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Memo</TableHead>
                      <TableHead>Ref</TableHead>
                      <TableHead>Property</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Credit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {glLines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>{formatDate(line.journalEntry.date)}</TableCell>
                        <TableCell>{line.account.accountNumber} — {line.account.name}</TableCell>
                        <TableCell>{line.journalEntry.memo || "—"}</TableCell>
                        <TableCell>{line.journalEntry.reference || "—"}</TableCell>
                        <TableCell>{line.journalEntry.property?.name || "—"}</TableCell>
                        <TableCell>{line.description || "—"}</TableCell>
                        <TableCell className="text-right">{line.debit > 0 ? formatCurrency(line.debit) : ""}</TableCell>
                        <TableCell className="text-right">{line.credit > 0 ? formatCurrency(line.credit) : ""}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Chart of Accounts Tab ────────────────────────────────────── */}
        <TabsContent value="chart" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => { setAcctNumber(""); setAcctName(""); setAcctType("Asset"); setAcctSubType(""); setAcctParentId(""); setShowAccountDialog(true); }}>
              <Plus className="mr-2 h-4 w-4" /> Add Account
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-40">Number</TableHead>
                    <TableHead>Account Name</TableHead>
                    <TableHead className="w-32">Type</TableHead>
                    <TableHead className="w-32 text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topLevelAccounts.map((acct) => renderAccountRow(acct))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Journal Entries Tab ───────────────────────────────────────── */}
        <TabsContent value="journal" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setShowEntryDialog(true)}>
              <Plus className="mr-2 h-4 w-4" /> New Entry
            </Button>
          </div>

          {entries.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Calculator className="mb-4 h-12 w-12 text-muted-foreground" />
                <p className="mb-2 text-lg font-medium">No journal entries</p>
                <p className="text-sm text-muted-foreground">Create your first journal entry.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {entries.map((entry) => {
                const total = entry.lines.reduce((s, l) => s + l.debit, 0);
                return (
                  <Card key={entry.id}>
                    <CardHeader className="flex flex-row items-center justify-between py-3">
                      <div className="flex items-center gap-3">
                        <DollarSign className="h-4 w-4 text-primary" />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{formatDate(entry.date)}</span>
                            {entry.reference && <Badge variant="outline" className="text-[10px]">#{entry.reference}</Badge>}
                            {entry.property && <Badge variant="secondary" className="text-[10px]">{entry.property.name}</Badge>}
                          </div>
                          {entry.memo && <p className="text-xs text-muted-foreground">{entry.memo}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{formatCurrency(total)}</span>
                        <Button variant="ghost" size="icon" onClick={() => deleteEntry(entry.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Account</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead className="text-right">Debit</TableHead>
                            <TableHead className="text-right">Credit</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {entry.lines.map((line) => (
                            <TableRow key={line.id}>
                              <TableCell className="text-sm">
                                {line.account.accountNumber} — {line.account.name}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {line.description || "—"}
                              </TableCell>
                              <TableCell className="text-right text-sm">
                                {line.debit > 0 ? formatCurrency(line.debit) : ""}
                              </TableCell>
                              <TableCell className="text-right text-sm">
                                {line.credit > 0 ? formatCurrency(line.credit) : ""}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Pending Transactions Tab ─────────────────────────────────── */}
        <TabsContent value="pending" className="space-y-4">
          {pendingTransactions.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <DollarSign className="mb-4 h-12 w-12 text-muted-foreground" />
                <p className="mb-2 text-lg font-medium">No pending transactions</p>
                <p className="text-sm text-muted-foreground">
                  Tenant-initiated payments requiring confirmation will appear here.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {pendingTransactions.map((transaction) => (
                <Card key={transaction.id}>
                  <CardHeader className="flex flex-row items-start justify-between py-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base">
                          {transaction.tenant.firstName} {transaction.tenant.lastName}
                        </CardTitle>
                        <Badge variant="warning">Pending Confirmation</Badge>
                        <Badge variant="outline" className="capitalize">
                          {transaction.initiatedFrom.replace("_", " ")}
                        </Badge>
                      </div>
                      <Link
                        href={`/leases/${transaction.lease.id}`}
                        className="mt-1 block text-sm text-muted-foreground hover:text-primary hover:underline"
                      >
                        {transaction.lease.unit.address.property.name} - Unit {transaction.lease.unit.unitNumber}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        Submitted {formatDate(transaction.submittedAt)}
                      </p>
                      {transaction.memo && (
                        <p className="mt-1 text-xs text-muted-foreground">Memo: {transaction.memo}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold">{formatCurrency(transaction.amount)}</p>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Charge</TableHead>
                          <TableHead>Revenue Account</TableHead>
                          <TableHead>Due Date</TableHead>
                          <TableHead className="text-right">Allocated</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {transaction.allocationSummary.map((allocation) => (
                          <TableRow key={allocation.id}>
                            <TableCell>{allocation.charge.description}</TableCell>
                            <TableCell>
                              {allocation.charge.accountNumber} — {allocation.charge.accountName}
                            </TableCell>
                            <TableCell>{formatDate(allocation.charge.dueDate)}</TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(allocation.amount)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        onClick={() => rejectPendingTransaction(transaction.id)}
                      >
                        Reject
                      </Button>
                      <Button onClick={() => confirmPendingTransaction(transaction.id)}>
                        Confirm & Post
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Add Account Dialog ──────────────────────────────────────────── */}
      <Dialog open={showAccountDialog} onOpenChange={setShowAccountDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Account</DialogTitle>
            <DialogDescription>Add a new account to the Chart of Accounts.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Account Number</Label>
                <Input placeholder="e.g. 4150" value={acctNumber} onChange={(e) => setAcctNumber(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={acctType} onChange={(e) => setAcctType(e.target.value)}>
                  <option value="Asset">Asset</option>
                  <option value="Liability">Liability</option>
                  <option value="Equity">Equity</option>
                  <option value="Revenue">Revenue</option>
                  <option value="Expense">Expense</option>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Account Name</Label>
              <Input placeholder="e.g. Pet Fee Income" value={acctName} onChange={(e) => setAcctName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Parent Account (optional)</Label>
              <Select value={acctParentId} onChange={(e) => setAcctParentId(e.target.value)}>
                <option value="">None (top-level)</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.accountNumber} — {a.name}</option>
                ))}
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAccountDialog(false)}>Cancel</Button>
            <Button onClick={saveAccount} disabled={!acctNumber || !acctName}>Add Account</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── New Journal Entry Dialog ────────────────────────────────────── */}
      <Dialog open={showEntryDialog} onOpenChange={setShowEntryDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>New Journal Entry</DialogTitle>
            <DialogDescription>Create a balanced double-entry transaction.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Reference #</Label>
                <Input placeholder="Optional" value={entryRef} onChange={(e) => setEntryRef(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Property</Label>
                <Select value={entryPropertyId} onChange={(e) => setEntryPropertyId(e.target.value)}>
                  <option value="">All / General</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Memo</Label>
              <Input placeholder="Description of this transaction" value={entryMemo} onChange={(e) => setEntryMemo(e.target.value)} />
            </div>

            {/* Journal lines */}
            <div className="space-y-2">
              <Label>Entry Lines</Label>
              <div className="rounded-lg border">
                <Table customizable={false}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="w-28">Debit</TableHead>
                      <TableHead className="w-28">Credit</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entryLines.map((line, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="p-1">
                          <Select
                            className="text-xs"
                            value={line.accountId}
                            onChange={(e) => updateLine(idx, "accountId", e.target.value)}
                          >
                            <option value="">Select account...</option>
                            {leafAccounts.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.accountNumber} — {a.name}
                              </option>
                            ))}
                          </Select>
                        </TableCell>
                        <TableCell className="p-1">
                          <Input
                            className="text-xs"
                            placeholder="Description"
                            value={line.description}
                            onChange={(e) => updateLine(idx, "description", e.target.value)}
                          />
                        </TableCell>
                        <TableCell className="p-1">
                          <Input
                            type="number"
                            className="text-xs text-right"
                            placeholder="0.00"
                            value={line.debit}
                            onChange={(e) => updateLine(idx, "debit", e.target.value)}
                          />
                        </TableCell>
                        <TableCell className="p-1">
                          <Input
                            type="number"
                            className="text-xs text-right"
                            placeholder="0.00"
                            value={line.credit}
                            onChange={(e) => updateLine(idx, "credit", e.target.value)}
                          />
                        </TableCell>
                        <TableCell className="p-1">
                          <button onClick={() => removeLine(idx)} className="p-1 text-destructive hover:bg-accent rounded" disabled={entryLines.length <= 2}>
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between">
                <Button variant="outline" size="sm" onClick={addLine}>
                  <Plus className="mr-1 h-3 w-3" /> Add Line
                </Button>
                <div className="flex items-center gap-4 text-sm">
                  <span>Debits: <strong>{formatCurrency(totalDebits)}</strong></span>
                  <span>Credits: <strong>{formatCurrency(totalCredits)}</strong></span>
                  {isBalanced ? (
                    <Badge variant="success">Balanced</Badge>
                  ) : (
                    <Badge variant="destructive">Unbalanced</Badge>
                  )}
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEntryDialog(false)}>Cancel</Button>
            <Button onClick={saveEntry} disabled={!isBalanced}>Post Entry</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
