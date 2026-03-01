"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Search, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

/* ============================================================================
   Header Component — DoorLoop-style top bar
   Clean search, notifications panel, minimal clutter
   ============================================================================ */

interface HeaderProps {
  onMenuToggle: () => void;
}

export function Header({ onMenuToggle }: HeaderProps) {
  const router = useRouter();
  const isDev = process.env.NODE_ENV !== "production";
  const [devRole, setDevRole] = useState<"property_manager" | "tenant">("property_manager");

  useEffect(() => {
    if (!isDev) return;

    const match = document.cookie.match(/(?:^|;\s*)dev_role=([^;]+)/);
    const cookieValue = match?.[1];
    setDevRole(cookieValue === "tenant" ? "tenant" : "property_manager");
  }, [isDev]);

  const handleRoleChange = (value: string) => {
    const role = value === "tenant" ? "tenant" : "property_manager";
    setDevRole(role);

    // Persist role selection for development testing across reloads/tabs.
    document.cookie = `dev_role=${role}; path=/; max-age=2592000; samesite=lax`;

    // Force server/client data to re-evaluate under the selected role.
    router.refresh();
    window.location.reload();
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border bg-card px-6 shadow-sm">
      {/* Mobile menu toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onMenuToggle}
        aria-label="Toggle menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Search bar — DoorLoop-style unified search */}
      <div className="flex-1">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search properties, tenants, work orders..."
            className="h-9 rounded-lg border-border bg-muted/50 pl-9 text-sm"
          />
        </div>
      </div>

      {/* Right side — notification panel + user */}
      <div className="flex items-center gap-1">
        {isDev && (
          <div className="mr-2 hidden items-center gap-2 sm:flex">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Role
            </span>
            <Select
              value={devRole}
              onChange={(e) => handleRoleChange(e.target.value)}
              className="h-8 w-[170px] bg-background text-xs"
              aria-label="Development role toggle"
            >
              <option value="property_manager">Property Manager</option>
              <option value="tenant">Tenant</option>
            </Select>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
        </Button>

        {/* User avatar */}
        <div className="ml-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          {devRole === "tenant" ? "TN" : "PM"}
        </div>
      </div>
    </header>
  );
}
