"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  FileText, Plus, Upload, Trash2, Building2, Home, User, Download,
  File, FileImage, FileSpreadsheet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { formatDate } from "@/lib/utils";

/* ============================================================================
   Documents Page — file management with upload and categorization
   ============================================================================ */

interface Document {
  id: string;
  name: string;
  filePath: string;
  fileType: string | null;
  fileSize: number | null;
  category: string | null;
  createdAt: string;
  property: { id: string; name: string } | null;
  unit: { id: string; unitNumber: string } | null;
  tenant: { id: string; firstName: string; lastName: string } | null;
}

interface Property { id: string; name: string; }
interface Portfolio { id: string; name: string; propertyIds: string[]; }
interface TenantOption { id: string; label: string; }

const categories = ["lease", "receipt", "inspection", "photo", "insurance", "tax", "legal", "other"];

// Icon based on file type
function FileIcon({ fileType }: { fileType: string | null }) {
  if (fileType?.startsWith("image/")) return <FileImage className="h-5 w-5 text-purple-500" />;
  if (fileType?.includes("spreadsheet") || fileType?.includes("csv")) return <FileSpreadsheet className="h-5 w-5 text-green-500" />;
  if (fileType?.includes("pdf")) return <FileText className="h-5 w-5 text-red-500" />;
  return <File className="h-5 w-5 text-muted-foreground" />;
}

// Format file size for display
function formatFileSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [tenantOptions, setTenantOptions] = useState<TenantOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Upload dialog state
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [uploadCategory, setUploadCategory] = useState("");
  const [uploadPropertyId, setUploadPropertyId] = useState("");
  const [uploadTenantId, setUploadTenantId] = useState("");
  const [uploading, setUploading] = useState(false);

  // Filter state
  const [filterCategory, setFilterCategory] = useState("");
  const [search, setSearch] = useState("");
  const [filterPortfolioId, setFilterPortfolioId] = useState("");
  const [filterPropertyId, setFilterPropertyId] = useState("");

  const fetchData = useCallback(async () => {
    const params = new URLSearchParams();
    if (filterPortfolioId) params.set("portfolioId", filterPortfolioId);
    if (filterPropertyId) params.set("propertyId", filterPropertyId);
    const qs = params.toString();
    const { fetchPortfolios } = await import("@/lib/fetchPortfolios");
    const [docRes, propRes, ports, tenantRes] = await Promise.all([
      fetch(`/api/documents${qs ? `?${qs}` : ""}`),
      fetch("/api/properties"),
      fetchPortfolios(),
      fetch("/api/tenants"),
    ]);
    setDocuments(await docRes.json());
    const propData = await propRes.json();
    setProperties(Array.isArray(propData) ? propData.map((p: Property) => ({ id: p.id, name: p.name })) : []);
    setPortfolios(ports);
    const tenantData = await tenantRes.json();
    setTenantOptions(tenantData.map((t: { id: string; firstName: string; lastName: string }) => ({
      id: t.id, label: `${t.firstName} ${t.lastName}`,
    })));
    setLoading(false);
  }, [filterPortfolioId, filterPropertyId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadFile(file);
      if (!uploadName) setUploadName(file.name);
    }
  };

  // Upload document
  const handleUpload = async () => {
    if (!uploadFile || !uploadName) return;
    setUploading(true);

    const formData = new FormData();
    formData.append("file", uploadFile);
    formData.append("name", uploadName);
    if (uploadCategory) formData.append("category", uploadCategory);
    if (uploadPropertyId) formData.append("propertyId", uploadPropertyId);
    if (uploadTenantId) formData.append("tenantId", uploadTenantId);

    await fetch("/api/documents", { method: "POST", body: formData });

    setUploading(false);
    setShowUpload(false);
    setUploadFile(null);
    setUploadName("");
    setUploadCategory("");
    setUploadPropertyId("");
    setUploadTenantId("");
    fetchData();
  };

  // Delete document
  const deleteDocument = async (id: string) => {
    if (!confirm("Delete this document?")) return;
    await fetch(`/api/documents/${id}`, { method: "DELETE" });
    fetchData();
  };

  const propertyOptions = filterPortfolioId
    ? properties.filter((p) => {
        const port = portfolios.find((pf) => pf.id === filterPortfolioId);
        return port && port.propertyIds.includes(p.id);
      })
    : properties;

  // Filter documents (category and search are client-side; property/portfolio are server-side)
  const filteredDocs = documents.filter((doc) => {
    if (filterCategory && doc.category !== filterCategory) return false;
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return (
      doc.name.toLowerCase().includes(query) ||
      (doc.category || "").toLowerCase().includes(query) ||
      (doc.property?.name || "").toLowerCase().includes(query) ||
      (doc.tenant ? `${doc.tenant.firstName} ${doc.tenant.lastName}` : "").toLowerCase().includes(query)
    );
  });

  if (loading) return <div className="flex items-center justify-center py-20"><p className="text-muted-foreground">Loading...</p></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Documents</h1>
          <p className="text-muted-foreground">Manage leases, receipts, and other files.</p>
        </div>
        <Button onClick={() => setShowUpload(true)}>
          <Upload className="mr-2 h-4 w-4" /> Upload Document
        </Button>
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2">
        <Button variant={filterCategory === "" ? "default" : "outline"} size="sm" onClick={() => setFilterCategory("")}>
          All ({documents.length})
        </Button>
        {categories.map((cat) => {
          const count = documents.filter((d) => d.category === cat).length;
          if (count === 0) return null;
          return (
            <Button
              key={cat}
              variant={filterCategory === cat ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterCategory(cat)}
              className="capitalize"
            >
              {cat} ({count})
            </Button>
          );
        })}
        <Select value={filterPortfolioId} onChange={(e) => { setFilterPortfolioId(e.target.value); setFilterPropertyId(""); }} className="w-44">
          <option value="">All Portfolios</option>
          {portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <Select value={filterPropertyId} onChange={(e) => setFilterPropertyId(e.target.value)} className="w-56">
          <option value="">All properties</option>
          {propertyOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </Select>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search document, category, property, tenant..."
          className="w-80"
        />
      </div>

      {/* Documents table */}
      {filteredDocs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="mb-2 text-lg font-medium">No documents</p>
            <p className="mb-4 text-sm text-muted-foreground">Upload files to keep everything organized.</p>
            <Button onClick={() => setShowUpload(true)}>
              <Upload className="mr-2 h-4 w-4" /> Upload Document
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Associated With</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDocs.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell><FileIcon fileType={doc.fileType} /></TableCell>
                    <TableCell className="font-medium">{doc.name}</TableCell>
                    <TableCell>
                      {doc.category && <Badge variant="secondary" className="capitalize">{doc.category}</Badge>}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5 text-xs text-muted-foreground">
                        {doc.property && (
                          <div className="flex items-center gap-1"><Building2 className="h-3 w-3" /> {doc.property.name}</div>
                        )}
                        {doc.unit && (
                          <div className="flex items-center gap-1"><Home className="h-3 w-3" /> Unit {doc.unit.unitNumber}</div>
                        )}
                        {doc.tenant && (
                          <div className="flex items-center gap-1"><User className="h-3 w-3" /> {doc.tenant.firstName} {doc.tenant.lastName}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{formatFileSize(doc.fileSize)}</TableCell>
                    <TableCell className="text-sm">{formatDate(doc.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" asChild>
                          <a href={doc.filePath} download={doc.name} title="Download">
                            <Download className="h-4 w-4" />
                          </a>
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteDocument(doc.id)}>
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

      {/* ── Upload Dialog ───────────────────────────────────────────────── */}
      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
            <DialogDescription>Upload a file and categorize it.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>File</Label>
              <Input type="file" onChange={handleFileSelect} />
            </div>
            <div className="space-y-2">
              <Label>Document Name</Label>
              <Input value={uploadName} onChange={(e) => setUploadName(e.target.value)} placeholder="e.g. Lease Agreement - Unit 1A" />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value)}>
                <option value="">Select category...</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat} className="capitalize">{cat}</option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Property (optional)</Label>
                <Select value={uploadPropertyId} onChange={(e) => setUploadPropertyId(e.target.value)}>
                  <option value="">None</option>
                  {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tenant (optional)</Label>
                <Select value={uploadTenantId} onChange={(e) => setUploadTenantId(e.target.value)}>
                  <option value="">None</option>
                  {tenantOptions.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUpload(false)}>Cancel</Button>
            <Button onClick={handleUpload} disabled={!uploadFile || !uploadName || uploading}>
              {uploading ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
