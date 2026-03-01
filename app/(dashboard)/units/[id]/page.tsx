"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, BadgeDollarSign, Bed, Building2, FileText, Home, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";

interface UnitDetail {
  id: string;
  unitNumber: string;
  bedrooms: number;
  bathrooms: number;
  sqft: number | null;
  marketRent: number | null;
  address: {
    id: string;
    street: string;
    city: string;
    state: string;
    zip: string;
    property: { id: string; name: string; type: string };
  };
  leases: {
    id: string;
    status: string;
    monthlyRent: number;
    deposit: number;
    startDate: string;
    endDate: string | null;
    tenant: { id: string; firstName: string; lastName: string };
  }[];
  workOrders: {
    id: string;
    title: string;
    priority: string;
    status: string;
    createdAt: string;
    tenant: { firstName: string; lastName: string } | null;
    vendor: { name: string } | null;
  }[];
  documents: {
    id: string;
    name: string;
    category: string | null;
    createdAt: string;
  }[];
  assets: {
    id: string;
    name: string;
    category: string;
    condition: "new" | "good" | "fair" | "poor" | "needs_replacement";
    warrantyEnd: string | null;
    events: { eventDate: string; eventType: string; summary: string }[];
    _count: { events: number; notesLog: number };
  }[];
}

export default function UnitDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [unit, setUnit] = useState<UnitDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [savingOverview, setSavingOverview] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  const [editUnitNumber, setEditUnitNumber] = useState("");
  const [editBedrooms, setEditBedrooms] = useState("0");
  const [editBathrooms, setEditBathrooms] = useState("1");
  const [editSqft, setEditSqft] = useState("");
  const [editMarketRent, setEditMarketRent] = useState("");

  const fetchUnit = useCallback(async () => {
    setLoadError("");
    const res = await fetch(`/api/units/${id}`);
    if (!res.ok) {
      setUnit(null);
      const err = await res.json().catch(() => ({}));
      setLoadError(err.error || "Failed to load unit.");
      setLoading(false);
      return;
    }
    const data = await res.json();
    setUnit(data);
    setEditUnitNumber(data.unitNumber);
    setEditBedrooms(String(data.bedrooms));
    setEditBathrooms(String(data.bathrooms));
    setEditSqft(data.sqft ? String(data.sqft) : "");
    setEditMarketRent(data.marketRent ? String(data.marketRent) : "");
    setLoading(false);
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchUnit();
  }, [fetchUnit]);

  const saveOverview = async () => {
    if (!unit) return;
    setSavingOverview(true);
    setSaveMessage("");

    const res = await fetch(`/api/units/${unit.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        unitNumber: editUnitNumber,
        bedrooms: editBedrooms,
        bathrooms: editBathrooms,
        sqft: editSqft || null,
        marketRent: editMarketRent || null,
      }),
    });

    setSavingOverview(false);
    if (!res.ok) {
      setSaveMessage("Failed to update unit details.");
      return;
    }
    setSaveMessage("Unit details updated.");
    fetchUnit();
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><p className="text-muted-foreground">Loading unit...</p></div>;
  }

  if (!unit) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-muted-foreground">{loadError || "Unit not found."}</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/units")}>
          Back to Units
        </Button>
      </div>
    );
  }

  const activeLease = unit.leases.find((lease) => lease.status === "active") ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push("/units")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">Unit {unit.unitNumber}</h1>
            <Badge variant="secondary" className="capitalize">{unit.address.property.type}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {unit.address.street}, {unit.address.city}, {unit.address.state} {unit.address.zip}
          </p>
          <Link
            href={`/properties/${unit.address.property.id}`}
            className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary hover:underline"
          >
            <Building2 className="h-3 w-3" />
            {unit.address.property.name}
          </Link>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
          <TabsTrigger value="assets">Assets</TabsTrigger>
          <TabsTrigger value="leases">Leases</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Bedrooms</p><p className="text-2xl font-bold">{unit.bedrooms}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Bathrooms</p><p className="text-2xl font-bold">{unit.bathrooms}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Sq Ft</p><p className="text-2xl font-bold">{unit.sqft ?? "—"}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Market Rent</p><p className="text-2xl font-bold">{unit.marketRent ? formatCurrency(unit.marketRent) : "—"}</p></CardContent></Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Edit Unit</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <div className="space-y-2">
                  <Label>Unit #</Label>
                  <Input value={editUnitNumber} onChange={(e) => setEditUnitNumber(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Bedrooms</Label>
                  <Input type="number" value={editBedrooms} onChange={(e) => setEditBedrooms(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Bathrooms</Label>
                  <Input type="number" step="0.5" value={editBathrooms} onChange={(e) => setEditBathrooms(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Sq Ft</Label>
                  <Input type="number" value={editSqft} onChange={(e) => setEditSqft(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Market Rent</Label>
                  <Input type="number" value={editMarketRent} onChange={(e) => setEditMarketRent(e.target.value)} />
                </div>
              </div>
              <Button onClick={saveOverview} disabled={savingOverview}>
                {savingOverview ? "Saving..." : "Save Unit Details"}
              </Button>
              {saveMessage ? <p className="text-sm text-muted-foreground">{saveMessage}</p> : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="maintenance">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Wrench className="h-4 w-4" /> Work Orders</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {unit.workOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground">No maintenance activity for this unit yet.</p>
              ) : (
                unit.workOrders.map((order) => (
                  <div key={order.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{order.title}</p>
                      <Badge variant="outline" className="capitalize">{order.status.replace("_", " ")}</Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span>Priority: {order.priority}</span>
                      <span>Created: {formatDate(order.createdAt)}</span>
                      {order.tenant ? <span>Tenant: {order.tenant.firstName} {order.tenant.lastName}</span> : null}
                      {order.vendor ? <span>Vendor: {order.vendor.name}</span> : null}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assets">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Home className="h-4 w-4" /> Unit Assets</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-end">
                <Link href="/assets">
                  <Button variant="outline">Manage Assets</Button>
                </Link>
              </div>
              {unit.assets.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No assets linked to this unit yet. Add assets from Asset Management and assign them to this unit.
                </p>
              ) : (
                unit.assets.map((asset) => (
                  <div key={asset.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{asset.name}</p>
                      <Badge variant="secondary">{asset.category}</Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span className="capitalize">Condition: {asset.condition.replace("_", " ")}</span>
                      <span>Events: {asset._count.events}</span>
                      <span>Notes: {asset._count.notesLog}</span>
                      <span>
                        Last activity: {asset.events[0]?.eventDate ? formatDate(asset.events[0].eventDate) : "none"}
                      </span>
                      {asset.warrantyEnd ? <span>Warranty: {formatDate(asset.warrantyEnd)}</span> : null}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="leases">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BadgeDollarSign className="h-4 w-4" /> Lease History</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {unit.leases.length === 0 ? (
                <p className="text-sm text-muted-foreground">No leases for this unit yet.</p>
              ) : (
                unit.leases.map((lease) => (
                  <div key={lease.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">
                        {lease.tenant.firstName} {lease.tenant.lastName}
                      </p>
                      <Badge variant={lease.status === "active" ? "success" : "outline"} className="capitalize">
                        {lease.status.replace("_", " ")}
                      </Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span>Start: {formatDate(lease.startDate)}</span>
                      <span>End: {lease.endDate ? formatDate(lease.endDate) : "—"}</span>
                      <span>Rent: {formatCurrency(lease.monthlyRent)}/mo</span>
                      <span>Deposit: {formatCurrency(lease.deposit)}</span>
                    </div>
                    <Link href={`/leases/${lease.id}`} className="mt-2 inline-block text-xs text-primary hover:underline">
                      View lease details
                    </Link>
                  </div>
                ))
              )}
              {activeLease ? (
                <p className="text-xs text-muted-foreground">
                  Active lease: {activeLease.tenant.firstName} {activeLease.tenant.lastName}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4" /> Documents</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {unit.documents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No unit documents uploaded yet.</p>
              ) : (
                unit.documents.map((doc) => (
                  <div key={doc.id} className="rounded-lg border p-3">
                    <p className="font-medium">{doc.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {doc.category || "Uncategorized"} • {formatDate(doc.createdAt)}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
