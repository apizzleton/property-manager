"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, CreditCard, DollarSign, ReceiptText, ScrollText, Wrench } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandLogo } from "@/components/branding/brand-logo";
import { formatCurrency, formatDate } from "@/lib/utils";

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
  };
}


export function TenantDashboard() {
  const connectBypassActive = process.env.NEXT_PUBLIC_STRIPE_ALLOW_PLATFORM_FALLBACK === "true";
  const [loading, setLoading] = useState(true);
  const [ledger, setLedger] = useState<TenantLedgerResponse | null>(null);
  const [ledgerError, setLedgerError] = useState("");

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

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-16">
        <BrandLogo variant="icon" size="sm" />
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
      </div>

      {connectBypassActive ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Dev mode: Stripe Connect is temporarily bypassed. Checkout runs on the platform test
          account until property onboarding is completed.
        </p>
      ) : null}

      {/*
        Positive balance means tenant owes money (red treatment).
        Zero/negative means paid up or credit balance (green treatment).
      */}
      {(() => {
        const isPositiveBalance = ledger.summary.currentBalance > 0;
        const balanceBorderClass = isPositiveBalance ? "border-l-rose-500" : "border-l-emerald-500";
        const balanceHeaderClass = isPositiveBalance
          ? "bg-rose-50/50 dark:bg-rose-950/20"
          : "bg-emerald-50/50 dark:bg-emerald-950/20";
        const balanceTitleClass = isPositiveBalance
          ? "text-rose-700 dark:text-rose-400"
          : "text-emerald-700 dark:text-emerald-400";
        const balanceIconWrapClass = isPositiveBalance
          ? "bg-rose-100 dark:bg-rose-900/50"
          : "bg-emerald-100 dark:bg-emerald-900/50";
        const balanceIconClass = isPositiveBalance
          ? "text-rose-600 dark:text-rose-400"
          : "text-emerald-600 dark:text-emerald-400";
        const balanceValueClass = isPositiveBalance ? "text-foreground" : "text-emerald-700 dark:text-emerald-300";

        return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className={`border-l-4 overflow-hidden hover:shadow-md transition-all ${balanceBorderClass}`}>
          <CardHeader className={`flex flex-row items-center justify-between pb-2 ${balanceHeaderClass}`}>
            <CardTitle className={`text-sm font-medium ${balanceTitleClass}`}>Current Balance</CardTitle>
            <div className={`p-2 rounded-lg ${balanceIconWrapClass}`}>
              <DollarSign className={`h-4 w-4 ${balanceIconClass}`} />
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className={`text-2xl font-bold tracking-tight ${balanceValueClass}`}>
              {formatCurrency(ledger.summary.currentBalance)}
            </div>
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
        );
      })()}

      {/* Keep widgets visible and move detailed tools into dedicated pages. */}
      <Card className="neo-surface">
        <CardHeader>
          <CardTitle className="text-base">Quick Actions</CardTitle>
          <p className="text-sm text-muted-foreground">
            Jump to the tasks tenants use most.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <QuickAction href="/transactions#autopay" icon={CreditCard} label="Set Up / View AutoPay" />
          <QuickAction href="/transactions#ledger" icon={ScrollText} label="View Ledger" />
          <QuickAction href="/transactions?action=pay" icon={DollarSign} label="Make a Payment" />
          <QuickAction href="/maintenance-suite" icon={Wrench} label="Submit Maintenance" />
        </CardContent>
      </Card>
    </div>
  );
}

function QuickAction({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-lg border border-border p-3 transition-all hover:border-primary/50 hover:bg-muted/50"
    >
      <div className="rounded-md bg-primary/15 p-2 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <span className="text-sm font-medium">{label}</span>
    </Link>
  );
}
