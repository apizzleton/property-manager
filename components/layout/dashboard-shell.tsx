"use client";

import React, { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { cn } from "@/lib/utils";
import type { DevRole } from "@/lib/devActor";

interface DashboardShellProps {
  role: DevRole;
  children: React.ReactNode;
}

export function DashboardShell({ role, children }: DashboardShellProps) {
  // Sidebar collapse state
  const [collapsed, setCollapsed] = useState(false);
  // Mobile sidebar open state
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — always visible on desktop, overlay on mobile */}
      <div
        className={cn(
          "lg:block",
          mobileOpen ? "block" : "hidden"
        )}
      >
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed(!collapsed)}
          role={role}
        />
      </div>

      {/* Main content area — offset by sidebar width */}
      <div
        className={cn(
          "min-h-screen transition-all duration-300",
          collapsed ? "lg:ml-16" : "lg:ml-64"
        )}
      >
        <Header onMenuToggle={() => setMobileOpen(!mobileOpen)} />
        <main className="p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
