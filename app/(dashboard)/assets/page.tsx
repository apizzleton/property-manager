"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BrandLogo } from "@/components/branding/brand-logo";
import { fetchAssetCategories } from "@/lib/fetchAssetCategories";
import { formatCurrency, formatDate } from "@/lib/utils";

type AssetCondition = "new" | "good" | "fair" | "poor" | "needs_replacement";
type AssetEventType = "install" | "inspect" | "repair" | "replace" | "paint" | "flooring_update" | "other";

interface AssetListRow {
  id: string;
  name: string;
  category: string;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  installDate: string | null;
  condition: AssetCondition;
  warrantyEnd: string | null;
  notes: string | null;
  propertyId: string;
  unitId: string | null;
  property: { id: string; name: string };
  unit: { id: string; unitNumber: string } | null;
  events: { eventDate: string; eventType: AssetEventType; summary: string }[];
  _count: { events: number; notesLog: number };
}

interface AssetDetail extends Omit<AssetListRow, "events"> {
  events: {
    id: string;
    eventType: AssetEventType;
    eventDate: string;
    cost: number | null;
    vendorName: string | null;
    summary: string;
    details: string | null;
  }[];
  notesLog: { id: string; note: string; loggedAt: string }[];
}

interface PropertyOption {
  id: string;
  name: string;
  units: { id: string; unitNumber: string }[];
}

const CONDITION_OPTIONS: { value: AssetCondition; label: string }[] = [
  { value: "new", label: "New" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
  { value: "poor", label: "Poor" },
  { value: "needs_replacement", label: "Needs replacement" },
];

const EVENT_OPTIONS: { value: AssetEventType; label: string }[] = [
  { value: "install", label: "Install" },
  { value: "inspect", label: "Inspect" },
  { value: "repair", label: "Repair" },
  { value: "replace", label: "Replace" },
  { value: "paint", label: "Paint update" },
  { value: "flooring_update", label: "Flooring update" },
  { value: "other", label: "Other" },
];

interface AssetFormState {
  category: string;
  propertyId: string;
  unitId: string;
  brand: string;
  model: string;
  serialNumber: string;
  condition: AssetCondition;
  installDate: string;
  warrantyEnd: string;
  notes: string;
}

const INITIAL_FORM: AssetFormState = {
  category: "",
  propertyId: "",
  unitId: "",
  brand: "",
  model: "",
  serialNumber: "",
  condition: "good",
  installDate: "",
  warrantyEnd: "",
  notes: "",
};

export default function AssetsPage() {
  const [assets, setAssets] = useState<AssetListRow[]>([]);
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [assetCategories, setAssetCategories] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [assetLoading, setAssetLoading] = useState(false);

  const [propertyFilter, setPropertyFilter] = useState("");
  const [unitFilter, setUnitFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [search, setSearch] = useState("");

  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<AssetDetail | null>(null);

  const [showAssetDialog, setShowAssetDialog] = useState(false);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [formState, setFormState] = useState<AssetFormState>(INITIAL_FORM);

  const [eventType, setEventType] = useState<AssetEventType>("inspect");
  const [eventDate, setEventDate] = useState("");
  const [eventSummary, setEventSummary] = useState("");
  const [eventDetails, setEventDetails] = useState("");
  const [eventVendor, setEventVendor] = useState("");
  const [eventCost, setEventCost] = useState("");

  const [noteText, setNoteText] = useState("");

  const propertyUnits = useMemo(() => {
    const selected = properties.find((p) => p.id === formState.propertyId);
    return selected?.units ?? [];
  }, [properties, formState.propertyId]);

  const filterUnits = useMemo(() => {
    if (!propertyFilter) {
      return properties.flatMap((p) => p.units.map((u) => ({ ...u, propertyName: p.name })));
    }
    const selected = properties.find((p) => p.id === propertyFilter);
    return (selected?.units ?? []).map((u) => ({ ...u, propertyName: selected?.name ?? "" }));
  }, [properties, propertyFilter]);

  const fetchProperties = useCallback(async () => {
    const res = await fetch("/api/properties");
    if (!res.ok) return;
    const data = await res.json();
    const next: PropertyOption[] = Array.isArray(data)
      ? data.map((property) => ({
          id: property.id,
          name: property.name,
          units: property.addresses.flatMap((address: { units: { id: string; unitNumber: string }[] }) =>
            address.units.map((unit) => ({ id: unit.id, unitNumber: unit.unitNumber }))
          ),
        }))
      : [];
    setProperties(next);
  }, []);

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (propertyFilter) params.set("propertyId", propertyFilter);
    if (unitFilter) params.set("unitId", unitFilter);
    if (categoryFilter) params.set("category", categoryFilter);
    if (search.trim()) params.set("q", search.trim());

    const url = params.toString() ? `/api/assets?${params.toString()}` : "/api/assets";
    const res = await fetch(url);
    const data = res.ok ? await res.json() : [];
    setAssets(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [propertyFilter, unitFilter, categoryFilter, search]);

  const fetchSelectedAsset = useCallback(async (assetId: string) => {
    setAssetLoading(true);
    const res = await fetch(`/api/assets/${assetId}`);
    const data = res.ok ? await res.json() : null;
    setSelectedAsset(data);
    setAssetLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchProperties();
  }, [fetchProperties]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAssetCategories().then(setAssetCategories);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAssets();
  }, [fetchAssets]);

  useEffect(() => {
    if (!selectedAssetId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSelectedAsset(selectedAssetId);
  }, [selectedAssetId, fetchSelectedAsset]);

  useEffect(() => {
    // Keep unit filter valid when property filter changes.
    if (!unitFilter) return;
    const hasUnit = filterUnits.some((u) => u.id === unitFilter);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!hasUnit) setUnitFilter("");
  }, [filterUnits, unitFilter]);

  const openCreateDialog = () => {
    setEditingAssetId(null);
    setFormState(INITIAL_FORM);
    setShowAssetDialog(true);
  };

  const openEditDialog = (asset: AssetListRow) => {
    setEditingAssetId(asset.id);
    setFormState({
      category: asset.category,
      propertyId: asset.propertyId,
      unitId: asset.unitId ?? "",
      brand: asset.brand ?? "",
      model: asset.model ?? "",
      serialNumber: asset.serialNumber ?? "",
      condition: asset.condition,
      installDate: asset.installDate ? new Date(asset.installDate).toISOString().slice(0, 10) : "",
      warrantyEnd: asset.warrantyEnd ? new Date(asset.warrantyEnd).toISOString().slice(0, 10) : "",
      notes: asset.notes ?? "",
    });
    setShowAssetDialog(true);
  };

  const saveAsset = async () => {
    if (!formState.category.trim() || !formState.propertyId) return;

    const payload = {
      // Name is derived from category so users only manage one primary label.
      name: formState.category.trim(),
      category: formState.category.trim(),
      propertyId: formState.propertyId,
      unitId: formState.unitId || null,
      brand: formState.brand || null,
      model: formState.model || null,
      serialNumber: formState.serialNumber || null,
      condition: formState.condition,
      installDate: formState.installDate || null,
      warrantyEnd: formState.warrantyEnd || null,
      notes: formState.notes || null,
    };

    const res = await fetch(editingAssetId ? `/api/assets/${editingAssetId}` : "/api/assets", {
      method: editingAssetId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Failed to save asset");
      return;
    }

    setShowAssetDialog(false);
    await fetchAssets();
    if (editingAssetId) {
      setSelectedAssetId(editingAssetId);
      await fetchSelectedAsset(editingAssetId);
    }
  };

  const deleteAsset = async (assetId: string) => {
    if (!confirm("Delete this asset and all associated history?")) return;
    const res = await fetch(`/api/assets/${assetId}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Failed to delete asset");
      return;
    }
    if (selectedAssetId === assetId) {
      setSelectedAssetId(null);
      setSelectedAsset(null);
    }
    fetchAssets();
  };

  const addEvent = async () => {
    if (!selectedAssetId || !eventSummary.trim() || !eventDate) return;
    const res = await fetch(`/api/assets/${selectedAssetId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType,
        eventDate,
        summary: eventSummary.trim(),
        details: eventDetails.trim() || null,
        vendorName: eventVendor.trim() || null,
        cost: eventCost.trim() || null,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Failed to add event");
      return;
    }

    setEventSummary("");
    setEventDetails("");
    setEventVendor("");
    setEventCost("");
    setEventDate("");
    await fetchSelectedAsset(selectedAssetId);
    fetchAssets();
  };

  const addNote = async () => {
    if (!selectedAssetId || !noteText.trim()) return;
    const res = await fetch(`/api/assets/${selectedAssetId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: noteText.trim() }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Failed to add note");
      return;
    }
    setNoteText("");
    await fetchSelectedAsset(selectedAssetId);
    fetchAssets();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Asset Management</h1>
          <p className="text-muted-foreground">
            Track building and unit assets, maintenance history, and manager notes.
          </p>
        </div>
        <Button onClick={openCreateDialog} disabled={assetCategories.length === 0}>
          <Plus className="mr-2 h-4 w-4" />
          New Asset
        </Button>
      </div>
      {assetCategories.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
          Create at least one asset category in Settings before adding assets.
        </p>
      ) : null}

      <Card className="neo-surface">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Narrow the asset list by location, category, and search.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <Select value={propertyFilter} onChange={(e) => setPropertyFilter(e.target.value)}>
            <option value="">All properties</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Select value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)}>
            <option value="">All units</option>
            {filterUnits.map((u) => (
              <option key={u.id} value={u.id}>
                {u.propertyName ? `${u.propertyName} - Unit ${u.unitNumber}` : `Unit ${u.unitNumber}`}
              </option>
            ))}
          </Select>
          <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">All categories</option>
            {assetCategories.map((category) => (
              <option key={category.id} value={category.name}>
                {category.name}
              </option>
            ))}
          </Select>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search asset, category, model..."
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="neo-surface">
          <CardHeader>
            <CardTitle>Assets</CardTitle>
            <CardDescription>
              {loading ? "Loading assets..." : `${assets.length} asset${assets.length === 1 ? "" : "s"} found`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <div className="flex items-center gap-3 py-6">
                <BrandLogo variant="icon" size="sm" className="animate-pulse" />
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                  Loading assets...
                </div>
              </div>
            ) : assets.length === 0 ? (
              <div className="rounded-xl border border-dashed p-6 text-center">
                <ClipboardList className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                <p className="font-medium">No assets match these filters</p>
                <p className="text-sm text-muted-foreground">Create your first asset to start tracking history.</p>
              </div>
            ) : (
              assets.map((asset) => {
                const isSelected = selectedAssetId === asset.id;
                const lastEvent = asset.events[0];
                return (
                  <button
                    key={asset.id}
                    type="button"
                    className={`w-full rounded-xl border p-3 text-left transition-colors ${
                      isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-accent/30"
                    }`}
                    onClick={() => setSelectedAssetId(asset.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{asset.category}</p>
                      <Badge variant="outline">{asset.category}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {asset.property.name}
                      {asset.unit ? ` - Unit ${asset.unit.unitNumber}` : " - Building-level"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>{asset._count.events} events</span>
                      <span>{asset._count.notesLog} notes</span>
                      <span>
                        Last activity: {lastEvent ? formatDate(lastEvent.eventDate) : "none"}
                      </span>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(event) => {
                          event.stopPropagation();
                          openEditDialog(asset);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteAsset(asset.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card className="neo-surface">
          <CardHeader>
            <CardTitle>Asset Details</CardTitle>
            <CardDescription>
              {assetLoading
                ? "Loading selected asset..."
                : selectedAsset
                  ? `${selectedAsset.property.name}${selectedAsset.unit ? ` - Unit ${selectedAsset.unit.unitNumber}` : " - Building-level"}`
                  : "Select an asset to view history and notes"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedAsset ? (
              <p className="text-sm text-muted-foreground">No asset selected.</p>
            ) : (
              <Tabs defaultValue="history">
                <TabsList>
                  <TabsTrigger value="history">History</TabsTrigger>
                  <TabsTrigger value="notes">Notes</TabsTrigger>
                </TabsList>

                <TabsContent value="history" className="space-y-3">
                  <div className="grid gap-2 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Event type</Label>
                      <Select value={eventType} onChange={(e) => setEventType(e.target.value as AssetEventType)}>
                        {EVENT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Event date</Label>
                      <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <Label>Summary</Label>
                      <Input value={eventSummary} onChange={(e) => setEventSummary(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label>Vendor (optional)</Label>
                      <Input value={eventVendor} onChange={(e) => setEventVendor(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label>Cost (optional)</Label>
                      <Input value={eventCost} onChange={(e) => setEventCost(e.target.value)} placeholder="0.00" />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <Label>Details (optional)</Label>
                      <Textarea value={eventDetails} onChange={(e) => setEventDetails(e.target.value)} rows={2} />
                    </div>
                  </div>
                  <Button onClick={addEvent} disabled={!eventDate || !eventSummary.trim()}>
                    Add Event
                  </Button>

                  <div className="space-y-2">
                    {selectedAsset.events.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No events yet.</p>
                    ) : (
                      selectedAsset.events.map((event) => (
                        <div key={event.id} className="rounded-lg border p-3">
                          <div className="flex items-center justify-between">
                            <Badge variant="outline">{event.eventType.replace("_", " ")}</Badge>
                            <span className="text-xs text-muted-foreground">{formatDate(event.eventDate)}</span>
                          </div>
                          <p className="mt-1 text-sm font-medium">{event.summary}</p>
                          {event.details ? <p className="text-sm text-muted-foreground">{event.details}</p> : null}
                          <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
                            {event.vendorName ? <span>Vendor: {event.vendorName}</span> : null}
                            {event.cost !== null ? <span>Cost: {formatCurrency(event.cost)}</span> : null}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="notes" className="space-y-3">
                  <div className="space-y-1">
                    <Label>Add note</Label>
                    <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={3} />
                  </div>
                  <Button onClick={addNote} disabled={!noteText.trim()}>
                    Add Note
                  </Button>
                  <div className="space-y-2">
                    {selectedAsset.notesLog.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No notes yet.</p>
                    ) : (
                      selectedAsset.notesLog.map((note) => (
                        <div key={note.id} className="rounded-lg border p-3">
                          <p className="text-sm">{note.note}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{formatDate(note.loggedAt)}</p>
                        </div>
                      ))
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={showAssetDialog} onOpenChange={setShowAssetDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingAssetId ? "Edit Asset" : "New Asset"}</DialogTitle>
            <DialogDescription>
              Record assets at property or unit level so maintenance history stays attached.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Category</Label>
              <Select
                value={formState.category}
                onChange={(e) => setFormState((prev) => ({ ...prev, category: e.target.value }))}
              >
                <option value="">Select category</option>
                {assetCategories.map((category) => (
                  <option key={category.id} value={category.name}>
                    {category.name}
                  </option>
                ))}
              </Select>
              {assetCategories.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Add categories in Settings before creating assets.
                </p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label>Condition</Label>
              <Select
                value={formState.condition}
                onChange={(e) =>
                  setFormState((prev) => ({ ...prev, condition: e.target.value as AssetCondition }))
                }
              >
                {CONDITION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Property</Label>
              <Select
                value={formState.propertyId}
                onChange={(e) =>
                  setFormState((prev) => ({ ...prev, propertyId: e.target.value, unitId: "" }))
                }
              >
                <option value="">Select property</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Unit (optional)</Label>
              <Select
                value={formState.unitId}
                onChange={(e) => setFormState((prev) => ({ ...prev, unitId: e.target.value }))}
                disabled={!formState.propertyId}
              >
                <option value="">Building-level asset</option>
                {propertyUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    Unit {unit.unitNumber}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Brand</Label>
              <Input
                value={formState.brand}
                onChange={(e) => setFormState((prev) => ({ ...prev, brand: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Model</Label>
              <Input
                value={formState.model}
                onChange={(e) => setFormState((prev) => ({ ...prev, model: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Serial #</Label>
              <Input
                value={formState.serialNumber}
                onChange={(e) => setFormState((prev) => ({ ...prev, serialNumber: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Install date</Label>
              <Input
                type="date"
                value={formState.installDate}
                onChange={(e) => setFormState((prev) => ({ ...prev, installDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Warranty end</Label>
              <Input
                type="date"
                value={formState.warrantyEnd}
                onChange={(e) => setFormState((prev) => ({ ...prev, warrantyEnd: e.target.value }))}
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>Notes</Label>
              <Textarea
                value={formState.notes}
                onChange={(e) => setFormState((prev) => ({ ...prev, notes: e.target.value }))}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAssetDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={saveAsset}
              disabled={
                !formState.category.trim() ||
                !formState.propertyId ||
                assetCategories.length === 0
              }
            >
              {editingAssetId ? "Save Changes" : "Create Asset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
