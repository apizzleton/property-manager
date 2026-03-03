"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Search, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { BrandLogo } from "@/components/branding/brand-logo";

/* ============================================================================
   Header Component — DoorLoop-style top bar
   Clean search, notifications panel, minimal clutter
   ============================================================================ */

interface HeaderProps {
  onMenuToggle: () => void;
}

type SearchResultType = "property" | "tenant" | "unit" | "lease" | "work_order";

interface SearchResultItem {
  id: string;
  type: SearchResultType;
  title: string;
  subtitle: string;
  href: string;
}

const resultTypeLabels: Record<SearchResultType, string> = {
  property: "Property",
  tenant: "Tenant",
  unit: "Unit",
  lease: "Lease",
  work_order: "Work Order",
};

export function Header({ onMenuToggle }: HeaderProps) {
  const router = useRouter();
  const roleSwitchEnabled =
    process.env.NEXT_PUBLIC_ENABLE_ROLE_SWITCH !== "false";
  const [devRole, setDevRole] = useState<"property_manager" | "tenant">("property_manager");
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    if (!roleSwitchEnabled) return;

    const match = document.cookie.match(/(?:^|;\s*)dev_role=([^;]+)/);
    const cookieValue = match?.[1];
    setDevRole(cookieValue === "tenant" ? "tenant" : "property_manager");
  }, [roleSwitchEnabled]);

  const handleRoleChange = (value: string) => {
    const role = value === "tenant" ? "tenant" : "property_manager";
    setDevRole(role);

    // Persist role selection for development testing across reloads/tabs.
    document.cookie = `dev_role=${role}; path=/; max-age=2592000; samesite=lax`;

    // Force server/client data to re-evaluate under the selected role.
    router.refresh();
    window.location.reload();
  };

  useEffect(() => {
    const query = searchText.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=8`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          setSearchResults([]);
          return;
        }
        const data = await res.json();
        setSearchResults(Array.isArray(data.results) ? data.results : []);
      } catch {
        if (!controller.signal.aborted) {
          setSearchResults([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setSearchLoading(false);
        }
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [searchText]);

  // Close the results popover when the user clicks anywhere outside of it.
  useEffect(() => {
    const onDocumentMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest("[data-global-search-root]")) {
        setSearchOpen(false);
      }
    };

    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => document.removeEventListener("mousedown", onDocumentMouseDown);
  }, []);

  const openIfHasQuery = () => {
    if (searchText.trim().length > 0) {
      setSearchOpen(true);
    }
  };

  const navigateToResult = (href: string) => {
    setSearchOpen(false);
    setSearchText("");
    setSearchResults([]);
    router.push(href);
  };

  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setSearchOpen(false);
      return;
    }
    if (event.key === "Enter" && searchResults.length > 0) {
      event.preventDefault();
      navigateToResult(searchResults[0].href);
    }
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

      {/* Keep branding visible even when sidebar is collapsed or hidden. */}
      <div className="flex items-center sm:hidden">
        <BrandLogo variant="icon" size="sm" />
      </div>
      <div className="hidden items-center sm:flex">
        <BrandLogo variant="full" size="sm" className="max-w-[165px]" />
      </div>

      {/* Search bar — DoorLoop-style unified search */}
      <div className="flex-1">
        <div className="relative max-w-sm" data-global-search-root>
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search properties, tenants, work orders..."
            className="h-9 rounded-lg border-border bg-muted/50 pl-9 text-sm"
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value);
              setSearchOpen(Boolean(e.target.value.trim()));
            }}
            onFocus={openIfHasQuery}
            onKeyDown={onSearchKeyDown}
          />
          {searchOpen && (
            <div className="absolute left-0 right-0 top-11 z-40 max-h-96 overflow-auto rounded-lg border border-border bg-card shadow-lg">
              {searchLoading ? (
                <div className="px-3 py-3 text-xs text-muted-foreground">Searching...</div>
              ) : searchText.trim().length < 2 ? (
                <div className="px-3 py-3 text-xs text-muted-foreground">Type at least 2 characters.</div>
              ) : searchResults.length === 0 ? (
                <div className="px-3 py-3 text-xs text-muted-foreground">No results found.</div>
              ) : (
                <div className="py-1">
                  {searchResults.map((result) => (
                    <button
                      key={`${result.type}:${result.id}`}
                      type="button"
                      className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-muted/70"
                      onClick={() => navigateToResult(result.href)}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{result.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{result.subtitle}</p>
                      </div>
                      <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {resultTypeLabels[result.type]}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right side — notification panel + user */}
      <div className="flex items-center gap-1">
        {roleSwitchEnabled && (
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
