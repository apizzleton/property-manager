"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Building2, Home } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import { BrandLogo } from "@/components/branding/brand-logo";

interface UnitLease {
  id: string;
  status: string;
  monthlyRent: number;
  tenant: { firstName: string; lastName: string };
}

interface UnitRow {
  id: string;
  unitNumber: string;
  bedrooms: number;
  bathrooms: number;
  sqft: number | null;
  marketRent: number | null;
  propertyId: string;
  propertyName: string;
  addressLine: string;
  activeLease: UnitLease | null;
}

interface Portfolio { id: string; name: string; propertyIds: string[]; }

export default function UnitsPage() {
  const [rows, setRows] = useState<UnitRow[]>([]);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "occupied" | "vacant">("all");
  const [portfolioId, setPortfolioId] = useState("");

  const fetchUnits = useCallback(async () => {
    const url = portfolioId ? `/api/properties?portfolioId=${portfolioId}` : "/api/properties";
    const res = await fetch(url);
    const properties = await res.json();
    const nextRows: UnitRow[] = [];

    for (const property of properties) {
      for (const address of property.addresses) {
        for (const unit of address.units) {
          const activeLease = unit.leases?.find((l: UnitLease) => l.status === "active") ?? null;
          nextRows.push({
            id: unit.id,
            unitNumber: unit.unitNumber,
            bedrooms: unit.bedrooms,
            bathrooms: unit.bathrooms,
            sqft: unit.sqft,
            marketRent: unit.marketRent,
            propertyId: property.id,
            propertyName: property.name,
            addressLine: `${address.street}, ${address.city}, ${address.state} ${address.zip}`,
            activeLease,
          });
        }
      }
    }

    setRows(nextRows);
    setLoading(false);
  }, [portfolioId]);

  useEffect(() => {
    import("@/lib/fetchPortfolios").then(({ fetchPortfolios }) =>
      fetchPortfolios().then(setPortfolios)
    );
  }, []);

  useEffect(() => {
    fetchUnits();
  }, [fetchUnits]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <BrandLogo variant="icon" size="lg" className="animate-pulse" />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          Loading units...
        </div>
      </div>
    );
  }

  const filteredRows = rows.filter((unit) => {
    const occupied = Boolean(unit.activeLease);
    if (statusFilter === "occupied" && !occupied) return false;
    if (statusFilter === "vacant" && occupied) return false;
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return (
      unit.unitNumber.toLowerCase().includes(query) ||
      unit.propertyName.toLowerCase().includes(query) ||
      unit.addressLine.toLowerCase().includes(query)
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Units</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          View all units across your properties.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={portfolioId} onChange={(e) => setPortfolioId(e.target.value)} className="w-44">
          <option value="">All Portfolios</option>
          {portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search unit, property, or address..."
          className="w-72"
        />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | "occupied" | "vacant")}
          className="w-48"
        >
          <option value="all">All statuses</option>
          <option value="occupied">Occupied</option>
          <option value="vacant">Vacant</option>
        </Select>
      </div>

      {filteredRows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Home className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="mb-2 text-lg font-medium">No units yet</p>
            <p className="text-sm text-muted-foreground">
              Add units from a property detail page to see them here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unit</TableHead>
                  <TableHead>Property</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Beds/Baths</TableHead>
                  <TableHead>Sq Ft</TableHead>
                  <TableHead className="text-right">Market Rent</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((unit) => (
                  <TableRow key={unit.id}>
                    <TableCell className="font-medium">
                      <Link href={`/units/${unit.id}`} className="hover:text-primary hover:underline">
                        Unit {unit.unitNumber}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/properties/${unit.propertyId}`}
                        className="flex items-center gap-1 hover:text-primary hover:underline"
                      >
                        <Building2 className="h-3 w-3 text-muted-foreground" />
                        {unit.propertyName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{unit.addressLine}</TableCell>
                    <TableCell className="text-sm">{unit.bedrooms} / {unit.bathrooms}</TableCell>
                    <TableCell className="text-sm">{unit.sqft ?? "—"}</TableCell>
                    <TableCell className="text-right">{unit.marketRent ? formatCurrency(unit.marketRent) : "—"}</TableCell>
                    <TableCell>
                      {unit.activeLease ? (
                        <Link href={`/leases/${unit.activeLease.id}`} className="hover:underline">
                          <Badge variant="success">
                            Occupied: {unit.activeLease.tenant.firstName} {unit.activeLease.tenant.lastName}
                          </Badge>
                        </Link>
                      ) : (
                        <Badge variant="warning">Vacant</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
