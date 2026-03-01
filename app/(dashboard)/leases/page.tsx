"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  FileSignature,
  Pencil,
  Trash2,
  Users,
  Home,
  Building2,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatCurrency, formatDate } from "@/lib/utils";

/* ============================================================================
   Leases Page — manage lease agreements tied to tenants and units
   ============================================================================ */

// Lease as returned from API (includes tenant and unit relations)
interface LeaseUnit {
  id: string;
  unitNumber: string;
  address: {
    id: string;
    street: string;
    city: string;
    state: string;
    property: { id: string; name: string };
  };
}

interface LeaseTenant {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
}

interface Lease {
  id: string;
  unitId: string;
  tenantId: string;
  startDate: string;
  endDate: string | null;
  monthlyRent: number;
  deposit: number;
  status: string;
  notes: string | null;
  unit: LeaseUnit;
  tenant: LeaseTenant;
}

// For create/edit form
interface TenantOption {
  id: string;
  firstName: string;
  lastName: string;
}

interface AvailableUnit {
  id: string;
  unitNumber: string;
  marketRent: number | null;
  address: {
    street: string;
    property: { name: string };
  };
}

interface Portfolio { id: string; name: string; propertyIds: string[]; }

export default function LeasesPage() {
  const router = useRouter();
  const [leases, setLeases] = useState<Lease[]>([]);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [properties, setProperties] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [portfolioId, setPortfolioId] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [search, setSearch] = useState("");

  // Create lease dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [leaseTenantId, setLeaseTenantId] = useState("");
  const [leaseUnitId, setLeaseUnitId] = useState("");
  const [leaseStart, setLeaseStart] = useState("");
  const [leaseEnd, setLeaseEnd] = useState("");
  const [leaseRent, setLeaseRent] = useState("");
  const [leaseDeposit, setLeaseDeposit] = useState("");
  const [leaseNotes, setLeaseNotes] = useState("");
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [availableUnits, setAvailableUnits] = useState<AvailableUnit[]>([]);

  // Edit lease dialog
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingLease, setEditingLease] = useState<Lease | null>(null);
  const [editRent, setEditRent] = useState("");
  const [editDeposit, setEditDeposit] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editNotes, setEditNotes] = useState("");

  // Fetch all leases (optionally filtered by status, portfolio, property)
  const fetchLeases = useCallback(async () => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (portfolioId) params.set("portfolioId", portfolioId);
    if (propertyId) params.set("propertyId", propertyId);
    const qs = params.toString();
    const res = await fetch(`/api/leases${qs ? `?${qs}` : ""}`);
    setLeases(await res.json());
    setLoading(false);
  }, [statusFilter, portfolioId, propertyId]);

  useEffect(() => {
    fetchLeases();
  }, [fetchLeases]);

  useEffect(() => {
    Promise.all([
      import("@/lib/fetchPortfolios").then(({ fetchPortfolios }) => fetchPortfolios()),
      fetch("/api/properties").then((r) => r.json()),
    ]).then(([ports, props]) => {
      setPortfolios(ports);
      setProperties(Array.isArray(props) ? props.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })) : []);
    });
  }, []);

  const propertyOptions = portfolioId
    ? properties.filter((p) => {
        const port = portfolios.find((pf) => pf.id === portfolioId);
        return port && port.propertyIds.includes(p.id);
      })
    : properties;

  // Fetch tenants for create form
  const fetchTenants = async () => {
    const res = await fetch("/api/tenants");
    const data = await res.json();
    setTenants(
      data.map((t: { id: string; firstName: string; lastName: string }) => ({
        id: t.id,
        firstName: t.firstName,
        lastName: t.lastName,
      }))
    );
  };

  // Fetch units that don't have an active lease (available for new leases)
  const fetchAvailableUnits = async () => {
    const res = await fetch("/api/properties");
    const properties = await res.json();
    const units: AvailableUnit[] = [];

    for (const prop of properties) {
      for (const addr of prop.addresses) {
        for (const unit of addr.units) {
          const hasActiveLease = unit.leases?.some(
            (l: { status: string }) => l.status === "active"
          );
          if (!hasActiveLease) {
            units.push({
              id: unit.id,
              unitNumber: unit.unitNumber,
              marketRent: unit.marketRent,
              address: {
                street: addr.street,
                property: { name: prop.name },
              },
            });
          }
        }
      }
    }
    setAvailableUnits(units);
  };

  // ── Create Lease ────────────────────────────────────────────────────────
  const openCreateLease = async () => {
    setLeaseTenantId("");
    setLeaseUnitId("");
    setLeaseStart(new Date().toISOString().split("T")[0]);
    setLeaseEnd("");
    setLeaseRent("");
    setLeaseDeposit("");
    setLeaseNotes("");
    await fetchTenants();
    await fetchAvailableUnits();
    setShowCreateDialog(true);
  };

  const saveLease = async () => {
    const payload = {
      unitId: leaseUnitId,
      tenantId: leaseTenantId,
      startDate: leaseStart,
      endDate: leaseEnd || null,
      monthlyRent: leaseRent,
      deposit: leaseDeposit,
      notes: leaseNotes || null,
    };

    await fetch("/api/leases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setShowCreateDialog(false);
    setLoading(true);
    fetchLeases();
  };

  // ── Edit Lease ──────────────────────────────────────────────────────────
  const openEditLease = (lease: Lease) => {
    setEditingLease(lease);
    setEditRent(String(lease.monthlyRent));
    setEditDeposit(String(lease.deposit));
    setEditStart(lease.startDate.split("T")[0]);
    setEditEnd(lease.endDate ? lease.endDate.split("T")[0] : "");
    setEditStatus(lease.status);
    setEditNotes(lease.notes || "");
    setShowEditDialog(true);
  };

  const saveEditLease = async () => {
    if (!editingLease) return;

    await fetch(`/api/leases/${editingLease.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        monthlyRent: editRent,
        deposit: editDeposit,
        startDate: editStart,
        endDate: editEnd || null,
        status: editStatus,
        notes: editNotes || null,
      }),
    });
    setShowEditDialog(false);
    setEditingLease(null);
    fetchLeases();
  };

  // ── Terminate Lease ─────────────────────────────────────────────────────
  const terminateLease = async (leaseId: string) => {
    if (!confirm("Terminate this lease?")) return;
    await fetch(`/api/leases/${leaseId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "terminated" }),
    });
    fetchLeases();
  };

  // ── Delete Lease ────────────────────────────────────────────────────────
  const deleteLease = async (leaseId: string) => {
    if (!confirm("Delete this lease? This action cannot be undone.")) return;
    await fetch(`/api/leases/${leaseId}`, { method: "DELETE" });
    fetchLeases();
  };

  // Status badge helper
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge variant="success">Active</Badge>;
      case "expired":
        return <Badge variant="secondary">Expired</Badge>;
      case "terminated":
        return <Badge variant="destructive">Terminated</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const filteredLeases = leases.filter((lease) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return (
      `${lease.tenant.firstName} ${lease.tenant.lastName}`.toLowerCase().includes(query) ||
      (lease.tenant.email || "").toLowerCase().includes(query) ||
      lease.unit.address.property.name.toLowerCase().includes(query) ||
      lease.unit.address.street.toLowerCase().includes(query) ||
      lease.unit.unitNumber.toLowerCase().includes(query)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Loading leases...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header — DoorLoop-style */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leases</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage lease agreements between tenants and units.
          </p>
        </div>
        <Button onClick={openCreateLease}>
          <Plus className="mr-2 h-4 w-4" /> Add Lease
        </Button>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap items-center gap-2">
        <Label className="text-sm text-muted-foreground">Filter:</Label>
        <Select value={portfolioId} onChange={(e) => { setPortfolioId(e.target.value); setPropertyId(""); setLoading(true); }} className="w-44">
          <option value="">All Portfolios</option>
          {portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <Select value={propertyId} onChange={(e) => { setPropertyId(e.target.value); setLoading(true); }} className="w-44">
          <option value="">All Properties</option>
          {propertyOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <Select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setLoading(true);
          }}
        >
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="expired">Expired</option>
          <option value="terminated">Terminated</option>
        </Select>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tenant, property, unit..."
          className="w-72"
        />
      </div>

      {/* Leases table */}
      {filteredLeases.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileSignature className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="mb-2 text-lg font-medium">No leases yet</p>
            <p className="mb-4 text-sm text-muted-foreground">
              Create a lease to assign a tenant to a unit.
            </p>
            <Button onClick={openCreateLease}>
              <Plus className="mr-2 h-4 w-4" /> Add Lease
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Rent</TableHead>
                  <TableHead>Deposit</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLeases.map((lease) => (
                  <TableRow
                    key={lease.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => router.push(`/leases/${lease.id}`)}
                  >
                    <TableCell>
                      <Link
                        href={`/leases/${lease.id}`}
                        className="flex items-center gap-1 font-medium text-foreground hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Users className="h-3 w-3 text-muted-foreground shrink-0" />
                        {lease.tenant.firstName} {lease.tenant.lastName}
                        <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                      </Link>
                      {lease.tenant.email && (
                        <div className="text-xs text-muted-foreground">
                          {lease.tenant.email}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <Link
                          href={`/properties/${lease.unit.address.property.id}`}
                          className="flex items-center gap-1 hover:text-primary hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Building2 className="h-3 w-3 text-muted-foreground" />
                          {lease.unit.address.property.name}
                        </Link>
                        <Link
                          href={`/properties/${lease.unit.address.property.id}`}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Home className="h-3 w-3" />
                          {lease.unit.address.street} — Unit{" "}
                          {lease.unit.unitNumber}
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>{formatDate(lease.startDate)}</div>
                        {lease.endDate ? (
                          <div className="text-xs text-muted-foreground">
                            to {formatDate(lease.endDate)}
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground">
                            No end date
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{formatCurrency(lease.monthlyRent)}/mo</TableCell>
                    <TableCell>{formatCurrency(lease.deposit)}</TableCell>
                    <TableCell>{getStatusBadge(lease.status)}</TableCell>
                    <TableCell
                      className="text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditLease(lease)}
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {lease.status === "active" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => terminateLease(lease.id)}
                          >
                            End Lease
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteLease(lease.id)}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ── Create Lease Dialog ───────────────────────────────────────────── */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Lease</DialogTitle>
            <DialogDescription>
              Assign a tenant to a unit. Leases tie tenants to specific units.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tenant</Label>
              <Select
                value={leaseTenantId}
                onChange={(e) => setLeaseTenantId(e.target.value)}
              >
                <option value="">Select a tenant...</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.firstName} {t.lastName}
                  </option>
                ))}
              </Select>
              {tenants.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No tenants. Add tenants first.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Unit</Label>
              <Select
                value={leaseUnitId}
                onChange={(e) => {
                  setLeaseUnitId(e.target.value);
                  const unit = availableUnits.find((u) => u.id === e.target.value);
                  if (unit?.marketRent) setLeaseRent(String(unit.marketRent));
                }}
              >
                <option value="">Select a unit...</option>
                {availableUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.address.property.name} — {unit.address.street} — Unit{" "}
                    {unit.unitNumber}
                    {unit.marketRent ? ` (${formatCurrency(unit.marketRent)}/mo)` : ""}
                  </option>
                ))}
              </Select>
              {availableUnits.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No available units. Units with active leases are excluded.
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={leaseStart}
                  onChange={(e) => setLeaseStart(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>End Date (optional)</Label>
                <Input
                  type="date"
                  value={leaseEnd}
                  onChange={(e) => setLeaseEnd(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Monthly Rent ($)</Label>
                <Input
                  type="number"
                  value={leaseRent}
                  onChange={(e) => setLeaseRent(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Security Deposit ($)</Label>
                <Input
                  type="number"
                  value={leaseDeposit}
                  onChange={(e) => setLeaseDeposit(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={leaseNotes}
                onChange={(e) => setLeaseNotes(e.target.value)}
                placeholder="Lease terms, special conditions..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={saveLease}
              disabled={
                !leaseTenantId || !leaseUnitId || !leaseStart || !leaseRent
              }
            >
              Create Lease
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Lease Dialog ─────────────────────────────────────────────── */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Lease</DialogTitle>
            <DialogDescription>
              {editingLease && (
                <>
                  {editingLease.tenant.firstName}{" "}
                  {editingLease.tenant.lastName} — Unit{" "}
                  {editingLease.unit.unitNumber},{" "}
                  {editingLease.unit.address.property.name}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {editingLease && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Monthly Rent ($)</Label>
                  <Input
                    type="number"
                    value={editRent}
                    onChange={(e) => setEditRent(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Security Deposit ($)</Label>
                  <Input
                    type="number"
                    value={editDeposit}
                    onChange={(e) => setEditDeposit(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input
                    type="date"
                    value={editStart}
                    onChange={(e) => setEditStart(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>End Date (optional)</Label>
                  <Input
                    type="date"
                    value={editEnd}
                    onChange={(e) => setEditEnd(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                >
                  <option value="active">Active</option>
                  <option value="expired">Expired</option>
                  <option value="terminated">Terminated</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Notes (optional)</Label>
                <Textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={saveEditLease}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
