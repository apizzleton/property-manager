import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDevActor } from "@/lib/devActor";

type SearchItemType = "property" | "tenant" | "unit" | "lease" | "work_order";

interface SearchResultItem {
  id: string;
  type: SearchItemType;
  title: string;
  subtitle: string;
  href: string;
}

function toAddressLine(address: { street: string; city: string; state: string; zip: string }) {
  return `${address.street}, ${address.city}, ${address.state} ${address.zip}`;
}

/**
 * GET /api/search?q=<text>&limit=<n>
 * Returns grouped global-search results scoped to the current dev actor.
 */
export async function GET(request: NextRequest) {
  const actor = await getDevActor(request);
  if (!actor) {
    return NextResponse.json({ error: "No development user found. Run the seed script." }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const limitRaw = Number.parseInt(searchParams.get("limit") ?? "10", 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 20) : 10;

  if (q.length < 2) {
    return NextResponse.json({ results: [] as SearchResultItem[] });
  }

  const queryMode = { contains: q, mode: "insensitive" as const };

  let tenantPropertyIds: string[] = [];
  let tenantUnitIds: string[] = [];
  let tenantLeaseIds: string[] = [];

  // Tenant role must only search entities tied to the tenant's active leases.
  if (actor.effectiveRole === "tenant") {
    if (!actor.tenantId) {
      return NextResponse.json({ results: [] as SearchResultItem[] });
    }

    const scopedLeases = await prisma.lease.findMany({
      where: { tenantId: actor.tenantId, status: "active" },
      select: {
        id: true,
        unitId: true,
        unit: {
          select: {
            address: {
              select: { propertyId: true },
            },
          },
        },
      },
    });

    tenantLeaseIds = scopedLeases.map((lease) => lease.id);
    tenantUnitIds = scopedLeases.map((lease) => lease.unitId);
    tenantPropertyIds = [...new Set(scopedLeases.map((lease) => lease.unit.address.propertyId))];
  }

  const [
    properties,
    tenants,
    units,
    leases,
    workOrders,
  ] = await Promise.all([
    prisma.property.findMany({
      where: actor.effectiveRole === "property_manager"
        ? {
            userId: actor.user.id,
            OR: [
              { name: queryMode },
              { type: queryMode },
              { notes: queryMode },
              {
                addresses: {
                  some: {
                    OR: [
                      { street: queryMode },
                      { city: queryMode },
                      { state: queryMode },
                      { zip: queryMode },
                    ],
                  },
                },
              },
            ],
          }
        : {
            id: { in: tenantPropertyIds },
            OR: [
              { name: queryMode },
              { type: queryMode },
              {
                addresses: {
                  some: {
                    OR: [
                      { street: queryMode },
                      { city: queryMode },
                      { state: queryMode },
                      { zip: queryMode },
                    ],
                  },
                },
              },
            ],
          },
      include: {
        addresses: {
          take: 1,
          select: { street: true, city: true, state: true, zip: true },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
    }),
    prisma.tenant.findMany({
      where: actor.effectiveRole === "property_manager"
        ? {
            leases: {
              some: {
                unit: { address: { property: { userId: actor.user.id } } },
              },
            },
            OR: [
              { firstName: queryMode },
              { lastName: queryMode },
              { email: queryMode },
              { phone: queryMode },
            ],
          }
        : actor.tenantId
          ? {
              id: actor.tenantId,
              OR: [
                { firstName: queryMode },
                { lastName: queryMode },
                { email: queryMode },
                { phone: queryMode },
              ],
            }
          : { id: "__none__" },
      include: {
        leases: {
          where: { status: "active" },
          include: {
            unit: {
              include: {
                address: {
                  include: {
                    property: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
          orderBy: { startDate: "desc" },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
    }),
    prisma.unit.findMany({
      where: actor.effectiveRole === "property_manager"
        ? {
            address: { property: { userId: actor.user.id } },
            OR: [
              { unitNumber: queryMode },
              { address: { street: queryMode } },
              { address: { city: queryMode } },
              { address: { state: queryMode } },
              { address: { property: { name: queryMode } } },
            ],
          }
        : {
            id: { in: tenantUnitIds },
            OR: [
              { unitNumber: queryMode },
              { address: { street: queryMode } },
              { address: { city: queryMode } },
              { address: { state: queryMode } },
              { address: { property: { name: queryMode } } },
            ],
          },
      include: {
        address: {
          include: {
            property: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
    }),
    prisma.lease.findMany({
      where: actor.effectiveRole === "property_manager"
        ? {
            unit: { address: { property: { userId: actor.user.id } } },
            OR: [
              { status: queryMode },
              { notes: queryMode },
              { tenant: { firstName: queryMode } },
              { tenant: { lastName: queryMode } },
              { unit: { unitNumber: queryMode } },
              { unit: { address: { property: { name: queryMode } } } },
            ],
          }
        : {
            id: { in: tenantLeaseIds },
            OR: [
              { status: queryMode },
              { notes: queryMode },
              { tenant: { firstName: queryMode } },
              { tenant: { lastName: queryMode } },
              { unit: { unitNumber: queryMode } },
              { unit: { address: { property: { name: queryMode } } } },
            ],
          },
      include: {
        tenant: { select: { firstName: true, lastName: true } },
        unit: {
          select: {
            unitNumber: true,
            address: {
              select: {
                property: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
    }),
    prisma.workOrder.findMany({
      where: actor.effectiveRole === "property_manager"
        ? {
            unit: { address: { property: { userId: actor.user.id } } },
            OR: [
              { title: queryMode },
              { description: queryMode },
              { status: queryMode },
              { priority: queryMode },
              { unit: { unitNumber: queryMode } },
              { unit: { address: { property: { name: queryMode } } } },
            ],
          }
        : {
            OR: [
              { tenantId: actor.tenantId ?? "__none__" },
              { unitId: { in: tenantUnitIds } },
            ],
            AND: [
              {
                OR: [
                  { title: queryMode },
                  { description: queryMode },
                  { status: queryMode },
                  { priority: queryMode },
                  { unit: { unitNumber: queryMode } },
                  { unit: { address: { property: { name: queryMode } } } },
                ],
              },
            ],
          },
      include: {
        unit: {
          select: {
            unitNumber: true,
            address: {
              select: {
                property: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
    }),
  ]);

  const results: SearchResultItem[] = [];

  for (const property of properties) {
    const address = property.addresses[0];
    results.push({
      id: property.id,
      type: "property",
      title: property.name,
      subtitle: address ? `Property · ${toAddressLine(address)}` : "Property",
      href: `/properties/${property.id}`,
    });
  }

  for (const tenant of tenants) {
    const activeLease = tenant.leases[0];
    const leaseSubtitle = activeLease
      ? `${activeLease.unit.address.property.name} · Unit ${activeLease.unit.unitNumber}`
      : "Tenant";
    results.push({
      id: tenant.id,
      type: "tenant",
      title: `${tenant.firstName} ${tenant.lastName}`,
      subtitle: `Tenant · ${leaseSubtitle}`,
      href: `/tenants/${tenant.id}`,
    });
  }

  for (const unit of units) {
    results.push({
      id: unit.id,
      type: "unit",
      title: `Unit ${unit.unitNumber}`,
      subtitle: `Unit · ${unit.address.property.name} · ${toAddressLine(unit.address)}`,
      href: `/units/${unit.id}`,
    });
  }

  for (const lease of leases) {
    results.push({
      id: lease.id,
      type: "lease",
      title: `${lease.tenant.firstName} ${lease.tenant.lastName}`,
      subtitle: `Lease · ${lease.unit.address.property.name} · Unit ${lease.unit.unitNumber}`,
      href: `/leases/${lease.id}`,
    });
  }

  for (const workOrder of workOrders) {
    results.push({
      id: workOrder.id,
      type: "work_order",
      title: workOrder.title,
      subtitle: `Work Order · ${workOrder.unit.address.property.name} · Unit ${workOrder.unit.unitNumber}`,
      href: "/maintenance",
    });
  }

  return NextResponse.json({ results: results.slice(0, limit) });
}
