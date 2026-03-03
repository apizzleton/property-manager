"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Building2, Home, Mail, Phone, ShieldAlert, User, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BrandLogo } from "@/components/branding/brand-logo";
import { formatCurrency, formatDate } from "@/lib/utils";

interface Lease {
  id: string;
  status: string;
  monthlyRent: number;
  deposit: number;
  startDate: string;
  endDate: string | null;
  unit: {
    id: string;
    unitNumber: string;
    address: {
      property: {
        id: string;
        name: string;
      };
    };
  };
}

interface TenantDetail {
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

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  // Reuse the same tenant edit fields from the list page for consistent UX.
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [tFirstName, setTFirstName] = useState("");
  const [tLastName, setTLastName] = useState("");
  const [tEmail, setTEmail] = useState("");
  const [tPhone, setTPhone] = useState("");
  const [tEmergencyContact, setTEmergencyContact] = useState("");
  const [tEmergencyPhone, setTEmergencyPhone] = useState("");
  const [tNotes, setTNotes] = useState("");

  const fetchTenant = useCallback(async () => {
    setLoadError("");
    const res = await fetch(`/api/tenants/${id}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setTenant(null);
      setLoadError(err.error || "Failed to load tenant.");
      setLoading(false);
      return;
    }
    setTenant(await res.json());
    setLoading(false);
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchTenant();
  }, [fetchTenant]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <BrandLogo variant="icon" size="lg" className="animate-pulse" />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          Loading tenant...
        </div>
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-muted-foreground">{loadError || "Tenant not found."}</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/tenants")}>
          Back to Tenants
        </Button>
      </div>
    );
  }

  const activeLease = tenant.leases.find((lease) => lease.status === "active") ?? null;
  const openEditTenant = () => {
    setTFirstName(tenant.firstName);
    setTLastName(tenant.lastName);
    setTEmail(tenant.email || "");
    setTPhone(tenant.phone || "");
    setTEmergencyContact(tenant.emergencyContact || "");
    setTEmergencyPhone(tenant.emergencyPhone || "");
    setTNotes(tenant.notes || "");
    setShowEditDialog(true);
  };

  const saveTenant = async () => {
    const payload = {
      firstName: tFirstName.trim(),
      lastName: tLastName.trim(),
      email: tEmail.trim(),
      phone: tPhone.trim(),
      emergencyContact: tEmergencyContact.trim(),
      emergencyPhone: tEmergencyPhone.trim(),
      notes: tNotes.trim(),
    };

    const res = await fetch(`/api/tenants/${tenant.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Failed to update tenant.");
      return;
    }

    setShowEditDialog(false);
    fetchTenant();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push("/tenants")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">{tenant.firstName} {tenant.lastName}</h1>
            <Badge variant={activeLease ? "success" : "secondary"}>
              {activeLease ? "Active Lease" : "No Active Lease"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">Tenant profile and lease history.</p>
        </div>
        <Button onClick={openEditTenant}>
          <Pencil className="mr-2 h-4 w-4" />
          Edit Tenant
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span>{tenant.firstName} {tenant.lastName}</span>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span>{tenant.email || "No email provided"}</span>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span>{tenant.phone || "No phone provided"}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Emergency Contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-muted-foreground" />
              <span>{tenant.emergencyContact || "No emergency contact provided"}</span>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span>{tenant.emergencyPhone || "No emergency phone provided"}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {tenant.notes ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{tenant.notes}</p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Leases</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {tenant.leases.length === 0 ? (
            <p className="text-sm text-muted-foreground">No leases found for this tenant.</p>
          ) : (
            tenant.leases.map((lease) => (
              <div key={lease.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-1">
                    <Link
                      href={`/leases/${lease.id}`}
                      className="inline-flex items-center gap-1 text-sm font-medium hover:text-primary hover:underline"
                    >
                      <Home className="h-3 w-3" />
                      Lease {lease.id.slice(0, 8)}
                    </Link>
                    <Link
                      href={`/properties/${lease.unit.address.property.id}`}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary hover:underline"
                    >
                      <Building2 className="h-3 w-3" />
                      {lease.unit.address.property.name} - Unit {lease.unit.unitNumber}
                    </Link>
                  </div>
                  <Badge variant={lease.status === "active" ? "success" : "secondary"} className="capitalize">
                    {lease.status}
                  </Badge>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {formatDate(lease.startDate)}
                  {lease.endDate ? ` to ${formatDate(lease.endDate)}` : " onward"} - Rent {formatCurrency(lease.monthlyRent)}
                  {lease.deposit ? ` - Deposit ${formatCurrency(lease.deposit)}` : ""}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Tenant</DialogTitle>
            <DialogDescription>
              Update tenant details.
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
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
            <Button onClick={saveTenant} disabled={!tFirstName.trim() || !tLastName.trim()}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
