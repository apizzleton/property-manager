"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, FolderOpen, Palette, Phone, Plus, Tags, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_THEME_HEX,
  THEME_PRESETS,
  applyThemeColor,
  buildThemePalette,
  readSavedThemeColor,
  saveThemeColor,
} from "@/lib/theme";
import { fetchAssetCategories } from "@/lib/fetchAssetCategories";

interface Portfolio {
  id: string;
  name: string;
  description: string | null;
  propertyIds: string[];
  propertyCount: number;
}

interface Property {
  id: string;
  name: string;
}

interface AssetCategory {
  id: string;
  name: string;
}

interface ContactInfo {
  mailingAddress: string;
  emailAddress: string;
  phoneNumber: string;
  emergencyNumber: string;
}

export default function SettingsPage() {
  const [viewerRole, setViewerRole] = useState<"property_manager" | "tenant">(() => {
    if (typeof document === "undefined") return "property_manager";
    const match = document.cookie.match(/(?:^|;\s*)dev_role=([^;]+)/);
    return match?.[1] === "tenant" ? "tenant" : "property_manager";
  });

  // Use DEFAULT_THEME_HEX for initial render to avoid hydration mismatch (readSavedThemeColor uses localStorage)
  const [themeColor, setThemeColor] = useState(() => DEFAULT_THEME_HEX);
  const [hexDraft, setHexDraft] = useState(() => DEFAULT_THEME_HEX);
  const [savedMessage, setSavedMessage] = useState("");

  // Portfolio management state
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [portfolioLoading, setPortfolioLoading] = useState(true);
  const [newPortfolioName, setNewPortfolioName] = useState("");
  const [newPortfolioDesc, setNewPortfolioDesc] = useState("");
  const [expandedPortfolioId, setExpandedPortfolioId] = useState<string | null>(null);
  const [editingPortfolioId, setEditingPortfolioId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [assetCategories, setAssetCategories] = useState<AssetCategory[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editCategoryName, setEditCategoryName] = useState("");
  const [contactInfo, setContactInfo] = useState<ContactInfo>({
    mailingAddress: "",
    emailAddress: "",
    phoneNumber: "",
    emergencyNumber: "",
  });
  const [contactSaveMessage, setContactSaveMessage] = useState("");
  const [contactSaving, setContactSaving] = useState(false);
  const [activeSetting, setActiveSetting] = useState<"theme" | "portfolio" | "assetCategories" | "contactInfo" | null>(null);
  const isTenantView = viewerRole === "tenant";

  const palette = useMemo(() => buildThemePalette(themeColor), [themeColor]);

  const previewTheme = (hex: string) => {
    setThemeColor(hex);
    setHexDraft(hex);
    applyThemeColor(hex);
    setSavedMessage("");
  };

  const applyDraftIfValid = () => {
    const trimmed = hexDraft.trim();
    const candidate = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
    if (/^#[0-9a-fA-F]{6}$/.test(candidate) || /^#[0-9a-fA-F]{3}$/.test(candidate)) {
      previewTheme(candidate);
    }
  };

  const persistTheme = () => {
    saveThemeColor(themeColor);
    setSavedMessage("Theme updated. Buttons, highlights, and gradients now use your chosen color.");
  };

  const resetTheme = () => {
    previewTheme(DEFAULT_THEME_HEX);
    saveThemeColor(DEFAULT_THEME_HEX);
    setSavedMessage("Theme reset to default teal.");
  };

  // Fetch portfolios and properties for portfolio management
  const fetchPortfoliosAndProperties = useCallback(async () => {
    setPortfolioLoading(true);
    try {
      const { fetchPortfolios } = await import("@/lib/fetchPortfolios");
      const [ports, propRes] = await Promise.all([
        fetchPortfolios(),
        fetch("/api/properties"),
      ]);
      setPortfolios(ports);
      if (propRes.ok) {
        const data = await propRes.json();
        setProperties(Array.isArray(data) ? data.map((p: Property) => ({ id: p.id, name: p.name })) : []);
      }
    } finally {
      setPortfolioLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isTenantView) return;
    fetchPortfoliosAndProperties();
  }, [fetchPortfoliosAndProperties, isTenantView]);

  useEffect(() => {
    if (isTenantView) return;
    fetchAssetCategories().then(setAssetCategories);
  }, [isTenantView]);

  useEffect(() => {
    if (isTenantView) return;
    fetch("/api/settings/contact-info")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setContactInfo({
          mailingAddress: data.mailingAddress ?? "",
          emailAddress: data.emailAddress ?? "",
          phoneNumber: data.phoneNumber ?? "",
          emergencyNumber: data.emergencyNumber ?? "",
        });
      })
      .catch(() => {
        // Leave default empty values if contact info cannot be loaded.
      });
  }, [isTenantView]);

  useEffect(() => {
    const match = document.cookie.match(/(?:^|;\s*)dev_role=([^;]+)/);
    setViewerRole(match?.[1] === "tenant" ? "tenant" : "property_manager");
  }, []);

  useEffect(() => {
    if (isTenantView && activeSetting && activeSetting !== "theme") {
      setActiveSetting("theme");
    }
  }, [isTenantView, activeSetting]);

  // Sync theme from localStorage after mount to avoid hydration mismatch
  useEffect(() => {
    const saved = readSavedThemeColor();
    setThemeColor(saved);
    setHexDraft(saved);
    applyThemeColor(saved);
  }, []);

  const createPortfolio = async () => {
    const name = newPortfolioName.trim();
    if (!name) return;
    const res = await fetch("/api/portfolios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description: newPortfolioDesc.trim() || null }),
    });
    if (res.ok) {
      setNewPortfolioName("");
      setNewPortfolioDesc("");
      fetchPortfoliosAndProperties();
    } else {
      const err = await res.json().catch(() => ({}));
      const msg = err.detail ? `${err.error}: ${err.detail}` : (err.error || "Failed to create portfolio");
      alert(msg);
    }
  };

  const updatePortfolio = async (id: string, updates: { name?: string; propertyIds?: string[] }) => {
    const res = await fetch(`/api/portfolios/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      setEditingPortfolioId(null);
      setExpandedPortfolioId(null);
      fetchPortfoliosAndProperties();
    } else {
      const err = await res.json();
      alert(err.error || "Failed to update portfolio");
    }
  };

  const deletePortfolio = async (id: string) => {
    if (!confirm("Delete this portfolio? Property assignments will be removed.")) return;
    const res = await fetch(`/api/portfolios/${id}`, { method: "DELETE" });
    if (res.ok) fetchPortfoliosAndProperties();
    else {
      const err = await res.json();
      alert(err.error || "Failed to delete portfolio");
    }
  };

  const togglePropertyInPortfolio = (portfolioId: string, propertyId: string, currentIds: string[]) => {
    const next = currentIds.includes(propertyId)
      ? currentIds.filter((id) => id !== propertyId)
      : [...currentIds, propertyId];
    updatePortfolio(portfolioId, { propertyIds: next });
  };

  const refreshAssetCategories = async () => {
    setAssetCategories(await fetchAssetCategories());
  };

  const createAssetCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    const res = await fetch("/api/asset-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      setNewCategoryName("");
      refreshAssetCategories();
    } else {
      const err = await res.json().catch(() => ({}));
      const msg = err.detail ? `${err.error}: ${err.detail}` : (err.error || "Failed to create category");
      alert(msg);
    }
  };

  const renameAssetCategory = async (id: string) => {
    const name = editCategoryName.trim();
    if (!name) return;
    const res = await fetch(`/api/asset-categories/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      setEditingCategoryId(null);
      setEditCategoryName("");
      refreshAssetCategories();
    } else {
      const err = await res.json().catch(() => ({}));
      const msg = err.detail ? `${err.error}: ${err.detail}` : (err.error || "Failed to rename category");
      alert(msg);
    }
  };

  const deleteAssetCategory = async (id: string) => {
    if (!confirm("Delete this category? This only works if no assets use it.")) return;
    const res = await fetch(`/api/asset-categories/${id}`, { method: "DELETE" });
    if (res.ok) {
      refreshAssetCategories();
    } else {
      const err = await res.json().catch(() => ({}));
      const msg = err.detail ? `${err.error}: ${err.detail}` : (err.error || "Failed to delete category");
      alert(msg);
    }
  };

  const saveContactInfo = async () => {
    setContactSaving(true);
    setContactSaveMessage("");
    const res = await fetch("/api/settings/contact-info", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(contactInfo),
    });
    setContactSaving(false);
    if (res.ok) {
      setContactSaveMessage("Contact info saved.");
    } else {
      const err = await res.json().catch(() => ({}));
      setContactSaveMessage(err.error || "Failed to save contact info.");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Customize app appearance and behavior.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setActiveSetting(activeSetting === "theme" ? null : "theme")}
          className={`neo-surface rounded-2xl border px-4 py-3 text-left transition-colors ${
            activeSetting === "theme" ? "border-primary bg-primary/5" : "border-border hover:bg-accent/40"
          }`}
        >
          <span className="mb-1 inline-flex items-center gap-2 font-medium">
            <Palette className="h-4 w-4 text-primary" />
            Theme Color
          </span>
          <p className="text-sm text-muted-foreground">Choose brand color and contrast preview</p>
        </button>

        {!isTenantView ? (
          <button
            type="button"
            onClick={() => setActiveSetting(activeSetting === "portfolio" ? null : "portfolio")}
            className={`neo-surface rounded-2xl border px-4 py-3 text-left transition-colors ${
              activeSetting === "portfolio" ? "border-primary bg-primary/5" : "border-border hover:bg-accent/40"
            }`}
          >
            <span className="mb-1 inline-flex items-center gap-2 font-medium">
              <FolderOpen className="h-4 w-4 text-primary" />
              Portfolio Management
            </span>
            <p className="text-sm text-muted-foreground">Create portfolios and assign properties</p>
          </button>
        ) : null}

        {!isTenantView ? (
          <button
            type="button"
            onClick={() => setActiveSetting(activeSetting === "assetCategories" ? null : "assetCategories")}
            className={`neo-surface rounded-2xl border px-4 py-3 text-left transition-colors ${
              activeSetting === "assetCategories" ? "border-primary bg-primary/5" : "border-border hover:bg-accent/40"
            }`}
          >
            <span className="mb-1 inline-flex items-center gap-2 font-medium">
              <Tags className="h-4 w-4 text-primary" />
              Asset Categories
            </span>
            <p className="text-sm text-muted-foreground">Manage category options used in Asset Management</p>
          </button>
        ) : null}

        {!isTenantView ? (
          <button
            type="button"
            onClick={() => setActiveSetting(activeSetting === "contactInfo" ? null : "contactInfo")}
            className={`neo-surface rounded-2xl border px-4 py-3 text-left transition-colors ${
              activeSetting === "contactInfo" ? "border-primary bg-primary/5" : "border-border hover:bg-accent/40"
            }`}
          >
            <span className="mb-1 inline-flex items-center gap-2 font-medium">
              <Phone className="h-4 w-4 text-primary" />
              Contact Info
            </span>
            <p className="text-sm text-muted-foreground">Mailing address, email, phone, emergency number</p>
          </button>
        ) : null}
      </div>

      {!activeSetting ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
          Click a settings bubble above to open it.
        </p>
      ) : null}

      {activeSetting === "theme" ? (
        <Card className="neo-surface">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5 text-primary" />
              Theme Color
            </CardTitle>
            <CardDescription>
              This color drives primary buttons, accent highlights, badges, and subtle background gradients.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {THEME_PRESETS.map((preset) => {
                const selected = preset.value.toLowerCase() === themeColor.toLowerCase();
                return (
                  <button
                    type="button"
                    key={preset.value}
                    onClick={() => previewTheme(preset.value)}
                    className="neo-surface neo-pressable flex items-center justify-between rounded-xl px-3 py-2 text-left"
                    aria-label={`Select ${preset.label}`}
                  >
                    <span className="inline-flex items-center gap-2 text-sm">
                      <span
                        className="h-4 w-4 rounded-full border border-black/10"
                        style={{ backgroundColor: preset.value }}
                      />
                      {preset.label}
                    </span>
                    {selected ? <Check className="h-4 w-4 text-primary" /> : null}
                  </button>
                );
              })}
            </div>

            <div className="space-y-2">
              <Label htmlFor="theme-color">Custom color</Label>
              <div className="flex flex-wrap items-center gap-3">
                <Input
                  id="theme-color"
                  type="color"
                  value={themeColor}
                  onChange={(e) => previewTheme(e.target.value)}
                  className="h-10 w-16 p-1"
                  aria-label="Select custom theme color"
                />
                <Input
                  value={hexDraft}
                  onChange={(e) => setHexDraft(e.target.value)}
                  onBlur={applyDraftIfValid}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      applyDraftIfValid();
                    }
                  }}
                  className="w-36 font-mono uppercase"
                  aria-label="Theme color hex value"
                />
              </div>
            </div>

            <div className="neo-surface space-y-2 rounded-xl p-4">
              <p className="text-sm font-medium">Preview contrast</p>
              <div className="flex flex-wrap items-center gap-2">
                <Button style={{ backgroundColor: palette.primary, color: palette.primaryForeground }}>
                  Enable AutoPay
                </Button>
                <span className="text-sm text-muted-foreground">
                  Text color auto-adjusts for readability against your selected primary color.
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={persistTheme}>Save theme</Button>
              <Button variant="outline" onClick={resetTheme}>Reset default</Button>
            </div>

            {savedMessage ? (
              <p className="rounded-lg border border-border bg-muted/45 px-3 py-2 text-sm">{savedMessage}</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {!isTenantView && activeSetting === "portfolio" ? (
        <Card className="neo-surface">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-primary" />
              Portfolio Management
            </CardTitle>
            <CardDescription>
              Create portfolios and assign properties. Use portfolios to filter reports and lists across the app.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-2">
                <Label htmlFor="new-portfolio-name">New portfolio</Label>
                <Input
                  id="new-portfolio-name"
                  placeholder="Portfolio name"
                  value={newPortfolioName}
                  onChange={(e) => setNewPortfolioName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createPortfolio()}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-portfolio-desc" className="text-muted-foreground">Description (optional)</Label>
                <Input
                  id="new-portfolio-desc"
                  placeholder="Optional description"
                  value={newPortfolioDesc}
                  onChange={(e) => setNewPortfolioDesc(e.target.value)}
                />
              </div>
              <Button onClick={createPortfolio} disabled={!newPortfolioName.trim()}>
                <Plus className="mr-2 h-4 w-4" /> Add Portfolio
              </Button>
            </div>

            {portfolioLoading ? (
              <p className="text-sm text-muted-foreground">Loading portfolios…</p>
            ) : portfolios.length === 0 ? (
              <p className="text-sm text-muted-foreground">No portfolios yet. Create one above.</p>
            ) : (
              <div className="space-y-2">
                {portfolios.map((p) => {
                  const isExpanded = expandedPortfolioId === p.id;
                  const isEditing = editingPortfolioId === p.id;
                  return (
                    <div
                      key={p.id}
                      className="rounded-xl border border-border bg-card"
                    >
                      <div className="flex items-center gap-2 p-3">
                        <button
                          type="button"
                          onClick={() => setExpandedPortfolioId(isExpanded ? null : p.id)}
                          className="p-0.5 hover:bg-accent rounded"
                          aria-label={isExpanded ? "Collapse" : "Expand"}
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </button>
                        {isEditing ? (
                          <div className="flex flex-1 items-center gap-2">
                            <Input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="flex-1"
                              autoFocus
                            />
                            <Button
                              size="sm"
                              onClick={() => updatePortfolio(p.id, { name: editName.trim() })}
                              disabled={!editName.trim()}
                            >
                              Save
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => { setEditingPortfolioId(null); setEditName(""); }}>
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <>
                            <span className="font-medium">{p.name}</span>
                            <Badge variant="secondary" className="text-xs">{p.propertyCount} properties</Badge>
                            <div className="flex-1" />
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => { setEditingPortfolioId(p.id); setEditName(p.name); }}
                            >
                              Rename
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => deletePortfolio(p.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                      {isExpanded && !isEditing && (
                        <div className="border-t border-border p-3 space-y-2">
                          <p className="text-xs text-muted-foreground">Assign properties to this portfolio:</p>
                          <div className="flex flex-wrap gap-2">
                            {properties.map((prop) => {
                              const checked = p.propertyIds.includes(prop.id);
                              return (
                                <label
                                  key={prop.id}
                                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm cursor-pointer hover:bg-accent/50"
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => togglePropertyInPortfolio(p.id, prop.id, p.propertyIds)}
                                  />
                                  {prop.name}
                                </label>
                              );
                            })}
                            {properties.length === 0 && (
                              <p className="text-xs text-muted-foreground">No properties available.</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {!isTenantView && activeSetting === "assetCategories" ? (
        <Card className="neo-surface">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tags className="h-5 w-5 text-primary" />
              Asset Categories
            </CardTitle>
            <CardDescription>
              Categories from this list are used when creating or editing assets.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-2">
                <Label htmlFor="new-category-name">New category</Label>
                <Input
                  id="new-category-name"
                  placeholder="Roof, HVAC, Flooring, Paint..."
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createAssetCategory()}
                />
              </div>
              <Button onClick={createAssetCategory} disabled={!newCategoryName.trim()}>
                <Plus className="mr-2 h-4 w-4" /> Add Category
              </Button>
            </div>

            {assetCategories.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No categories yet. Add one to use it in Asset Management.
              </p>
            ) : (
              <div className="space-y-2">
                {assetCategories.map((category) => {
                  const isEditing = editingCategoryId === category.id;
                  return (
                    <div key={category.id} className="rounded-xl border border-border bg-card p-3">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={editCategoryName}
                            onChange={(e) => setEditCategoryName(e.target.value)}
                            className="flex-1"
                            autoFocus
                          />
                          <Button
                            size="sm"
                            onClick={() => renameAssetCategory(category.id)}
                            disabled={!editCategoryName.trim()}
                          >
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingCategoryId(null);
                              setEditCategoryName("");
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{category.name}</span>
                          <div className="flex-1" />
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingCategoryId(category.id);
                              setEditCategoryName(category.name);
                            }}
                          >
                            Rename
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => deleteAssetCategory(category.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {!isTenantView && activeSetting === "contactInfo" ? (
        <Card className="neo-surface">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-primary" />
              Contact Info
            </CardTitle>
            <CardDescription>
              Update your business contact information used across the app.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="contact-mailing-address">Mailing address</Label>
              <Input
                id="contact-mailing-address"
                placeholder="123 Main St, City, State ZIP"
                value={contactInfo.mailingAddress}
                onChange={(e) => setContactInfo((prev) => ({ ...prev, mailingAddress: e.target.value }))}
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="contact-email">Email address</Label>
                <Input
                  id="contact-email"
                  type="email"
                  placeholder="you@company.com"
                  value={contactInfo.emailAddress}
                  onChange={(e) => setContactInfo((prev) => ({ ...prev, emailAddress: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-phone">Phone number</Label>
                <Input
                  id="contact-phone"
                  placeholder="(555) 123-4567"
                  value={contactInfo.phoneNumber}
                  onChange={(e) => setContactInfo((prev) => ({ ...prev, phoneNumber: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-emergency">Emergency number</Label>
              <Input
                id="contact-emergency"
                placeholder="24/7 emergency line"
                value={contactInfo.emergencyNumber}
                onChange={(e) => setContactInfo((prev) => ({ ...prev, emergencyNumber: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={saveContactInfo} disabled={contactSaving}>
                {contactSaving ? "Saving..." : "Save Contact Info"}
              </Button>
              {contactSaveMessage ? <p className="text-sm text-muted-foreground">{contactSaveMessage}</p> : null}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
