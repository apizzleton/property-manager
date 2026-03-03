"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Clock, Plus, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { BrandLogo } from "@/components/branding/brand-logo";

interface TenantUnitOption {
  id: string;
  unitNumber: string;
  propertyName: string;
  addressLine: string;
}

interface TenantMaintenanceRequest {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  createdAt: string;
  unit: {
    unitNumber: string;
    address: {
      street: string;
      property: { name: string };
    };
  };
  vendor: { id: string; name: string } | null;
}

export default function MaintenanceSuitePage() {
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState("");
  const [requests, setRequests] = useState<TenantMaintenanceRequest[]>([]);
  const [units, setUnits] = useState<TenantUnitOption[]>([]);

  const [unitId, setUnitId] = useState("");
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("medium");
  const [description, setDescription] = useState("");

  const fetchMaintenance = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/tenant-maintenance");
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error || "Unable to load maintenance suite.");
      setRequests([]);
      setUnits([]);
      setLoading(false);
      return;
    }

    setError("");
    setRequests(Array.isArray(data?.requests) ? data.requests : []);
    const nextUnits: TenantUnitOption[] = Array.isArray(data?.units) ? data.units : [];
    setUnits(nextUnits);
    if (!unitId && nextUnits.length > 0) {
      setUnitId(nextUnits[0].id);
    }
    setLoading(false);
  }, [unitId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchMaintenance();
  }, [fetchMaintenance]);

  const submitRequest = async () => {
    if (!unitId || !title.trim()) return;
    setSubmitLoading(true);
    const res = await fetch("/api/tenant-maintenance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        unitId,
        title: title.trim(),
        description: description.trim() || null,
        priority,
      }),
    });

    const data = await res.json().catch(() => null);
    setSubmitLoading(false);
    if (!res.ok) {
      setError(data?.error || "Unable to submit request.");
      return;
    }

    setError("");
    setTitle("");
    setDescription("");
    setPriority("medium");
    fetchMaintenance();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20">
        <BrandLogo variant="icon" size="lg" className="animate-pulse" />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          Loading maintenance suite...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Maintenance Suite</h1>
        <p className="text-muted-foreground">
          Submit maintenance requests and track status updates for your home.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <Card className="neo-surface">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" />
            Submit New Request
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Unit</Label>
              <Select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                <option value="">Select your unit</option>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.propertyName} - {unit.addressLine} - Unit {unit.unitNumber}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="emergency">Emergency</option>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Issue title</Label>
            <Input
              placeholder="Leaking faucet, broken heater, etc."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Description (optional)</Label>
            <Textarea
              rows={3}
              placeholder="Share details to help maintenance triage the issue."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <Button onClick={submitRequest} disabled={submitLoading || !unitId || !title.trim()}>
            {submitLoading ? "Submitting..." : "Submit Request"}
          </Button>
        </CardContent>
      </Card>

      <Card className="neo-surface">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-primary" />
            Your Requests
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No maintenance requests submitted yet.</p>
          ) : (
            requests.map((request) => (
              <div key={request.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{request.title}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="capitalize">{request.priority}</Badge>
                    <Badge variant={request.status === "open" ? "warning" : "secondary"} className="capitalize">
                      {request.status.replace("_", " ")}
                    </Badge>
                  </div>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {request.unit.address.property.name} - {request.unit.address.street} - Unit {request.unit.unitNumber}
                </p>
                {request.description ? <p className="mt-2 text-sm">{request.description}</p> : null}
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {formatDate(request.createdAt)}</span>
                  {request.vendor ? <span>Assigned vendor: {request.vendor.name}</span> : <span className="inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Awaiting assignment</span>}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
