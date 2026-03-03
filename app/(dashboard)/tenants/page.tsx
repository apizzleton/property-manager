"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Plus, Users, Pencil, Trash2, Mail, Phone, FileText, Home, Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";
import { BrandLogo } from "@/components/branding/brand-logo";

/* ============================================================================
   Tenants Page — list all tenants, manage leases
   ============================================================================ */

interface LeaseUnit {
  id: string;
  unitNumber: string;
  address: {
    street: string;
    city: string;
    state: string;
    property: { id: string; name: string };
  };
}

interface Lease {
  id: string;
  status: string;
  monthlyRent: number;
  deposit: number;
  startDate: string;
  endDate: string | null;
  unit: LeaseUnit;
}

interface Tenant {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  emergencyContact: string | null;
  emergencyPhone: string | null;
  notes: string | null;
  leases: Lease[];
}

interface Portfolio { id: string; name: string; propertyIds: string[]; }

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [properties, setProperties] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [portfolioId, setPortfolioId] = useState("");
  const [propertyId, setPropertyId] = useState("");

  // Tenant dialog
  const [showTenantDialog, setShowTenantDialog] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [tFirstName, setTFirstName] = useState("");
  const [tLastName, setTLastName] = useState("");
  const [tEmail, setTEmail] = useState("");
  const [tPhone, setTPhone] = useState("");
  const [tEmergencyContact, setTEmergencyContact] = useState("");
  const [tEmergencyPhone, setTEmergencyPhone] = useState("");
  const [tNotes, setTNotes] = useState("");

  const fetchTenants = useCallback(async () => {
    const params = new URLSearchParams();
    if (portfolioId) params.set("portfolioId", portfolioId);
    if (propertyId) params.set("propertyId", propertyId);
    const qs = params.toString();
    const res = await fetch(`/api/tenants${qs ? `?${qs}` : ""}`);
    setTenants(await res.json());
    setLoading(false);
  }, [portfolioId, propertyId]);

  useEffect(() => {
    fetchTenants();
  }, [fetchTenants]);

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

  // ── Tenant CRUD ─────────────────────────────────────────────────────
  const resetTenantForm = () => {
    setTFirstName(""); setTLastName(""); setTEmail(""); setTPhone("");
    setTEmergencyContact(""); setTEmergencyPhone(""); setTNotes("");
  };

  const openCreateTenant = () => {
    resetTenantForm();
    setEditingTenant(null);
    setShowTenantDialog(true);
  };

  const openEditTenant = (tenant: Tenant) => {
    setEditingTenant(tenant);
    setTFirstName(tenant.firstName);
    setTLastName(tenant.lastName);
    setTEmail(tenant.email || "");
    setTPhone(tenant.phone || "");
    setTEmergencyContact(tenant.emergencyContact || "");
    setTEmergencyPhone(tenant.emergencyPhone || "");
    setTNotes(tenant.notes || "");
    setShowTenantDialog(true);
  };

  const saveTenant = async () => {
    const payload = {
      firstName: tFirstName, lastName: tLastName, email: tEmail,
      phone: tPhone, emergencyContact: tEmergencyContact,
      emergencyPhone: tEmergencyPhone, notes: tNotes,
    };

    if (editingTenant) {
      await fetch(`/api/tenants/${editingTenant.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch("/api/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
    setShowTenantDialog(false);
    fetchTenants();
  };

  const deleteTenant = async (id: string) => {
    if (!confirm("Delete this tenant? Associated leases will also be deleted.")) return;
    await fetch(`/api/tenants/${id}`, { method: "DELETE" });
    fetchTenants();
  };

  const filteredTenants = tenants.filter((tenant) => {
    const activeLease = tenant.leases.find((l) => l.status === "active");
    if (statusFilter === "active" && !activeLease) return false;
    if (statusFilter === "inactive" && activeLease) return false;

    const query = search.trim().toLowerCase();
    if (!query) return true;
    return (
      `${tenant.firstName} ${tenant.lastName}`.toLowerCase().includes(query) ||
      (tenant.email || "").toLowerCase().includes(query) ||
      (tenant.phone || "").toLowerCase().includes(query) ||
      (activeLease?.unit.address.property.name || "").toLowerCase().includes(query) ||
      (activeLease?.unit.unitNumber || "").toLowerCase().includes(query)
    );
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <BrandLogo variant="icon" size="lg" className="animate-pulse" />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          Loading tenants...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header — DoorLoop-style */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tenants</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage tenants and lease agreements.
          </p>
        </div>
        <Button onClick={openCreateTenant}>
          <Plus className="mr-2 h-4 w-4" /> Add Tenant
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={portfolioId} onChange={(e) => { setPortfolioId(e.target.value); setPropertyId(""); }} className="w-44">
          <option value="">All Portfolios</option>
          {portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className="w-44">
          <option value="">All Properties</option>
          {propertyOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tenant, contact, property, or unit..."
          className="w-80"
        />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "inactive")}
          className="w-40"
        >
          <option value="all">All statuses</option>
          <option value="active">Active lease</option>
          <option value="inactive">No active lease</option>
        </Select>
      </div>

      {/* Tenants table */}
      {filteredTenants.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Users className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="mb-2 text-lg font-medium">No tenants yet</p>
            <p className="mb-4 text-sm text-muted-foreground">Add your first tenant to get started.</p>
            <Button onClick={openCreateTenant}><Plus className="mr-2 h-4 w-4" /> Add Tenant</Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Current Lease</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTenants.map((tenant) => {
                  const activeLease = tenant.leases.find((l) => l.status === "active");
                  return (
                    <TableRow key={tenant.id}>
                      <TableCell>
                        <Link href={`/tenants/${tenant.id}`} className="font-medium hover:text-primary hover:underline">
                          {tenant.firstName} {tenant.lastName}
                        </Link>
                        {tenant.notes && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <FileText className="h-3 w-3" /> {tenant.notes.slice(0, 40)}{tenant.notes.length > 40 ? "..." : ""}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1 text-sm">
                          {tenant.email && (
                            <div className="flex items-center gap-1"><Mail className="h-3 w-3" /> {tenant.email}</div>
                          )}
                          {tenant.phone && (
                            <div className="flex items-center gap-1"><Phone className="h-3 w-3" /> {tenant.phone}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {activeLease ? (
                          <div className="text-sm">
                            <Link
                              href={`/properties/${activeLease.unit.address.property.id}`}
                              className="flex items-center gap-1 hover:text-primary hover:underline"
                            >
                              <Building2 className="h-3 w-3" />
                              {activeLease.unit.address.property.name}
                            </Link>
                            <Link
                              href={`/leases/${activeLease.id}`}
                              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary hover:underline"
                            >
                              <Home className="h-3 w-3" />
                              Unit {activeLease.unit.unitNumber} — {formatCurrency(activeLease.monthlyRent)}/mo
                            </Link>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">No active lease</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {activeLease ? (
                          <Badge variant="success">Active</Badge>
                        ) : (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditTenant(tenant)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteTenant(tenant.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ── Tenant Dialog ────────────────────────────────────────────── */}
      <Dialog open={showTenantDialog} onOpenChange={setShowTenantDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingTenant ? "Edit Tenant" : "Add Tenant"}</DialogTitle>
            <DialogDescription>
              {editingTenant ? "Update tenant details." : "Add a new tenant."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>First Name</Label>
                <Input value={tFirstName} onChange={(e) => setTFirstName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Last Name</Label>
                <Input value={tLastName} onChange={(e) => setTLastName(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={tEmail} onChange={(e) => setTEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input type="tel" value={tPhone} onChange={(e) => setTPhone(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Emergency Contact</Label>
                <Input value={tEmergencyContact} onChange={(e) => setTEmergencyContact(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Emergency Phone</Label>
                <Input type="tel" value={tEmergencyPhone} onChange={(e) => setTEmergencyPhone(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={tNotes} onChange={(e) => setTNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTenantDialog(false)}>Cancel</Button>
            <Button onClick={saveTenant} disabled={!tFirstName.trim() || !tLastName.trim()}>
              {editingTenant ? "Save Changes" : "Add Tenant"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
