import React from "react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { getDevActor } from "@/lib/devActor";

/* ============================================================================
   Dashboard Layout — sidebar + header shell for all dashboard pages
   ============================================================================ */

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardLayoutInner>{children}</DashboardLayoutInner>;
}

async function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
  const actor = await getDevActor();
  const role = actor?.effectiveRole ?? "property_manager";

  return (
    <DashboardShell role={role}>{children}</DashboardShell>
  );
}
