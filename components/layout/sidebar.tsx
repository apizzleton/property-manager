"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  Home,
  Users,
  FileSignature,
  Calculator,
  BarChart3,
  Wrench,
  ClipboardList,
  MessageSquare,
  FileText,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ============================================================================
   Sidebar Component — DoorLoop-inspired clean navigation
   Simple menu bar, easy navigation, minimal clutter
   ============================================================================ */

type NavRole = "all" | "property_manager" | "tenant";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  role: NavRole;
}

// Navigation items with icons and paths
const navItems = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard, role: "all" },
  { label: "Messages", href: "/messages", icon: MessageSquare, role: "all" },
  { label: "Properties", href: "/properties", icon: Building2, role: "property_manager" },
  { label: "Units", href: "/units", icon: Home, role: "property_manager" },
  { label: "Tenants", href: "/tenants", icon: Users, role: "property_manager" },
  { label: "Leases", href: "/leases", icon: FileSignature, role: "property_manager" },
  { label: "Accounting", href: "/accounting", icon: Calculator, role: "property_manager" },
  { label: "Reports", href: "/reports", icon: BarChart3, role: "property_manager" },
  { label: "Maintenance", href: "/maintenance", icon: Wrench, role: "property_manager" },
  { label: "Maintenance Suite", href: "/maintenance-suite", icon: Wrench, role: "tenant" },
  { label: "Asset Management", href: "/assets", icon: ClipboardList, role: "property_manager" },
  { label: "Documents", href: "/documents", icon: FileText, role: "property_manager" },
  { label: "Settings", href: "/settings", icon: Settings, role: "all" },
] satisfies NavItem[];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  role: "property_manager" | "tenant";
}

export function Sidebar({ collapsed, onToggle, role }: SidebarProps) {
  const pathname = usePathname();

  const visibleNavItems = navItems.filter((item) => (
    item.role === "all" || item.role === role
  ));

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 flex h-full flex-col transition-all duration-300",
        "border-r border-[var(--sidebar-border)] bg-gradient-to-b from-slate-50 via-slate-100 to-primary/30 shadow-xl backdrop-blur dark:from-slate-900 dark:via-slate-800 dark:to-primary/25",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo / App Name — DoorLoop-style clean header */}
      <div className="flex h-14 items-center border-b border-[var(--sidebar-border)]/80 px-4">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 shadow-md shadow-primary/25">
            <Building2 className="h-5 w-5 text-primary-foreground" />
          </div>
          {!collapsed && (
            <span className="text-base font-semibold tracking-tight text-foreground">
              PropManager
            </span>
          )}
        </Link>
      </div>

      {/* Navigation Links — clean, minimal */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {visibleNavItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                isActive
                  ? "border border-primary/20 bg-gradient-to-r from-primary/20 to-primary/5 text-primary shadow-sm font-semibold"
                  : "text-muted-foreground hover:bg-white/60 hover:text-foreground hover:shadow-sm"
              )}
              title={collapsed ? item.label : undefined}
            >
              {/* Active Indicator Strip */}
              {isActive && (
                <div className="absolute left-0 top-1 bottom-1 w-1 rounded-r-full bg-primary" />
              )}

              <item.icon
                className={cn(
                  "h-5 w-5 shrink-0 transition-all",
                  isActive ? "text-primary" : "text-muted-foreground group-hover:scale-105 group-hover:text-foreground"
                )}
              />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Collapse Toggle */}
      <div className="border-t border-[var(--sidebar-border)]/80 p-2">
        <button
          onClick={onToggle}
          className="flex w-full items-center justify-center rounded-xl p-2 text-muted-foreground transition-colors hover:bg-white/60 hover:text-foreground"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>
    </aside>
  );
}
