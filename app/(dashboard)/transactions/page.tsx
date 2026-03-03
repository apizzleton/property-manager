"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { TenantTransactions } from "@/components/tenant/tenant-transactions";

export default function TransactionsPage() {
  const searchParams = useSearchParams();
  // Support dashboard quick action deep-link to open payment modal immediately.
  const openPayOnLoad = useMemo(() => searchParams.get("action") === "pay", [searchParams]);
  const checkoutSessionId = useMemo(() => searchParams.get("session_id") || "", [searchParams]);
  const paymentResult = useMemo(() => searchParams.get("payment") || "", [searchParams]);

  return (
    <TenantTransactions
      openPayOnLoad={openPayOnLoad}
      checkoutSessionId={checkoutSessionId}
      paymentResult={paymentResult}
    />
  );
}
