import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDevActor } from "@/lib/devActor";
import { resolvePropertyIdsForFilter } from "@/lib/portfolioScope";

/**
 * GET /api/tenants — list all tenants with their active leases
 * Query params (for PM messaging):
 *   - propertyId: filter tenants with active leases at this property
 *   - portfolioId: filter tenants with active leases at properties in this portfolio
 *   - addressId: filter tenants with active leases at this address (takes precedence if both provided)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const propertyId = searchParams.get("propertyId");
  const portfolioId = searchParams.get("portfolioId");
  const addressId = searchParams.get("addressId");

  let effectivePropertyIds: string[] | null = propertyId ? [propertyId] : null;
  if (portfolioId && !addressId) {
    const actor = await getDevActor(request);
    if (!actor) {
      return NextResponse.json({ error: "No development user found. Run the seed script." }, { status: 400 });
    }
    effectivePropertyIds = await resolvePropertyIdsForFilter(actor.user.id, portfolioId, propertyId);
  }

  // Build lease filter for property/address scoping (for PM recipient selection)
  const leaseFilter =
    addressId
      ? { status: "active" as const, unit: { addressId } }
      : effectivePropertyIds !== null
        ? effectivePropertyIds.length === 0
          ? { status: "active" as const, unit: { address: { propertyId: { in: [] } } } }
          : { status: "active" as const, unit: { address: { propertyId: { in: effectivePropertyIds } } } }
        : undefined;

  const tenants = await prisma.tenant.findMany({
    where: leaseFilter ? { leases: { some: leaseFilter } } : undefined,
    include: {
      user: { select: { id: true, name: true, email: true } },
      leases: {
        where: { status: "active" },
        include: {
          unit: {
            include: {
              address: {
                include: { property: true },
              },
            },
          },
        },
        orderBy: { startDate: "desc" },
      },
    },
    orderBy: { lastName: "asc" },
  });
  return NextResponse.json(tenants);
}

/**
 * POST /api/tenants — create a new tenant
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { firstName, lastName, email, phone, emergencyContact, emergencyPhone, notes } = body;

    if (!firstName || !lastName) {
      return NextResponse.json({ error: "First and last name are required" }, { status: 400 });
    }

    const tenant = await prisma.tenant.create({
      data: {
        firstName,
        lastName,
        email: email || null,
        phone: phone || null,
        emergencyContact: emergencyContact || null,
        emergencyPhone: emergencyPhone || null,
        notes: notes || null,
      },
    });

    return NextResponse.json(tenant, { status: 201 });
  } catch (error) {
    console.error("Error creating tenant:", error);
    return NextResponse.json({ error: "Failed to create tenant" }, { status: 500 });
  }
}
