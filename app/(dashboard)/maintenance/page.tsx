"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Plus, Wrench, Trash2, AlertTriangle, Clock, CheckCircle, XCircle,
  User, Building2, Pencil,
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { formatCurrency, formatDate } from "@/lib/utils";

/* ============================================================================
   Maintenance Page — Work Orders + Vendors
   ============================================================================ */

interface WorkOrder {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  cost: number | null;
  completedAt: string | null;
  createdAt: string;
  unit: { id: string; unitNumber: string; address: { street: string; property: { id: string; name: string } } };
  tenant: { id: string; firstName: string; lastName: string } | null;
  vendor: { id: string; name: string } | null;
}

interface WorkOrderActivity {
  id: string;
  message: string;
  tenantVisible: boolean;
  createdAt: string;
  createdBy: {
    id: string;
    name: string;
    email: string;
  } | null;
}

interface Vendor {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  specialty: string | null;
  notes: string | null;
  workOrders: { id: string; status: string }[];
}

interface UnitOption {
  id: string;
  label: string;
}

interface TenantOption {
  id: string;
  label: string;
}

const priorityColors: Record<string, string> = {
  low: "secondary",
  medium: "warning",
  high: "destructive",
  emergency: "destructive",
};

const statusIcons: Record<string, React.ReactNode> = {
  open: <AlertTriangle className="h-4 w-4" />,
  in_progress: <Clock className="h-4 w-4" />,
  completed: <CheckCircle className="h-4 w-4" />,
  closed: <XCircle className="h-4 w-4" />,
};

export default function MaintenancePage() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Work order dialog
  const [showWODialog, setShowWODialog] = useState(false);
  const [editingWorkOrder, setEditingWorkOrder] = useState<WorkOrder | null>(null);
  const [woTitle, setWoTitle] = useState("");
  const [woDesc, setWoDesc] = useState("");
  const [woPriority, setWoPriority] = useState("medium");
  const [woUnitId, setWoUnitId] = useState("");
  const [woTenantId, setWoTenantId] = useState("");
  const [woVendorId, setWoVendorId] = useState("");
  const [woStatus, setWoStatus] = useState("open");
  const [woCost, setWoCost] = useState("");
  const [activities, setActivities] = useState<WorkOrderActivity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [woUpdateMessage, setWoUpdateMessage] = useState("");
  const [woUpdateTenantVisible, setWoUpdateTenantVisible] = useState(false);
  const [postingActivity, setPostingActivity] = useState(false);

  // Vendor dialog
  const [showVendorDialog, setShowVendorDialog] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [vName, setVName] = useState("");
  const [vEmail, setVEmail] = useState("");
  const [vPhone, setVPhone] = useState("");
  const [vSpecialty, setVSpecialty] = useState("");
  const [vNotes, setVNotes] = useState("");

  const fetchData = useCallback(async () => {
    const [woRes, vendorRes, propRes, tenantRes] = await Promise.all([
      fetch("/api/work-orders"),
      fetch("/api/vendors"),
      fetch("/api/properties"),
      fetch("/api/tenants"),
    ]);
    setWorkOrders(await woRes.json());
    setVendors(await vendorRes.json());

    // Build unit options from properties
    const props = await propRes.json();
    const unitOpts: UnitOption[] = [];
    for (const p of props) {
      for (const a of p.addresses) {
        for (const u of a.units) {
          unitOpts.push({ id: u.id, label: `${p.name} — ${a.street} — Unit ${u.unitNumber}` });
        }
      }
    }
    setUnits(unitOpts);

    const tenantData = await tenantRes.json();
    setTenants(tenantData.map((t: { id: string; firstName: string; lastName: string }) => ({
      id: t.id, label: `${t.firstName} ${t.lastName}`,
    })));

    setLoading(false);
  }, []);

  useEffect(() => {
    // This page intentionally hydrates local state after initial client fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [fetchData]);

  // ── Work Order CRUD ─────────────────────────────────────────────────
  const saveWorkOrder = async () => {
    if (editingWorkOrder) {
      await fetch(`/api/work-orders/${editingWorkOrder.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: woTitle,
          description: woDesc,
          priority: woPriority,
          status: woStatus,
          vendorId: woVendorId || null,
          cost: woCost || null,
        }),
      });

      if (woUpdateMessage.trim()) {
        await fetch(`/api/work-orders/${editingWorkOrder.id}/activities`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: woUpdateMessage.trim(),
            tenantVisible: woUpdateTenantVisible,
          }),
        });
      }
    } else {
      await fetch("/api/work-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unitId: woUnitId,
          tenantId: woTenantId || null,
          vendorId: woVendorId || null,
          title: woTitle,
          description: woDesc,
          priority: woPriority,
        }),
      });
    }
    setShowWODialog(false);
    setEditingWorkOrder(null);
    setWoUpdateMessage("");
    setWoUpdateTenantVisible(false);
    setActivities([]);
    fetchData();
  };

  const openCreateWorkOrderDialog = () => {
    setEditingWorkOrder(null);
    setWoTitle("");
    setWoDesc("");
    setWoPriority("medium");
    setWoUnitId("");
    setWoTenantId("");
    setWoVendorId("");
    setWoStatus("open");
    setWoCost("");
    setWoUpdateMessage("");
    setWoUpdateTenantVisible(false);
    setActivities([]);
    setShowWODialog(true);
  };

  const fetchWorkOrderActivities = useCallback(async (workOrderId: string) => {
    setActivitiesLoading(true);
    try {
      const res = await fetch(`/api/work-orders/${workOrderId}/activities`);
      if (!res.ok) {
        setActivities([]);
        return;
      }
      const data = await res.json();
      setActivities(Array.isArray(data) ? data : []);
    } finally {
      setActivitiesLoading(false);
    }
  }, []);

  const openEditWorkOrderDialog = async (workOrder: WorkOrder) => {
    setEditingWorkOrder(workOrder);
    setWoTitle(workOrder.title);
    setWoDesc(workOrder.description || "");
    setWoPriority(workOrder.priority);
    setWoUnitId(workOrder.unit.id);
    setWoTenantId(workOrder.tenant?.id || "");
    setWoVendorId(workOrder.vendor?.id || "");
    setWoStatus(workOrder.status);
    setWoCost(workOrder.cost !== null ? String(workOrder.cost) : "");
    setWoUpdateMessage("");
    setWoUpdateTenantVisible(false);
    setActivities([]);
    setShowWODialog(true);
    await fetchWorkOrderActivities(workOrder.id);
  };

  const addActivityUpdate = async () => {
    if (!editingWorkOrder || !woUpdateMessage.trim()) return;
    setPostingActivity(true);
    await fetch(`/api/work-orders/${editingWorkOrder.id}/activities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: woUpdateMessage.trim(),
        tenantVisible: woUpdateTenantVisible,
      }),
    });
    setWoUpdateMessage("");
    setWoUpdateTenantVisible(false);
    setPostingActivity(false);
    await fetchWorkOrderActivities(editingWorkOrder.id);
  };

  const updateStatus = async (id: string, status: string) => {
    await fetch(`/api/work-orders/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    fetchData();
  };

  const assignVendor = async (woId: string, vendorId: string) => {
    await fetch(`/api/work-orders/${woId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendorId }),
    });
    fetchData();
  };

  const deleteWorkOrder = async (id: string) => {
    if (!confirm("Delete this work order?")) return;
    await fetch(`/api/work-orders/${id}`, { method: "DELETE" });
    fetchData();
  };

  // ── Vendor CRUD ─────────────────────────────────────────────────────
  const openCreateVendor = () => {
    setEditingVendor(null);
    setVName(""); setVEmail(""); setVPhone(""); setVSpecialty(""); setVNotes("");
    setShowVendorDialog(true);
  };

  const openEditVendor = (v: Vendor) => {
    setEditingVendor(v);
    setVName(v.name); setVEmail(v.email || ""); setVPhone(v.phone || "");
    setVSpecialty(v.specialty || ""); setVNotes(v.notes || "");
    setShowVendorDialog(true);
  };

  const saveVendor = async () => {
    const payload = { name: vName, email: vEmail, phone: vPhone, specialty: vSpecialty, notes: vNotes };
    if (editingVendor) {
      await fetch(`/api/vendors/${editingVendor.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    } else {
      await fetch("/api/vendors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    }
    setShowVendorDialog(false);
    fetchData();
  };

  const deleteVendor = async (id: string) => {
    if (!confirm("Delete this vendor?")) return;
    await fetch(`/api/vendors/${id}`, { method: "DELETE" });
    fetchData();
  };

  // Count work orders by status
  const statusCounts = {
    open: workOrders.filter((w) => w.status === "open").length,
    in_progress: workOrders.filter((w) => w.status === "in_progress").length,
    completed: workOrders.filter((w) => w.status === "completed").length,
    closed: workOrders.filter((w) => w.status === "closed").length,
  };

  if (loading) return <div className="flex items-center justify-center py-20"><p className="text-muted-foreground">Loading...</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Maintenance</h1>
          <p className="text-muted-foreground">Work orders and vendor management.</p>
        </div>
        <Button onClick={openCreateWorkOrderDialog}>
          <Plus className="mr-2 h-4 w-4" /> New Work Order
        </Button>
      </div>

      {/* Status summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Open</p><p className="text-2xl font-bold text-orange-500">{statusCounts.open}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">In Progress</p><p className="text-2xl font-bold text-blue-500">{statusCounts.in_progress}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Completed</p><p className="text-2xl font-bold text-green-500">{statusCounts.completed}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Closed</p><p className="text-2xl font-bold text-muted-foreground">{statusCounts.closed}</p></CardContent></Card>
      </div>

      <Tabs defaultValue="work-orders">
        <TabsList>
          <TabsTrigger value="work-orders">Work Orders</TabsTrigger>
          <TabsTrigger value="vendors">Vendors</TabsTrigger>
        </TabsList>

        {/* ── Work Orders ──────────────────────────────────────────────── */}
        <TabsContent value="work-orders" className="space-y-3">
          {workOrders.length === 0 ? (
            <Card><CardContent className="flex flex-col items-center py-16">
              <Wrench className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-lg font-medium">No work orders</p>
              <p className="mb-4 text-sm text-muted-foreground">Create a work order when maintenance is needed.</p>
            </CardContent></Card>
          ) : (
            workOrders.map((wo) => (
              <Card
                key={wo.id}
                className="cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => {
                  openEditWorkOrderDialog(wo);
                }}
              >
                <CardContent className="flex items-start gap-4 p-4">
                  {/* Status icon */}
                  <div className="mt-1">{statusIcons[wo.status]}</div>

                  {/* Main content */}
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium hover:text-primary hover:underline">{wo.title}</span>
                      <Badge variant={priorityColors[wo.priority] as "secondary" | "warning" | "destructive"} className="text-[10px] capitalize">{wo.priority}</Badge>
                      <Badge variant="outline" className="text-[10px] capitalize">{wo.status.replace("_", " ")}</Badge>
                    </div>
                    {wo.description && <p className="text-sm text-muted-foreground">{wo.description}</p>}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <Link
                        href={`/properties/${wo.unit.address.property.id}`}
                        className="flex items-center gap-1 hover:text-primary hover:underline"
                      >
                        <Building2 className="h-3 w-3" />
                        {wo.unit.address.property.name} — Unit {wo.unit.unitNumber}
                      </Link>
                      {wo.tenant && (
                        <Link href="/tenants" className="flex items-center gap-1 hover:text-primary hover:underline">
                          <User className="h-3 w-3" />
                          {wo.tenant.firstName} {wo.tenant.lastName}
                        </Link>
                      )}
                      {wo.vendor && <span>Vendor: {wo.vendor.name}</span>}
                      {wo.cost && <span>Cost: {formatCurrency(wo.cost)}</span>}
                      <span>Created: {formatDate(wo.createdAt)}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    {wo.status === "open" && (
                      <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); updateStatus(wo.id, "in_progress"); }}>Start</Button>
                    )}
                    {wo.status === "in_progress" && (
                      <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); updateStatus(wo.id, "completed"); }}>Complete</Button>
                    )}
                    {wo.status === "completed" && (
                      <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); updateStatus(wo.id, "closed"); }}>Close</Button>
                    )}
                    {/* Vendor assignment */}
                    <Select
                      className="w-36 text-xs"
                      value={wo.vendor?.id || ""}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        assignVendor(wo.id, e.target.value);
                      }}
                    >
                      <option value="">Assign vendor...</option>
                      {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </Select>
                    <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); deleteWorkOrder(wo.id); }}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ── Vendors ──────────────────────────────────────────────────── */}
        <TabsContent value="vendors" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={openCreateVendor}><Plus className="mr-2 h-4 w-4" /> Add Vendor</Button>
          </div>
          {vendors.length === 0 ? (
            <Card><CardContent className="flex flex-col items-center py-16">
              <User className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-lg font-medium">No vendors</p>
              <p className="text-sm text-muted-foreground">Add maintenance vendors to assign to work orders.</p>
            </CardContent></Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {vendors.map((v) => (
                <Card key={v.id} className="group relative">
                  <div className="absolute right-3 top-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" onClick={() => openEditVendor(v)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteVendor(v.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{v.name}</CardTitle>
                    {v.specialty && <Badge variant="secondary" className="w-fit text-[10px]">{v.specialty}</Badge>}
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm text-muted-foreground">
                    {v.email && <p>{v.email}</p>}
                    {v.phone && <p>{v.phone}</p>}
                    <p className="text-xs">{v.workOrders.length} work order(s)</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Work Order Dialog ───────────────────────────────────────────── */}
      <Dialog open={showWODialog} onOpenChange={setShowWODialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editingWorkOrder ? "Edit Work Order" : "New Work Order"}</DialogTitle>
            <DialogDescription>
              {editingWorkOrder ? "Update work order details and save changes." : "Create a maintenance request."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input placeholder="e.g. Leaky faucet in kitchen" value={woTitle} onChange={(e) => setWoTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea placeholder="Details..." value={woDesc} onChange={(e) => setWoDesc(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Unit</Label>
                <Select
                  value={woUnitId}
                  onChange={(e) => setWoUnitId(e.target.value)}
                  disabled={Boolean(editingWorkOrder)}
                >
                  <option value="">Select unit...</option>
                  {units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={woPriority} onChange={(e) => setWoPriority(e.target.value)}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="emergency">Emergency</option>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Tenant (optional)</Label>
                <Select
                  value={woTenantId}
                  onChange={(e) => setWoTenantId(e.target.value)}
                  disabled={Boolean(editingWorkOrder)}
                >
                  <option value="">Select tenant...</option>
                  {tenants.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Vendor (optional)</Label>
                <Select value={woVendorId} onChange={(e) => setWoVendorId(e.target.value)}>
                  <option value="">Assign later...</option>
                  {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </Select>
              </div>
            </div>
            {editingWorkOrder && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={woStatus} onChange={(e) => setWoStatus(e.target.value)}>
                      <option value="open">Open</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                      <option value="closed">Closed</option>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Cost (optional)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={woCost}
                      onChange={(e) => setWoCost(e.target.value)}
                    />
                  </div>
                </div>

                {/* PM-only timeline updates can be explicitly marked tenant-visible. */}
                <div className="space-y-3 rounded-lg border p-3">
                  <div className="space-y-2">
                    <Label>Add Update</Label>
                    <Textarea
                      rows={3}
                      placeholder="Add progress notes, scheduling details, or completion updates."
                      value={woUpdateMessage}
                      onChange={(e) => setWoUpdateMessage(e.target.value)}
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={woUpdateTenantVisible}
                      onChange={(e) => setWoUpdateTenantVisible(e.target.checked)}
                    />
                    Tenant visible
                  </label>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={addActivityUpdate}
                      disabled={postingActivity || !woUpdateMessage.trim()}
                    >
                      {postingActivity ? "Posting..." : "Post Update"}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <Label>Activity Log</Label>
                    <span className="text-xs text-muted-foreground">
                      {activities.length} update{activities.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  {activitiesLoading ? (
                    <p className="text-sm text-muted-foreground">Loading activity...</p>
                  ) : activities.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No activity logged yet.</p>
                  ) : (
                    <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
                      {activities.map((activity) => (
                        <div key={activity.id} className="rounded-md border p-2">
                          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                            <Badge variant={activity.tenantVisible ? "secondary" : "outline"}>
                              {activity.tenantVisible ? "Tenant visible" : "Internal only"}
                            </Badge>
                            <span className="text-muted-foreground">{formatDate(activity.createdAt)}</span>
                            <span className="text-muted-foreground">
                              by {activity.createdBy?.name || "Property manager"}
                            </span>
                          </div>
                          <p className="text-sm">{activity.message}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowWODialog(false);
                setEditingWorkOrder(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={saveWorkOrder} disabled={!woTitle || (!editingWorkOrder && !woUnitId)}>
              {editingWorkOrder ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Vendor Dialog ───────────────────────────────────────────────── */}
      <Dialog open={showVendorDialog} onOpenChange={setShowVendorDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingVendor ? "Edit Vendor" : "Add Vendor"}</DialogTitle>
            <DialogDescription>Maintenance service provider details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Name</Label><Input value={vName} onChange={(e) => setVName(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Email</Label><Input type="email" value={vEmail} onChange={(e) => setVEmail(e.target.value)} /></div>
              <div className="space-y-2"><Label>Phone</Label><Input type="tel" value={vPhone} onChange={(e) => setVPhone(e.target.value)} /></div>
            </div>
            <div className="space-y-2"><Label>Specialty</Label><Input placeholder="e.g. Plumbing, HVAC" value={vSpecialty} onChange={(e) => setVSpecialty(e.target.value)} /></div>
            <div className="space-y-2"><Label>Notes</Label><Textarea value={vNotes} onChange={(e) => setVNotes(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVendorDialog(false)}>Cancel</Button>
            <Button onClick={saveVendor} disabled={!vName}>{editingVendor ? "Save" : "Add Vendor"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
