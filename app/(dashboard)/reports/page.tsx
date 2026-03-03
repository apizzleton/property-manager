"use client";

import React, { useEffect, useState } from "react";
import { BarChart3, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/utils";

/* ============================================================================
   Reports Page — Trial Balance, P&L, Balance Sheet, Cash Flow, Rent Roll
   ============================================================================ */

interface Property { id: string; name: string; }
interface Portfolio { id: string; name: string; propertyIds: string[]; }
interface Account { id: string; accountNumber: string; name: string; }
type DatePreset = "mtd" | "qtd" | "ytd" | "last_30" | "last_90" | "all_time" | "custom";
type ExportCell = string | number;
type ExportPayload = {
  title: string;
  subtitle?: string;
  sheetName: string;
  headers: string[];
  rows: ExportCell[][];
  footerRows?: ExportCell[][];
};

function toDateInputValue(date: Date) {
  return date.toISOString().split("T")[0];
}

function resolveDateRange(
  preset: DatePreset,
  customStart: string,
  customEnd: string
): { start: string; end: string; label: string } {
  const now = new Date();
  const end = toDateInputValue(now);

  if (preset === "custom") {
    return {
      start: customStart,
      end: customEnd,
      label: `${customStart || "—"} to ${customEnd || "—"}`,
    };
  }

  if (preset === "all_time") {
    return { start: "", end: "", label: "All Time" };
  }

  if (preset === "mtd") {
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: toDateInputValue(startDate), end, label: "Month to Date" };
  }

  if (preset === "qtd") {
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
    const startDate = new Date(now.getFullYear(), quarterStartMonth, 1);
    return { start: toDateInputValue(startDate), end, label: "Quarter to Date" };
  }

  if (preset === "ytd") {
    const startDate = new Date(now.getFullYear(), 0, 1);
    return { start: toDateInputValue(startDate), end, label: "Year to Date" };
  }

  const rollingDays = preset === "last_90" ? 89 : 29;
  const startDate = new Date(now);
  startDate.setDate(now.getDate() - rollingDays);
  return {
    start: toDateInputValue(startDate),
    end,
    label: preset === "last_90" ? "Last 90 Days" : "Last 30 Days",
  };
}

export default function ReportsPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("trial-balance");

  // Filters
  const [portfolioId, setPortfolioId] = useState("");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(new Date().toISOString().split("T")[0]);
  const [datePreset, setDatePreset] = useState<DatePreset>("mtd");
  const [propertyId, setPropertyId] = useState("");
  const [rentRollAsOfDate, setRentRollAsOfDate] = useState(new Date().toISOString().split("T")[0]);

  // Report data
  const [trialBalance, setTrialBalance] = useState<Record<string, unknown> | null>(null);
  const [profitLoss, setProfitLoss] = useState<Record<string, unknown> | null>(null);
  const [balanceSheet, setBalanceSheet] = useState<Record<string, unknown> | null>(null);
  const [cashFlow, setCashFlow] = useState<Record<string, unknown> | null>(null);
  const [rentRoll, setRentRoll] = useState<Record<string, unknown> | null>(null);
  const [generalLedger, setGeneralLedger] = useState<Record<string, unknown> | null>(null);
  const [glAccountId, setGlAccountId] = useState("");
  const [exporting, setExporting] = useState<null | "pdf" | "excel">(null);

  // Fetch reference data on mount
  useEffect(() => {
    Promise.all([
      fetch("/api/properties").then((r) => r.json()),
      import("@/lib/fetchPortfolios").then(({ fetchPortfolios }) => fetchPortfolios()),
      fetch("/api/accounts").then((r) => r.json()),
    ]).then(([props, ports, accts]) => {
      setProperties(Array.isArray(props) ? props.map((p: Property) => ({ id: p.id, name: p.name })) : []);
      setPortfolios(ports);
      setAccounts(Array.isArray(accts) ? accts.map((a: Account) => ({ id: a.id, accountNumber: a.accountNumber, name: a.name })) : []);
    });
  }, []);

  // Property options constrained by portfolio when portfolio selected
  const propertyOptions = portfolioId
    ? properties.filter((p) => {
        const port = portfolios.find((pf) => pf.id === portfolioId);
        return port && port.propertyIds.includes(p.id);
      })
    : properties;

  // Report fetchers
  const fetchReport = async (type: string) => {
    setLoading(true);
    const params = new URLSearchParams({ type });
    const effectiveRange = resolveDateRange(datePreset, startDate, endDate);
    if (type === "rent-roll") {
      if (rentRollAsOfDate) params.set("asOfDate", rentRollAsOfDate);
    } else {
      if (effectiveRange.start) params.set("startDate", effectiveRange.start);
      if (effectiveRange.end) params.set("endDate", effectiveRange.end);
    }
    if (portfolioId) params.set("portfolioId", portfolioId);
    if (propertyId) params.set("propertyId", propertyId);
    if (type === "general-ledger" && glAccountId) params.set("accountId", glAccountId);

    const res = await fetch(`/api/reports?${params}`);
    const data = await res.json();
    setLoading(false);

    switch (type) {
      case "trial-balance": setTrialBalance(data); break;
      case "profit-loss": setProfitLoss(data); break;
      case "balance-sheet": setBalanceSheet(data); break;
      case "cash-flow": setCashFlow(data); break;
      case "rent-roll": setRentRoll(data); break;
      case "general-ledger": setGeneralLedger(data); break;
    }
  };

  // Type-safe accessor helpers
  const tb = trialBalance as { rows: { accountNumber: string; accountName: string; type: string; debit: number; credit: number }[]; totalDebits: number; totalCredits: number; isBalanced: boolean } | null;
  const pl = profitLoss as { revenue: { number: string; name: string; amount: number }[]; expenses: { number: string; name: string; amount: number }[]; totalRevenue: number; totalExpenses: number; netIncome: number } | null;
  const bs = balanceSheet as { assets: { number: string; name: string; amount: number }[]; liabilities: { number: string; name: string; amount: number }[]; equity: { number: string; name: string; amount: number }[]; totalAssets: number; totalLiabilities: number; totalEquity: number; isBalanced: boolean } | null;
  const cf = cashFlow as { operating: number; investing: number; financing: number; netChange: number; details: { date: string; memo: string; amount: number; category: string }[] } | null;
  const rr = rentRoll as {
    asOfDate: string;
    rows: { property: string; address: string; unit: string; tenant: string; monthlyRent: number; deposit: number; leaseStart: string; leaseEnd: string | null }[];
    totalMonthlyRent: number;
    annualizedRent: number;
  } | null;
  const gl = generalLedger as { lines: { id: string; debit: number; credit: number; description: string | null; account: { accountNumber: string; name: string }; journalEntry: { date: string; memo: string | null; reference: string | null; property: { name: string } | null } }[] } | null;
  const effectiveRange = resolveDateRange(datePreset, startDate, endDate);
  const balanceSheetAsOf = effectiveRange.end || toDateInputValue(new Date());
  const showRangeFilters = activeTab !== "rent-roll";
  const dateSuffix = toDateInputValue(new Date());

  // Normalize each report into one table model that powers both PDF and Excel exports.
  const getActiveExportPayload = (): ExportPayload | null => {
    switch (activeTab) {
      case "trial-balance":
        if (!tb) return null;
        return {
          title: "Trial Balance",
          subtitle: effectiveRange.label,
          sheetName: "Trial Balance",
          headers: ["Account #", "Account Name", "Type", "Debit", "Credit"],
          rows: tb.rows.map((r) => [r.accountNumber, r.accountName, r.type, r.debit, r.credit]),
          footerRows: [["Totals", "", "", tb.totalDebits, tb.totalCredits]],
        };
      case "profit-loss":
        if (!pl) return null;
        return {
          title: "Profit & Loss Statement",
          subtitle: effectiveRange.label,
          sheetName: "Profit & Loss",
          headers: ["Account #", "Account Name", "Category", "Amount"],
          rows: [
            ...pl.revenue.map((r) => [r.number, r.name, "Revenue", r.amount]),
            ...pl.expenses.map((r) => [r.number, r.name, "Expense", r.amount]),
          ],
          footerRows: [
            ["", "", "Total Revenue", pl.totalRevenue],
            ["", "", "Total Expenses", pl.totalExpenses],
            ["", "", "Net Income", pl.netIncome],
          ],
        };
      case "balance-sheet":
        if (!bs) return null;
        return {
          title: "Balance Sheet",
          subtitle: `As of ${balanceSheetAsOf}`,
          sheetName: "Balance Sheet",
          headers: ["Account #", "Account Name", "Section", "Amount"],
          rows: [
            ...bs.assets.map((r) => [r.number, r.name, "Asset", r.amount]),
            ...bs.liabilities.map((r) => [r.number, r.name, "Liability", r.amount]),
            ...bs.equity.map((r) => [r.number, r.name, "Equity", r.amount]),
          ],
          footerRows: [
            ["", "", "Total Assets", bs.totalAssets],
            ["", "", "Total Liabilities", bs.totalLiabilities],
            ["", "", "Total Equity", bs.totalEquity],
            ["", "", "Liabilities + Equity", bs.totalLiabilities + bs.totalEquity],
          ],
        };
      case "cash-flow":
        if (!cf) return null;
        return {
          title: "Cash Flow Statement",
          subtitle: effectiveRange.label,
          sheetName: "Cash Flow",
          headers: ["Date", "Description", "Category", "Amount"],
          rows: cf.details.map((d) => [formatDate(d.date), d.memo, d.category, d.amount]),
          footerRows: [
            ["", "Operating", "", cf.operating],
            ["", "Investing", "", cf.investing],
            ["", "Financing", "", cf.financing],
            ["", "Net Change", "", cf.netChange],
          ],
        };
      case "general-ledger":
        if (!gl || gl.lines.length === 0) return null;
        return {
          title: "General Ledger",
          subtitle: effectiveRange.label,
          sheetName: "General Ledger",
          headers: ["Date", "Account", "Memo", "Reference", "Property", "Description", "Debit", "Credit"],
          rows: gl.lines.map((l) => [
            formatDate(l.journalEntry.date),
            `${l.account.accountNumber} - ${l.account.name}`,
            l.journalEntry.memo || "",
            l.journalEntry.reference || "",
            l.journalEntry.property?.name || "",
            l.description || "",
            l.debit,
            l.credit,
          ]),
        };
      case "rent-roll":
        if (!rr) return null;
        return {
          title: "Rent Roll",
          subtitle: `As of ${formatDate(rr.asOfDate)}`,
          sheetName: "Rent Roll",
          headers: ["Property", "Address", "Unit", "Tenant", "Monthly Rent", "Deposit", "Lease Start", "Lease End"],
          rows: rr.rows.map((r) => [
            r.property,
            r.address,
            r.unit,
            r.tenant,
            r.monthlyRent,
            r.deposit,
            formatDate(r.leaseStart),
            r.leaseEnd ? formatDate(r.leaseEnd) : "Month-to-month",
          ]),
          footerRows: [["Totals", "", "", "", rr.totalMonthlyRent, "", "", `Annual: ${rr.annualizedRent}`]],
        };
      default:
        return null;
    }
  };

  const getExportFileBaseName = () => `report-${activeTab}-${dateSuffix}`;

  const exportToExcel = async () => {
    const payload = getActiveExportPayload();
    if (!payload) return;
    setExporting("excel");
    try {
      const XLSX = await import("xlsx");
      const rows = [payload.headers, ...payload.rows, ...(payload.footerRows || [])];
      const worksheet = XLSX.utils.aoa_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, payload.sheetName);
      XLSX.writeFile(workbook, `${getExportFileBaseName()}.xlsx`);
    } finally {
      setExporting(null);
    }
  };

  const exportToPdf = async () => {
    const payload = getActiveExportPayload();
    if (!payload) return;
    setExporting("pdf");
    try {
      const [{ default: JsPDF }, { default: autoTable }] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);
      const doc = new JsPDF({
        orientation: payload.headers.length >= 7 ? "landscape" : "portrait",
      });
      doc.setFontSize(14);
      doc.text(payload.title, 14, 16);
      let startY = 24;
      if (payload.subtitle) {
        doc.setFontSize(10);
        doc.text(payload.subtitle, 14, 22);
        startY = 28;
      }
      autoTable(doc, {
        startY,
        head: [payload.headers],
        body: payload.rows,
        foot: payload.footerRows,
        theme: "striped",
        styles: { fontSize: 8 },
      });
      doc.save(`${getExportFileBaseName()}.pdf`);
    } finally {
      setExporting(null);
    }
  };

  const exportPayload = getActiveExportPayload();
  const exportDisabled = loading || exporting !== null || !exportPayload;

  return (
    <div className="space-y-4">
      <Tabs
        defaultValue="trial-balance"
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-3"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <TabsList className="flex-wrap">
            <TabsTrigger value="trial-balance" onClick={() => fetchReport("trial-balance")}>Trial Balance</TabsTrigger>
            <TabsTrigger value="profit-loss" onClick={() => fetchReport("profit-loss")}>Profit & Loss</TabsTrigger>
            <TabsTrigger value="balance-sheet" onClick={() => fetchReport("balance-sheet")}>Balance Sheet</TabsTrigger>
            <TabsTrigger value="cash-flow" onClick={() => fetchReport("cash-flow")}>Cash Flow</TabsTrigger>
            <TabsTrigger value="general-ledger" onClick={() => fetchReport("general-ledger")}>General Ledger</TabsTrigger>
            <TabsTrigger value="rent-roll" onClick={() => fetchReport("rent-roll")}>Rent Roll</TabsTrigger>
          </TabsList>

          <div className="flex flex-wrap items-end gap-2">
            {showRangeFilters && (
              <>
            <div className="space-y-1">
              <Label className="text-[11px]">Period</Label>
              <Select
                value={datePreset}
                onChange={(e) => setDatePreset(e.target.value as DatePreset)}
                className="w-44"
              >
                <option value="mtd">MTD</option>
                <option value="qtd">QTD</option>
                <option value="ytd">YTD</option>
                <option value="last_30">Last 30 Days</option>
                <option value="last_90">Last 90 Days</option>
                <option value="all_time">All Time</option>
                <option value="custom">Custom</option>
              </Select>
            </div>
            {datePreset === "custom" && (
              <>
            <div className="space-y-1">
              <Label className="text-[11px]">Start</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-36" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">End</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-36" />
            </div>
              </>
            )}
              </>
            )}
            <div className="space-y-1">
              <Label className="text-[11px]">Portfolio</Label>
              <Select value={portfolioId} onChange={(e) => { setPortfolioId(e.target.value); setPropertyId(""); }} className="w-44">
                <option value="">All Portfolios</option>
                {portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Property</Label>
              <Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className="w-44">
                <option value="">All Properties</option>
                {propertyOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={exportToPdf}
              disabled={exportDisabled}
            >
              <FileText className="mr-1 h-4 w-4" />
              Export PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportToExcel}
              disabled={exportDisabled}
            >
              <FileSpreadsheet className="mr-1 h-4 w-4" />
              Export Excel
            </Button>
          </div>
        </div>

        {/* ── Trial Balance ────────────────────────────────────────────── */}
        <TabsContent value="trial-balance">
          {!tb ? <EmptyReport onLoad={() => fetchReport("trial-balance")} /> : (
            <Card>
              <CardHeader>
                <CardTitle>Trial Balance</CardTitle>
                <CardDescription>
                  {tb.isBalanced ? <Badge variant="success">Balanced</Badge> : <Badge variant="destructive">Unbalanced</Badge>}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account #</TableHead><TableHead>Account Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tb.rows.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell>{r.accountNumber}</TableCell><TableCell>{r.accountName}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{r.type}</Badge></TableCell>
                        <TableCell className="text-right">{r.debit > 0 ? formatCurrency(r.debit) : ""}</TableCell>
                        <TableCell className="text-right">{r.credit > 0 ? formatCurrency(r.credit) : ""}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow className="font-bold">
                      <TableCell colSpan={3}>Totals</TableCell>
                      <TableCell className="text-right">{formatCurrency(tb.totalDebits)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(tb.totalCredits)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Profit & Loss ────────────────────────────────────────────── */}
        <TabsContent value="profit-loss">
          {!pl ? <EmptyReport onLoad={() => fetchReport("profit-loss")} /> : (
            <Card>
              <CardHeader>
                <CardTitle>Profit & Loss Statement</CardTitle>
                <CardDescription>{effectiveRange.label}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h3 className="mb-2 font-semibold text-success">Revenue</h3>
                  <Table>
                    <TableBody>
                      {pl.revenue.map((r, i) => (
                        <TableRow key={i}><TableCell>{r.number} — {r.name}</TableCell><TableCell className="text-right">{formatCurrency(r.amount)}</TableCell></TableRow>
                      ))}
                    </TableBody>
                    <TableFooter><TableRow className="font-bold"><TableCell>Total Revenue</TableCell><TableCell className="text-right">{formatCurrency(pl.totalRevenue)}</TableCell></TableRow></TableFooter>
                  </Table>
                </div>
                <Separator />
                <div>
                  <h3 className="mb-2 font-semibold text-destructive">Expenses</h3>
                  <Table>
                    <TableBody>
                      {pl.expenses.map((r, i) => (
                        <TableRow key={i}><TableCell>{r.number} — {r.name}</TableCell><TableCell className="text-right">{formatCurrency(r.amount)}</TableCell></TableRow>
                      ))}
                    </TableBody>
                    <TableFooter><TableRow className="font-bold"><TableCell>Total Expenses</TableCell><TableCell className="text-right">{formatCurrency(pl.totalExpenses)}</TableCell></TableRow></TableFooter>
                  </Table>
                </div>
                <Separator />
                <div className="flex items-center justify-between rounded-lg bg-muted p-4">
                  <span className="text-lg font-bold">Net Income</span>
                  <span className={`text-xl font-bold ${pl.netIncome >= 0 ? "text-success" : "text-destructive"}`}>
                    {formatCurrency(pl.netIncome)}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Balance Sheet ─────────────────────────────────────────────── */}
        <TabsContent value="balance-sheet">
          {!bs ? <EmptyReport onLoad={() => fetchReport("balance-sheet")} /> : (
            <Card>
              <CardHeader>
                <CardTitle>Balance Sheet</CardTitle>
                <CardDescription>
                  As of {balanceSheetAsOf} {bs.isBalanced ? <Badge variant="success" className="ml-2">Balanced</Badge> : <Badge variant="destructive" className="ml-2">Unbalanced</Badge>}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <ReportSection title="Assets" items={bs.assets} total={bs.totalAssets} color="text-blue-600" />
                <Separator />
                <ReportSection title="Liabilities" items={bs.liabilities} total={bs.totalLiabilities} color="text-orange-600" />
                <Separator />
                <ReportSection title="Equity" items={bs.equity} total={bs.totalEquity} color="text-purple-600" />
                <Separator />
                <div className="flex items-center justify-between rounded-lg bg-muted p-4">
                  <span className="font-bold">Liabilities + Equity</span>
                  <span className="font-bold">{formatCurrency(bs.totalLiabilities + bs.totalEquity)}</span>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Cash Flow ────────────────────────────────────────────────── */}
        <TabsContent value="cash-flow">
          {!cf ? <EmptyReport onLoad={() => fetchReport("cash-flow")} /> : (
            <Card>
              <CardHeader>
                <CardTitle>Cash Flow Statement</CardTitle>
                <CardDescription>{effectiveRange.label}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-4 gap-4">
                  <StatBox label="Operating" value={cf.operating} />
                  <StatBox label="Investing" value={cf.investing} />
                  <StatBox label="Financing" value={cf.financing} />
                  <StatBox label="Net Change" value={cf.netChange} highlight />
                </div>
                {cf.details.length > 0 && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead><TableHead>Description</TableHead>
                        <TableHead>Category</TableHead><TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cf.details.map((d, i) => (
                        <TableRow key={i}>
                          <TableCell>{formatDate(d.date)}</TableCell><TableCell>{d.memo}</TableCell>
                          <TableCell><Badge variant="outline">{d.category}</Badge></TableCell>
                          <TableCell className={`text-right ${d.amount >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(d.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── General Ledger ───────────────────────────────────────────── */}
        <TabsContent value="general-ledger">
          <Card>
            <CardHeader>
              <CardTitle>General Ledger</CardTitle>
              <CardDescription>All journal lines for one account or all accounts.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-3">
                <Select value={glAccountId} onChange={(e) => setGlAccountId(e.target.value)} className="max-w-sm">
                  <option value="">All Accounts</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.accountNumber} — {a.name}</option>)}
                </Select>
                <Button onClick={() => fetchReport("general-ledger")}>Run Report</Button>
              </div>
              {gl && gl.lines.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead><TableHead>Account</TableHead><TableHead>Memo</TableHead><TableHead>Ref</TableHead>
                      <TableHead>Property</TableHead><TableHead>Description</TableHead>
                      <TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {gl.lines.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell>{formatDate(l.journalEntry.date)}</TableCell>
                        <TableCell>{l.account.accountNumber} — {l.account.name}</TableCell>
                        <TableCell>{l.journalEntry.memo || "—"}</TableCell>
                        <TableCell>{l.journalEntry.reference || "—"}</TableCell>
                        <TableCell>{l.journalEntry.property?.name || "—"}</TableCell>
                        <TableCell>{l.description || "—"}</TableCell>
                        <TableCell className="text-right">{l.debit > 0 ? formatCurrency(l.debit) : ""}</TableCell>
                        <TableCell className="text-right">{l.credit > 0 ? formatCurrency(l.credit) : ""}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {gl && gl.lines.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No ledger lines found for the selected filters.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Rent Roll ────────────────────────────────────────────────── */}
        <TabsContent value="rent-roll">
          <Card>
            <CardContent className="flex flex-wrap items-end gap-4 p-4">
              <div className="space-y-1">
                <Label className="text-xs">As Of Date</Label>
                <Input
                  type="date"
                  value={rentRollAsOfDate}
                  onChange={(e) => setRentRollAsOfDate(e.target.value)}
                  className="w-40"
                />
              </div>
              <Button onClick={() => fetchReport("rent-roll")}>
                Run Rent Roll
              </Button>
            </CardContent>
          </Card>

          {!rr ? <EmptyReport onLoad={() => fetchReport("rent-roll")} /> : (
            <Card>
              <CardHeader>
                <CardTitle>Rent Roll</CardTitle>
                <CardDescription>
                  Snapshot as of {formatDate(rr.asOfDate)}.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Property</TableHead><TableHead>Address</TableHead><TableHead>Unit</TableHead>
                      <TableHead>Tenant</TableHead><TableHead className="text-right">Monthly Rent</TableHead>
                      <TableHead className="text-right">Deposit</TableHead>
                      <TableHead>Lease Start</TableHead><TableHead>Lease End</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rr.rows.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{r.property}</TableCell>
                        <TableCell>{r.address}</TableCell><TableCell>{r.unit}</TableCell>
                        <TableCell>{r.tenant}</TableCell>
                        <TableCell className="text-right">{formatCurrency(r.monthlyRent)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(r.deposit)}</TableCell>
                        <TableCell>{formatDate(r.leaseStart)}</TableCell>
                        <TableCell>{r.leaseEnd ? formatDate(r.leaseEnd) : "Month-to-month"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow className="font-bold">
                      <TableCell colSpan={4}>Totals</TableCell>
                      <TableCell className="text-right">{formatCurrency(rr.totalMonthlyRent)}</TableCell>
                      <TableCell colSpan={3} className="text-right">Annual: {formatCurrency(rr.annualizedRent)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Empty state for reports
function EmptyReport({ onLoad }: { onLoad: () => void }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12">
        <BarChart3 className="mb-3 h-10 w-10 text-muted-foreground" />
        <p className="mb-3 text-sm text-muted-foreground">Click to generate this report.</p>
        <Button onClick={onLoad}>Generate Report</Button>
      </CardContent>
    </Card>
  );
}

// Reusable balance sheet section
function ReportSection({ title, items, total, color }: {
  title: string; items: { number: string; name: string; amount: number }[];
  total: number; color: string;
}) {
  return (
    <div>
      <h3 className={`mb-2 font-semibold ${color}`}>{title}</h3>
      <Table>
        <TableBody>
          {items.map((item, i) => (
            <TableRow key={i}>
              <TableCell>{item.number} — {item.name}</TableCell>
              <TableCell className="text-right">{formatCurrency(item.amount)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow className="font-bold">
            <TableCell>Total {title}</TableCell>
            <TableCell className="text-right">{formatCurrency(total)}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

// Stat box for cash flow
function StatBox({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? "bg-muted" : ""}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold ${value >= 0 ? "text-success" : "text-destructive"}`}>
        {formatCurrency(value)}
      </p>
    </div>
  );
}
