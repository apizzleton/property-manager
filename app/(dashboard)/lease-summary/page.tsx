"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/utils";

interface LeaseSummaryResponse {
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
}

export default function LeaseSummaryPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<LeaseSummaryResponse | null>(null);

  useEffect(() => {
    fetch("/api/tenant-ledger/me")
      .then(async (res) => {
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          throw new Error(payload?.error || "Unable to load lease summary.");
        }
        return res.json();
      })
      .then((payload) => {
        setData(payload);
        setError("");
      })
      .catch((err: unknown) => {
        setData(null);
        setError(err instanceof Error ? err.message : "Unable to load lease summary.");
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-muted-foreground">Loading lease summary...</p>;

  if (error || !data?.lease) {
    return (
      <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
        {error || "No active lease found."}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Lease Summary</h1>
        <p className="text-muted-foreground">
          Review your current lease details.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current Lease</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Info label="Tenant" value={data.lease.tenantName} />
          <Info label="Property" value={data.lease.propertyName} />
          <Info label="Unit" value={data.lease.unitNumber} />
          <Info label="Monthly Rent" value={formatCurrency(data.lease.monthlyRent)} />
          <Info label="Security Deposit" value={formatCurrency(data.lease.deposit)} />
          <Info
            label="Lease Term"
            value={`${formatDate(data.lease.startDate)} - ${data.lease.endDate ? formatDate(data.lease.endDate) : "Open"}`}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}
