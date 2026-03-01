"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Plus, Building2, Pencil, Trash2 } from "lucide-react";
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

/* ============================================================================
   Properties List Page — shows all properties with quick stats
   ============================================================================ */

interface Unit {
  id: string;
  unitNumber: string;
  bedrooms: number;
  bathrooms: number;
  sqft: number | null;
  marketRent: number | null;
  leases: { id: string; status: string; tenant: { firstName: string; lastName: string } }[];
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
  addresses: Address[];
  createdAt: string;
}

interface Portfolio { id: string; name: string; propertyIds: string[]; }

export default function PropertiesPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [portfolioId, setPortfolioId] = useState("");

  // Form state
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState("residential");
  const [formNotes, setFormNotes] = useState("");

  // Fetch all properties (optionally filtered by portfolio)
  const fetchProperties = useCallback(async () => {
    const url = portfolioId ? `/api/properties?portfolioId=${portfolioId}` : "/api/properties";
    const res = await fetch(url);
    const data = await res.json();
    setProperties(data);
    setLoading(false);
  }, [portfolioId]);

  // Fetch portfolios for filter
  useEffect(() => {
    import("@/lib/fetchPortfolios").then(({ fetchPortfolios }) =>
      fetchPortfolios().then(setPortfolios)
    );
  }, []);

  useEffect(() => {
    fetchProperties();
  }, [fetchProperties]);

  // Reset form fields
  const resetForm = () => {
    setFormName("");
    setFormType("residential");
    setFormNotes("");
  };

  // Open create dialog
  const openCreate = () => {
    resetForm();
    setEditingProperty(null);
    setShowCreateDialog(true);
  };

  // Open edit dialog
  const openEdit = (property: Property) => {
    setFormName(property.name);
    setFormType(property.type);
    setFormNotes(property.notes || "");
    setEditingProperty(property);
    setShowCreateDialog(true);
  };

  // Save property (create or update)
  const handleSave = async () => {
    const payload = { name: formName, type: formType, notes: formNotes };

    if (editingProperty) {
      await fetch(`/api/properties/${editingProperty.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch("/api/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }

    setShowCreateDialog(false);
    resetForm();
    fetchProperties();
  };

  // Delete property
  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this property? This will also delete all addresses and units.")) return;
    await fetch(`/api/properties/${id}`, { method: "DELETE" });
    fetchProperties();
  };

  // Compute quick stats for a property
  const getPropertyStats = (property: Property) => {
    let totalUnits = 0;
    let occupiedUnits = 0;
    let totalRent = 0;

    property.addresses.forEach((addr) => {
      addr.units.forEach((unit) => {
        totalUnits++;
        const activeLease = unit.leases.find((l) => l.status === "active");
        if (activeLease) {
          occupiedUnits++;
        }
        if (unit.marketRent) totalRent += unit.marketRent;
      });
    });

    return { totalUnits, occupiedUnits, totalRent, vacantUnits: totalUnits - occupiedUnits };
  };

  const filteredProperties = properties.filter((property) => {
    if (typeFilter !== "all" && property.type !== typeFilter) return false;
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return (
      property.name.toLowerCase().includes(query) ||
      property.type.toLowerCase().includes(query) ||
      property.addresses.some((a) => (
        `${a.street} ${a.city} ${a.state} ${a.zip}`.toLowerCase().includes(query)
      ))
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Loading properties...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header — DoorLoop-style */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Properties</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your real estate portfolio.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Add Property
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={portfolioId} onChange={(e) => setPortfolioId(e.target.value)} className="w-44">
          <option value="">All Portfolios</option>
          {portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search properties or addresses..."
          className="w-72"
        />
        <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-48">
          <option value="all">All types</option>
          <option value="residential">Residential</option>
          <option value="commercial">Commercial</option>
          <option value="mixed">Mixed Use</option>
        </Select>
      </div>

      {/* Properties table */}
      {filteredProperties.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Building2 className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="mb-2 text-lg font-medium">No properties yet</p>
            <p className="mb-4 text-sm text-muted-foreground">
              Get started by adding your first property.
            </p>
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Add Property
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Property</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Addresses</TableHead>
                  <TableHead>Units</TableHead>
                  <TableHead>Occupancy</TableHead>
                  <TableHead className="text-right">Market Rent</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProperties.map((property) => {
                  const stats = getPropertyStats(property);
                  return (
                    <TableRow key={property.id}>
                      <TableCell>
                        <Link href={`/properties/${property.id}`} className="flex items-center gap-2 font-medium hover:text-primary hover:underline">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          {property.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="capitalize">{property.type}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{property.addresses.length}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{stats.totalUnits}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <OccupancyPie
                            occupied={stats.occupiedUnits}
                            vacant={stats.vacantUnits}
                          />
                          <span className="text-sm text-muted-foreground">
                            {stats.occupiedUnits} / {stats.totalUnits}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {stats.totalRent > 0 ? formatCurrency(stats.totalRent) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(property)} title="Edit">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(property.id)} title="Delete">
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

      {/* Create/Edit Property Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingProperty ? "Edit Property" : "Add Property"}</DialogTitle>
            <DialogDescription>
              {editingProperty ? "Update property details." : "Add a new property to your portfolio."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Property Name</Label>
              <Input
                id="name"
                placeholder="e.g. Sunset Apartments"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Property Type</Label>
              <Select id="type" value={formType} onChange={(e) => setFormType(e.target.value)}>
                <option value="residential">Residential</option>
                <option value="commercial">Commercial</option>
                <option value="mixed">Mixed Use</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Optional notes about this property..."
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!formName.trim()}>
              {editingProperty ? "Save Changes" : "Create Property"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OccupancyPie({ occupied, vacant }: { occupied: number; vacant: number }) {
  const total = occupied + vacant;
  const occupiedPercent = total > 0 ? occupied / total : 0;
  const angle = occupiedPercent * 360;
  const gradient = `conic-gradient(var(--success) ${angle}deg, color-mix(in srgb, var(--muted-foreground) 24%, transparent) ${angle}deg)`;

  return (
    <span
      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-border/70"
      style={{ background: gradient }}
      title={`${occupied} occupied, ${vacant} vacant`}
      aria-label={`${occupied} occupied, ${vacant} vacant`}
    />
  );
}
