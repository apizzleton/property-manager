"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Plus, MapPin, Pencil, Trash2, Building2, Wrench, ReceiptText, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { formatCurrency, formatDate } from "@/lib/utils";

/* ============================================================================
   Property Detail Page — shows addresses and units in a hierarchy
   ============================================================================ */

interface Tenant {
  id?: string;
  firstName: string;
  lastName: string;
}

interface Lease {
  id: string;
  status: string;
  monthlyRent: number;
  tenant: Tenant;
}

interface Unit {
  id: string;
  unitNumber: string;
  bedrooms: number;
  bathrooms: number;
  sqft: number | null;
  marketRent: number | null;
  leases: Lease[];
}

interface Address {
  id: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  units: Unit[];
}

interface Property {
  id: string;
  name: string;
  type: string;
  notes: string | null;
  stripeConnectAccountId: string | null;
  stripeConnectChargesEnabled: boolean;
  stripeConnectPayoutsEnabled: boolean;
  stripeConnectDetailsSubmitted: boolean;
  addresses: Address[];
}

interface WorkOrder {
  id: string;
  title: string;
  priority: string;
  status: string;
  createdAt: string;
  unit: { unitNumber: string };
  tenant: { firstName: string; lastName: string } | null;
  vendor: { name: string } | null;
}

interface JournalEntry {
  id: string;
  date: string;
  memo: string | null;
  reference: string | null;
  lines: { id: string; debit: number; credit: number }[];
}

export default function PropertyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingOverview, setSavingOverview] = useState(false);
  const [overviewMessage, setOverviewMessage] = useState("");
  const [stripeBusy, setStripeBusy] = useState(false);
  const [stripeMessage, setStripeMessage] = useState("");
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);

  // Overview edit state
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("residential");
  const [editNotes, setEditNotes] = useState("");

  // Address dialog state
  const [showAddressDialog, setShowAddressDialog] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const [addrStreet, setAddrStreet] = useState("");
  const [addrCity, setAddrCity] = useState("");
  const [addrState, setAddrState] = useState("");
  const [addrZip, setAddrZip] = useState("");

  // Unit dialog state
  const [showUnitDialog, setShowUnitDialog] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [unitAddressId, setUnitAddressId] = useState("");
  const [unitNumber, setUnitNumber] = useState("");
  const [unitBeds, setUnitBeds] = useState("0");
  const [unitBaths, setUnitBaths] = useState("1");
  const [unitSqft, setUnitSqft] = useState("");
  const [unitRent, setUnitRent] = useState("");
  const [unitsAddressFilter, setUnitsAddressFilter] = useState("all");
  const connectBypassActive = process.env.NEXT_PUBLIC_STRIPE_ALLOW_PLATFORM_FALLBACK === "true";

  // Fetch property data
  const fetchProperty = useCallback(async () => {
    const res = await fetch(`/api/properties/${id}`);
    if (res.ok) {
      const next = await res.json();
      setProperty(next);
      setEditName(next.name);
      setEditType(next.type);
      setEditNotes(next.notes || "");
    }
    setLoading(false);
  }, [id]);

  const fetchRelated = useCallback(async () => {
    const [woRes, entryRes] = await Promise.all([
      fetch("/api/work-orders"),
      fetch(`/api/journal-entries?propertyId=${id}`),
    ]);

    if (woRes.ok) {
      const allWo = await woRes.json();
      const filtered = allWo.filter((wo: { unit?: { address?: { property?: { id?: string } } } }) => (
        wo.unit?.address?.property?.id === id
      ));
      setWorkOrders(filtered);
    }

    if (entryRes.ok) {
      setEntries(await entryRes.json());
    }
  }, [id]);

  useEffect(() => {
    fetchProperty();
    fetchRelated();
  }, [fetchProperty, fetchRelated]);

  const saveOverview = async () => {
    if (!property) return;
    setSavingOverview(true);
    setOverviewMessage("");

    const res = await fetch(`/api/properties/${property.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editName,
        type: editType,
        notes: editNotes,
      }),
    });

    setSavingOverview(false);
    if (!res.ok) {
      setOverviewMessage("Failed to save property details.");
      return;
    }
    setOverviewMessage("Property details updated.");
    fetchProperty();
  };

  const createOrSyncStripeAccount = async () => {
    if (!property) return;
    setStripeBusy(true);
    setStripeMessage("");
    const res = await fetch("/api/stripe/connect/account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId: property.id }),
    });
    setStripeBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setStripeMessage(body?.error || "Failed to create/sync Stripe account.");
      return;
    }
    setStripeMessage("Stripe account connected/synced.");
    fetchProperty();
  };

  const openStripeOnboarding = async () => {
    if (!property) return;
    setStripeBusy(true);
    setStripeMessage("");
    const res = await fetch("/api/stripe/connect/account-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ propertyId: property.id }),
    });
    setStripeBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setStripeMessage(body?.error || "Failed to open Stripe onboarding.");
      return;
    }
    const body = await res.json();
    if (!body?.url) {
      setStripeMessage("Stripe onboarding URL was not returned.");
      return;
    }
    window.location.href = body.url;
  };

  const refreshStripeStatus = async () => {
    if (!property) return;
    setStripeBusy(true);
    setStripeMessage("");
    const res = await fetch(`/api/stripe/connect/account?propertyId=${property.id}`);
    setStripeBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setStripeMessage(body?.error || "Failed to refresh Stripe status.");
      return;
    }
    setStripeMessage("Stripe status refreshed.");
    fetchProperty();
  };

  // ── Address CRUD ──────────────────────────────────────────────────────
  const openAddAddress = () => {
    setEditingAddress(null);
    setAddrStreet("");
    setAddrCity("");
    setAddrState("");
    setAddrZip("");
    setShowAddressDialog(true);
  };

  const openEditAddress = (address: Address) => {
    setEditingAddress(address);
    setAddrStreet(address.street);
    setAddrCity(address.city);
    setAddrState(address.state);
    setAddrZip(address.zip);
    setShowAddressDialog(true);
  };

  const saveAddress = async () => {
    const payload = { propertyId: id, street: addrStreet, city: addrCity, state: addrState, zip: addrZip };

    if (editingAddress) {
      await fetch(`/api/addresses/${editingAddress.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch("/api/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
    setShowAddressDialog(false);
    fetchProperty();
  };

  const deleteAddress = async (addressId: string) => {
    if (!confirm("Delete this address and all its units?")) return;
    await fetch(`/api/addresses/${addressId}`, { method: "DELETE" });
    fetchProperty();
  };

  // ── Unit CRUD ─────────────────────────────────────────────────────────
  const openAddUnit = (addressId: string) => {
    setEditingUnit(null);
    setUnitAddressId(addressId);
    setUnitNumber("");
    setUnitBeds("0");
    setUnitBaths("1");
    setUnitSqft("");
    setUnitRent("");
    setShowUnitDialog(true);
  };

  const openEditUnit = (unit: Unit, addressId: string) => {
    setEditingUnit(unit);
    setUnitAddressId(addressId);
    setUnitNumber(unit.unitNumber);
    setUnitBeds(String(unit.bedrooms));
    setUnitBaths(String(unit.bathrooms));
    setUnitSqft(unit.sqft ? String(unit.sqft) : "");
    setUnitRent(unit.marketRent ? String(unit.marketRent) : "");
    setShowUnitDialog(true);
  };

  const saveUnit = async () => {
    const payload = {
      addressId: unitAddressId,
      unitNumber,
      bedrooms: unitBeds,
      bathrooms: unitBaths,
      sqft: unitSqft || null,
      marketRent: unitRent || null,
    };

    if (editingUnit) {
      await fetch(`/api/units/${editingUnit.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch("/api/units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
    setShowUnitDialog(false);
    fetchProperty();
  };

  const deleteUnit = async (unitId: string) => {
    if (!confirm("Delete this unit?")) return;
    await fetch(`/api/units/${unitId}`, { method: "DELETE" });
    fetchProperty();
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><p className="text-muted-foreground">Loading...</p></div>;
  }

  if (!property) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-muted-foreground">Property not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/properties")}>
          Back to Properties
        </Button>
      </div>
    );
  }

  const allUnits = property.addresses.flatMap((address) => (
    address.units.map((unit) => ({ ...unit, address }))
  ));
  const allLeases = allUnits.flatMap((unit) => unit.leases);
  const activeLeases = allLeases.filter((l) => l.status === "active");
  const occupiedUnits = allUnits.filter((u) => u.leases.some((l) => l.status === "active")).length;
  const vacantUnits = allUnits.length - occupiedUnits;
  const monthlyPotential = allUnits.reduce((sum, u) => sum + (u.marketRent || 0), 0);
  const selectedAddress = unitsAddressFilter === "all"
    ? null
    : property.addresses.find((address) => address.id === unitsAddressFilter) ?? null;
  const visibleUnitRows = (selectedAddress ? [selectedAddress] : property.addresses).flatMap((address) => (
    address.units.map((unit) => {
      const activeLease = unit.leases.find((lease) => lease.status === "active") ?? null;
      return { address, unit, activeLease };
    })
  ));

  const tenantRows = activeLeases.map((lease) => ({
    leaseId: lease.id,
    tenantName: `${lease.tenant.firstName} ${lease.tenant.lastName}`,
    monthlyRent: lease.monthlyRent,
    status: lease.status,
  }));

  return (
    <div className="space-y-6">
      {/* Page header with back button */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push("/properties")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">{property.name}</h1>
            <Badge variant="secondary" className="capitalize">{property.type}</Badge>
          </div>
          {property.notes && <p className="text-sm text-muted-foreground">{property.notes}</p>}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="units">Units</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="tenants">Tenants</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Addresses</p><p className="text-2xl font-bold">{property.addresses.length}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Units</p><p className="text-2xl font-bold">{allUnits.length}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Occupancy</p><p className="text-2xl font-bold">{occupiedUnits}/{allUnits.length}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Market Rent Potential</p><p className="text-2xl font-bold">{formatCurrency(monthlyPotential)}</p></CardContent></Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Edit Property Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Property Name</Label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Property Type</Label>
                <Select value={editType} onChange={(e) => setEditType(e.target.value)}>
                  <option value="residential">Residential</option>
                  <option value="commercial">Commercial</option>
                  <option value="mixed">Mixed Use</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
              </div>
              <div className="flex items-center gap-3">
                <Button onClick={saveOverview} disabled={!editName.trim() || savingOverview}>
                  {savingOverview ? "Saving..." : "Save Details"}
                </Button>
                {overviewMessage ? <p className="text-sm text-muted-foreground">{overviewMessage}</p> : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Stripe Connect</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {connectBypassActive ? (
                <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Dev mode: Stripe Connect bypass is active. Tenant payments can run on your platform
                  Stripe account while onboarding is incomplete.
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={property.stripeConnectAccountId ? "secondary" : "outline"}>
                  {property.stripeConnectAccountId ? "Account linked" : "No account linked"}
                </Badge>
                <Badge variant={property.stripeConnectDetailsSubmitted ? "success" : "warning"}>
                  {property.stripeConnectDetailsSubmitted ? "Details submitted" : "Details pending"}
                </Badge>
                <Badge variant={property.stripeConnectChargesEnabled ? "success" : "warning"}>
                  {property.stripeConnectChargesEnabled ? "Charges enabled" : "Charges disabled"}
                </Badge>
                <Badge variant={property.stripeConnectPayoutsEnabled ? "success" : "warning"}>
                  {property.stripeConnectPayoutsEnabled ? "Payouts enabled" : "Payouts disabled"}
                </Badge>
              </div>
              {property.stripeConnectAccountId ? (
                <p className="text-sm text-muted-foreground">
                  Connected account ID: {property.stripeConnectAccountId}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={createOrSyncStripeAccount} disabled={stripeBusy}>
                  {stripeBusy ? "Working..." : "Create/Sync Stripe Account"}
                </Button>
                <Button
                  variant="outline"
                  onClick={openStripeOnboarding}
                  disabled={stripeBusy || !property.stripeConnectAccountId}
                >
                  Open Onboarding
                </Button>
                <Button variant="outline" onClick={refreshStripeStatus} disabled={stripeBusy}>
                  Refresh Status
                </Button>
              </div>
              {stripeMessage ? <p className="text-sm text-muted-foreground">{stripeMessage}</p> : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="units" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={unitsAddressFilter}
                onChange={(e) => setUnitsAddressFilter(e.target.value)}
                className="w-72"
              >
                <option value="all">All addresses</option>
                {property.addresses.map((address) => (
                  <option key={address.id} value={address.id}>
                    {address.street}, {address.city}, {address.state} {address.zip}
                  </option>
                ))}
              </Select>
              {selectedAddress ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => openEditAddress(selectedAddress)}>
                    <Pencil className="mr-1 h-4 w-4" />
                    Edit Address
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => deleteAddress(selectedAddress.id)}>
                    <Trash2 className="mr-1 h-4 w-4 text-destructive" />
                    Delete Address
                  </Button>
                </>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => selectedAddress && openAddUnit(selectedAddress.id)}
                disabled={!selectedAddress}
              >
                <Plus className="mr-2 h-4 w-4" /> Add Unit
              </Button>
              <Button onClick={openAddAddress}><Plus className="mr-2 h-4 w-4" /> Add Address</Button>
            </div>
          </div>
          {property.addresses.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <MapPin className="mb-4 h-12 w-12 text-muted-foreground" />
                <p className="mb-2 text-lg font-medium">No addresses yet</p>
                <p className="mb-4 text-sm text-muted-foreground">Add an address to start managing units.</p>
                <Button onClick={openAddAddress}><Plus className="mr-2 h-4 w-4" />Add Address</Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                {visibleUnitRows.length === 0 ? (
                  <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                    No units found for the selected address.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Unit</TableHead>
                        <TableHead>Address</TableHead>
                        <TableHead>Beds / Baths</TableHead>
                        <TableHead>Sq Ft</TableHead>
                        <TableHead className="text-right">Market Rent</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Tenant</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleUnitRows.map(({ unit, address, activeLease }) => (
                        <TableRow key={unit.id}>
                          <TableCell className="font-medium">
                            <Link href={`/units/${unit.id}`} className="hover:text-primary hover:underline">
                              Unit {unit.unitNumber}
                            </Link>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {address.street}, {address.city}, {address.state} {address.zip}
                          </TableCell>
                          <TableCell>{unit.bedrooms} / {unit.bathrooms}</TableCell>
                          <TableCell>{unit.sqft ?? "—"}</TableCell>
                          <TableCell className="text-right">{unit.marketRent ? formatCurrency(unit.marketRent) : "—"}</TableCell>
                          <TableCell>
                            {activeLease ? <Badge variant="success">Occupied</Badge> : <Badge variant="warning">Vacant</Badge>}
                          </TableCell>
                          <TableCell>
                            {activeLease ? `${activeLease.tenant.firstName} ${activeLease.tenant.lastName}` : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => openEditUnit(unit, address.id)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => deleteUnit(unit.id)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="maintenance">
          <Card>
            <CardHeader>
              <CardTitle>Maintenance</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {workOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Wrench className="mb-2 h-10 w-10 text-muted-foreground/60" />
                  <p className="text-sm text-muted-foreground">No maintenance records for this property.</p>
                  <Link href="/maintenance" className="mt-3 text-sm text-primary hover:underline">Go to Maintenance</Link>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead>Tenant</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {workOrders.map((wo) => (
                      <TableRow key={wo.id}>
                        <TableCell>{wo.title}</TableCell>
                        <TableCell><Badge variant="outline" className="capitalize">{wo.status.replace("_", " ")}</Badge></TableCell>
                        <TableCell><Badge variant="secondary" className="capitalize">{wo.priority}</Badge></TableCell>
                        <TableCell>Unit {wo.unit.unitNumber}</TableCell>
                        <TableCell>{wo.tenant ? `${wo.tenant.firstName} ${wo.tenant.lastName}` : "—"}</TableCell>
                        <TableCell>{wo.vendor?.name || "—"}</TableCell>
                        <TableCell>{formatDate(wo.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions">
          <Card>
            <CardHeader>
              <CardTitle>Transactions</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {entries.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <ReceiptText className="mb-2 h-10 w-10 text-muted-foreground/60" />
                  <p className="text-sm text-muted-foreground">No accounting transactions for this property.</p>
                  <Link href="/accounting" className="mt-3 text-sm text-primary hover:underline">Go to Accounting</Link>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Memo</TableHead>
                      <TableHead className="text-right">Lines</TableHead>
                      <TableHead className="text-right">Total Debit</TableHead>
                      <TableHead className="text-right">Total Credit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((entry) => {
                      const debit = entry.lines.reduce((s, l) => s + l.debit, 0);
                      const credit = entry.lines.reduce((s, l) => s + l.credit, 0);
                      return (
                        <TableRow key={entry.id}>
                          <TableCell>{formatDate(entry.date)}</TableCell>
                          <TableCell>{entry.reference || "—"}</TableCell>
                          <TableCell>{entry.memo || "—"}</TableCell>
                          <TableCell className="text-right">{entry.lines.length}</TableCell>
                          <TableCell className="text-right">{formatCurrency(debit)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(credit)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tenants">
          <Card>
            <CardHeader>
              <CardTitle>Tenants</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {tenantRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Users className="mb-2 h-10 w-10 text-muted-foreground/60" />
                  <p className="text-sm text-muted-foreground">No active tenants for this property.</p>
                  <Link href="/tenants" className="mt-3 text-sm text-primary hover:underline">Go to Tenants</Link>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tenant</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Rent</TableHead>
                      <TableHead className="text-right">Lease</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tenantRows.map((tenant) => (
                      <TableRow key={tenant.leaseId}>
                        <TableCell>{tenant.tenantName}</TableCell>
                        <TableCell><Badge variant="success" className="capitalize">{tenant.status}</Badge></TableCell>
                        <TableCell className="text-right">{formatCurrency(tenant.monthlyRent)}</TableCell>
                        <TableCell className="text-right">
                          <Link href={`/leases/${tenant.leaseId}`} className="text-primary hover:underline">View Lease</Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Address Dialog ──────────────────────────────────────────────── */}
      <Dialog open={showAddressDialog} onOpenChange={setShowAddressDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingAddress ? "Edit Address" : "Add Address"}</DialogTitle>
            <DialogDescription>
              {editingAddress ? "Update the address details." : "Add a new address to this property."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Street Address</Label>
              <Input placeholder="123 Main St" value={addrStreet} onChange={(e) => setAddrStreet(e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>City</Label>
                <Input placeholder="City" value={addrCity} onChange={(e) => setAddrCity(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>State</Label>
                <Input placeholder="ST" value={addrState} onChange={(e) => setAddrState(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>ZIP</Label>
                <Input placeholder="12345" value={addrZip} onChange={(e) => setAddrZip(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddressDialog(false)}>Cancel</Button>
            <Button onClick={saveAddress} disabled={!addrStreet || !addrCity || !addrState || !addrZip}>
              {editingAddress ? "Save Changes" : "Add Address"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Unit Dialog ────────────────────────────────────────────────── */}
      <Dialog open={showUnitDialog} onOpenChange={setShowUnitDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingUnit ? "Edit Unit" : "Add Unit"}</DialogTitle>
            <DialogDescription>
              {editingUnit ? "Update unit details." : "Add a new unit to this address."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Unit Number / Name</Label>
              <Input placeholder="e.g. 1A, 201, Ground Floor" value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Bedrooms</Label>
                <Input type="number" min="0" value={unitBeds} onChange={(e) => setUnitBeds(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Bathrooms</Label>
                <Input type="number" min="0" step="0.5" value={unitBaths} onChange={(e) => setUnitBaths(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Square Feet</Label>
                <Input type="number" placeholder="Optional" value={unitSqft} onChange={(e) => setUnitSqft(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Market Rent ($)</Label>
                <Input type="number" placeholder="Monthly rent" value={unitRent} onChange={(e) => setUnitRent(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUnitDialog(false)}>Cancel</Button>
            <Button onClick={saveUnit} disabled={!unitNumber.trim()}>
              {editingUnit ? "Save Changes" : "Add Unit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
