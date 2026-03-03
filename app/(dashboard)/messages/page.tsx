"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  MessageSquare, Plus, Send, Mail, Trash2, Building2, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { formatDate, formatMessageTime } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/branding/brand-logo";

/* ============================================================================
   Messages Page — One running conversation per counterpart
   Clean chat-style UI with clear sender/receiver on each message
   ============================================================================ */

interface MessageUser {
  id: string;
  name: string;
  email?: string;
}

interface FlatMessage {
  id: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  sender: MessageUser;
  receiver: MessageUser;
  property: { id: string; name: string } | null;
}

interface Property {
  id: string;
  name: string;
}

interface Address {
  id: string;
  street: string;
  city: string;
  state: string;
  zip: string;
}

interface PropertyWithAddresses extends Property {
  addresses: Address[];
}

interface TenantOption {
  id: string;
  firstName: string;
  lastName: string;
  user: { id: string; name: string; email: string | null } | null;
}

type RecipientMode = "all_property" | "all_address" | "individual";

export default function MessagesPage() {
  const [messages, setMessages] = useState<FlatMessage[]>([]);
  const [properties, setProperties] = useState<PropertyWithAddresses[]>([]);
  const [loading, setLoading] = useState(true);
  const [effectiveRole, setEffectiveRole] = useState<"property_manager" | "tenant">("property_manager");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Selected conversation partner (the "other" person)
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);

  const [portfolios, setPortfolios] = useState<{ id: string; name: string; propertyIds: string[] }[]>([]);

  // Compose dialog (new message)
  const [showCompose, setShowCompose] = useState(false);
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composePortfolioId, setComposePortfolioId] = useState("");
  const [composePropertyId, setComposePropertyId] = useState("");
  const [composeAddressId, setComposeAddressId] = useState("");
  const [composeRecipientMode, setComposeRecipientMode] = useState<RecipientMode>("all_property");
  const [composeSelectedTenantIds, setComposeSelectedTenantIds] = useState<string[]>([]);
  const [tenantsForRecipients, setTenantsForRecipients] = useState<TenantOption[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(false);

  // Reply input (when viewing a conversation)
  const [replyBody, setReplyBody] = useState("");

  const fetchMessages = useCallback(async () => {
    try {
      const { fetchPortfolios } = await import("@/lib/fetchPortfolios");
      const [msgRes, propRes, ports, actorRes] = await Promise.all([
        fetch("/api/messages"),
        fetch("/api/properties"),
        fetchPortfolios(),
        fetch("/api/actor"),
      ]);
      const msgData = msgRes.ok ? await msgRes.json() : [];
      const propData = propRes.ok ? await propRes.json() : [];
      setMessages(Array.isArray(msgData) ? msgData : []);
      setProperties(Array.isArray(propData) ? propData : []);
      setPortfolios(ports);
      const actorData = await actorRes.json().catch(() => ({}));
      if (actorData.effectiveRole) setEffectiveRole(actorData.effectiveRole);
      if (actorData.user?.id) setCurrentUserId(actorData.user.id);
    } catch (err) {
      console.error("Failed to fetch messages:", err);
      setMessages([]);
      setProperties([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  const composePropertyOptions = composePortfolioId
    ? properties.filter((p) => {
        const port = portfolios.find((pf) => pf.id === composePortfolioId);
        return port && port.propertyIds.includes(p.id);
      })
    : properties;

  useEffect(() => {
    if (effectiveRole !== "property_manager" || !showCompose) return;
    if (!composePropertyId) {
      setTenantsForRecipients([]);
      setComposeAddressId("");
      return;
    }
    setLoadingTenants(true);
    const params = new URLSearchParams();
    if (composePortfolioId) params.set("portfolioId", composePortfolioId);
    if (composeAddressId) params.set("addressId", composeAddressId);
    else params.set("propertyId", composePropertyId);
    fetch(`/api/tenants?${params}`)
      .then((r) => r.json())
      .then((data: TenantOption[]) => {
        setTenantsForRecipients(data);
        setLoadingTenants(false);
      })
      .catch(() => setLoadingTenants(false));
  }, [effectiveRole, showCompose, composePortfolioId, composePropertyId, composeAddressId]);

  useEffect(() => {
    if (!composePropertyId) setComposeAddressId("");
  }, [composePropertyId]);
  useEffect(() => {
    if (composePortfolioId) setComposePropertyId("");
  }, [composePortfolioId]);
  useEffect(() => {
    if (!composeAddressId && composeRecipientMode === "all_address") setComposeRecipientMode("all_property");
  }, [composeAddressId, composeRecipientMode]);

  const selectedProperty = properties.find((p) => p.id === composePropertyId);
  const addressesForProperty = selectedProperty?.addresses ?? [];

  const getReceiverIds = (): string[] => {
    const withUser = tenantsForRecipients.filter((t) => t.user);
    if (composeRecipientMode === "all_property" || composeRecipientMode === "all_address") {
      return withUser.map((t) => t.user!.id);
    }
    return composeSelectedTenantIds
      .map((tid) => withUser.find((t) => t.id === tid)?.user?.id)
      .filter((id): id is string => !!id);
  };

  const sendMessage = async () => {
    const receiverIds = effectiveRole === "property_manager" ? getReceiverIds() : [];
    const payload: Record<string, unknown> = {
      subject: composeSubject,
      body: composeBody,
      propertyId: composePropertyId || null,
    };
    if (receiverIds.length > 0) payload.receiverIds = receiverIds;

    await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setShowCompose(false);
    setComposeSubject("");
    setComposeBody("");
    setComposePortfolioId("");
    setComposePropertyId("");
    setComposeAddressId("");
    setComposeRecipientMode("all_property");
    setComposeSelectedTenantIds([]);
    fetchMessages();
  };

  const sendReply = async () => {
    if (!replyBody.trim() || !selectedPartnerId) return;
    await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: replyBody, receiverId: selectedPartnerId }),
    });
    setReplyBody("");
    fetchMessages();
  };

  // Group messages by conversation partner (the "other" person)
  const { partners, messagesByPartner } = useMemo(() => {
    if (!currentUserId) return { partners: [], messagesByPartner: {} as Record<string, FlatMessage[]> };
    const byPartner: Record<string, FlatMessage[]> = {};
    const partnerIds = new Set<string>();
    for (const m of messages) {
      const other: MessageUser = m.sender.id === currentUserId ? m.receiver : m.sender;
      if (other.id === currentUserId) continue;
      partnerIds.add(other.id);
      if (!byPartner[other.id]) byPartner[other.id] = [];
      byPartner[other.id].push(m);
    }
    const partnerList = Array.from(partnerIds).map((id) => {
      const msgs = byPartner[id];
      const last = msgs[msgs.length - 1];
      return { id, name: last?.receiver.id === id ? last.receiver.name : last?.sender.name ?? "Unknown", lastAt: last?.createdAt ?? "" };
    });
    partnerList.sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
    return { partners: partnerList, messagesByPartner: byPartner };
  }, [messages, currentUserId]);

  const markConversationAsRead = useCallback(
    async (partnerId: string) => {
      if (!currentUserId) return;
      const toMark = (messagesByPartner[partnerId] ?? []).filter(
        (m) => !m.isRead && m.receiver.id === currentUserId
      );
      if (toMark.length === 0) return;
      await fetch("/api/messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageIds: toMark.map((m) => m.id) }),
      });
      fetchMessages();
    },
    [messagesByPartner, currentUserId, fetchMessages]
  );

  const deleteMessage = async (id: string) => {
    if (!confirm("Delete this message?")) return;
    await fetch(`/api/messages/${id}`, { method: "DELETE" });
    fetchMessages();
  };

  const canSendAsPm =
    effectiveRole === "property_manager" &&
    composePropertyId &&
    tenantsForRecipients.some((t) => t.user) &&
    (composeRecipientMode === "all_property" ||
      (composeRecipientMode === "all_address" && !!composeAddressId) ||
      (composeRecipientMode === "individual" && composeSelectedTenantIds.length > 0));
  const canSend = effectiveRole === "tenant" ? !!composeBody.trim() : canSendAsPm && !!composeBody.trim();

  const selectedPartner = partners.find((p) => p.id === selectedPartnerId);
  const conversationMessages = (selectedPartnerId ? messagesByPartner[selectedPartnerId] : []) ?? [];

  const unreadCount = currentUserId
    ? messages.filter((m) => !m.isRead && m.receiver.id === currentUserId).length
    : 0;

  if (loading) return (
    <div className="flex flex-col items-center justify-center gap-4 py-20">
      <BrandLogo variant="icon" size="lg" className="animate-pulse" />
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        Loading messages...
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Messages</h1>
          <p className="text-muted-foreground">
            {effectiveRole === "property_manager" ? "Conversations with tenants." : "Messages with your property manager."}
            {unreadCount > 0 && <Badge variant="destructive" className="ml-2">{unreadCount} unread</Badge>}
          </p>
        </div>
        <Button onClick={() => setShowCompose(true)}>
          <Plus className="mr-2 h-4 w-4" /> New Message
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: conversation partners */}
        <div className="space-y-2 lg:col-span-1">
          {partners.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center py-12">
                <MessageSquare className="mb-3 h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No conversations yet.</p>
                <p className="mt-1 text-xs text-muted-foreground">Send a new message to get started.</p>
              </CardContent>
            </Card>
          ) : (
            partners.map((p) => {
              const unread = (messagesByPartner[p.id] ?? []).filter((m) => !m.isRead && m.receiver.id === currentUserId).length;
              return (
                <Card
                  key={p.id}
                  className={cn(
                    "cursor-pointer transition-colors hover:bg-accent/50",
                    selectedPartnerId === p.id && "ring-2 ring-primary",
                    unread > 0 && "border-primary/50"
                  )}
                  onClick={() => {
                    setSelectedPartnerId(p.id);
                    markConversationAsRead(p.id);
                  }}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{p.name}</span>
                      {unread > 0 && <Badge variant="destructive" className="text-[10px]">{unread}</Badge>}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{p.lastAt ? formatDate(p.lastAt) : "—"}</p>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        {/* Right: one running conversation */}
        <div className="lg:col-span-2">
          {selectedPartnerId ? (
            <Card className="flex flex-col h-[calc(100vh-14rem)] min-h-[400px]">
              {/* Conversation header */}
              <div className="flex items-center justify-between border-b px-4 py-3">
                <div>
                  <h2 className="font-semibold">{selectedPartner?.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    {effectiveRole === "property_manager" ? "Tenant" : "Property Manager"}
                  </p>
                </div>
              </div>

              {/* Message list — one running conversation */}
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  {conversationMessages.map((msg) => {
                    const isFromMe = msg.sender.id === currentUserId;
                    return (
                      <div
                        key={msg.id}
                        className={cn(
                          "flex flex-col max-w-[85%]",
                          isFromMe ? "ml-auto items-end" : "mr-auto items-start"
                        )}
                      >
                        <div
                          className={cn(
                            "rounded-lg px-4 py-2.5",
                            isFromMe
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted"
                          )}
                        >
                          <div className="flex items-center gap-2 text-xs opacity-90 mb-1">
                            <span className="font-medium">{msg.sender.name}</span>
                            <span>→</span>
                            <span>{msg.receiver.name}</span>
                          </div>
                          <p className="text-sm">{msg.body}</p>
                          <div className="mt-1 flex items-center justify-between gap-2">
                            <span className="text-[10px] opacity-80">{formatMessageTime(msg.createdAt)}</span>
                            {msg.property && (
                              <span className="flex items-center gap-0.5 text-[10px] opacity-80">
                                <Building2 className="h-2.5 w-2.5" /> {msg.property.name}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          {!msg.isRead && msg.receiver.id === currentUserId && (
                            <Mail className="h-3 w-3 text-primary" />
                          )}
                          <button
                            type="button"
                            onClick={() => deleteMessage(msg.id)}
                            className="text-[10px] text-muted-foreground hover:text-destructive"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>

              {/* Reply input */}
              <div className="border-t p-4">
                <div className="flex gap-2">
                  <Textarea
                    placeholder={`Reply to ${selectedPartner?.name}...`}
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    className="flex-1 min-h-[80px]"
                  />
                  <Button onClick={sendReply} disabled={!replyBody.trim()}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-20">
                <MessageSquare className="mb-3 h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Select a conversation</p>
                <p className="text-xs text-muted-foreground mt-1">or send a new message</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Compose Dialog */}
      <Dialog open={showCompose} onOpenChange={setShowCompose}>
        <DialogContent className="max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>New Message</DialogTitle>
            <DialogDescription>
              {effectiveRole === "property_manager"
                ? "Select a property and recipients, then compose your message."
                : "Send a message to your property manager."}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 max-h-[60vh] pr-4">
            <div className="space-y-4">
              {effectiveRole === "property_manager" && (
                <div className="space-y-2">
                  <Label>Subject</Label>
                  <Input placeholder="Message subject" value={composeSubject} onChange={(e) => setComposeSubject(e.target.value)} />
                </div>
              )}

              {effectiveRole === "property_manager" && (
                <>
                  <div className="space-y-2">
                    <Label>Portfolio (optional)</Label>
                    <Select value={composePortfolioId} onChange={(e) => setComposePortfolioId(e.target.value)}>
                      <option value="">All portfolios</option>
                      {portfolios.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Property</Label>
                    <Select value={composePropertyId} onChange={(e) => setComposePropertyId(e.target.value)}>
                      <option value="">Select a property</option>
                      {composePropertyOptions.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </Select>
                  </div>

                  {composePropertyId && (
                    <>
                      <div className="space-y-2">
                        <Label>Address (optional)</Label>
                        <Select value={composeAddressId} onChange={(e) => setComposeAddressId(e.target.value)}>
                          <option value="">All addresses at property</option>
                          {addressesForProperty.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.street}, {a.city}, {a.state} {a.zip}
                            </option>
                          ))}
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Recipients</Label>
                        {loadingTenants ? (
                          <p className="text-sm text-muted-foreground">Loading tenants...</p>
                        ) : tenantsForRecipients.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No tenants with accounts at this location.</p>
                        ) : (
                          <div className="space-y-2 rounded-lg border p-3">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="recipientMode"
                                checked={composeRecipientMode === "all_property"}
                                onChange={() => setComposeRecipientMode("all_property")}
                                className="rounded-full"
                              />
                              <span className="text-sm">All tenants at property</span>
                              <Users className="h-4 w-4 text-muted-foreground" />
                            </label>
                            {addressesForProperty.length > 0 && (
                              <label
                                className={cn("flex items-center gap-2 cursor-pointer", !composeAddressId && "opacity-60")}
                                title={!composeAddressId ? "Select an address above first" : undefined}
                              >
                                <input
                                  type="radio"
                                  name="recipientMode"
                                  checked={composeRecipientMode === "all_address"}
                                  onChange={() => composeAddressId && setComposeRecipientMode("all_address")}
                                  disabled={!composeAddressId}
                                  className="rounded-full"
                                />
                                <span className="text-sm">All tenants at selected address</span>
                              </label>
                            )}
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                name="recipientMode"
                                checked={composeRecipientMode === "individual"}
                                onChange={() => setComposeRecipientMode("individual")}
                                className="rounded-full"
                              />
                              <span className="text-sm">Select individual tenants</span>
                            </label>

                            {composeRecipientMode === "individual" && (
                              <div className="mt-2 ml-4 space-y-1.5 max-h-32 overflow-y-auto">
                                {tenantsForRecipients.map((t) => (
                                  <label
                                    key={t.id}
                                    className={cn("flex items-center gap-2 cursor-pointer text-sm", !t.user && "opacity-50")}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={composeSelectedTenantIds.includes(t.id)}
                                      onChange={(e) => {
                                        if (!t.user) return;
                                        setComposeSelectedTenantIds((prev) =>
                                          e.target.checked ? [...prev, t.id] : prev.filter((id) => id !== t.id)
                                        );
                                      }}
                                      disabled={!t.user}
                                    />
                                    <span>{t.firstName} {t.lastName}</span>
                                    {!t.user && <span className="text-xs text-muted-foreground">(no account)</span>}
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}

              <div className="space-y-2">
                <Label>Message</Label>
                <Textarea placeholder="Type your message..." value={composeBody} onChange={(e) => setComposeBody(e.target.value)} rows={5} />
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCompose(false)}>Cancel</Button>
            <Button onClick={sendMessage} disabled={!canSend}>
              <Send className="mr-2 h-4 w-4" /> Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
