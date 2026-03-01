import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDevActor } from "@/lib/devActor";
import { resolvePropertyIdsForFilter } from "@/lib/portfolioScope";

/**
 * GET /api/leases — list all leases
 * Query: status?, propertyId?, portfolioId?
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const propertyId = searchParams.get("propertyId");
  const portfolioId = searchParams.get("portfolioId");

  let propertyFilter: { unit?: { address: { propertyId?: string | { in: string[] } } } } = {};
  if (portfolioId) {
    const actor = await getDevActor(request);
    if (!actor) {
      return NextResponse.json({ error: "No development user found. Run the seed script." }, { status: 400 });
    }
    const ids = await resolvePropertyIdsForFilter(actor.user.id, portfolioId, propertyId);
    if (ids !== null) {
      propertyFilter = ids.length === 0
        ? { unit: { address: { propertyId: { in: [] } } } }
        : { unit: { address: { propertyId: { in: ids } } } };
    }
  } else if (propertyId) {
    propertyFilter = { unit: { address: { propertyId } } };
  }

  const where = { ...(status ? { status } : {}), ...propertyFilter };
  const leases = await prisma.lease.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
    include: {
      tenant: true,
      unit: {
        include: {
          address: { include: { property: true } },
        },
      },
    },
    orderBy: { startDate: "desc" },
  });

  return NextResponse.json(leases);
}

/**
 * POST /api/leases — create a new lease
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { unitId, tenantId, startDate, endDate, monthlyRent, deposit, notes } = body;

    if (!unitId || !tenantId || !startDate || !monthlyRent) {
      return NextResponse.json(
        { error: "unitId, tenantId, startDate, and monthlyRent are required" },
        { status: 400 }
      );
    }

    // Check if the unit already has an active lease
    const existingActive = await prisma.lease.findFirst({
      where: { unitId, status: "active" },
    });
    if (existingActive) {
      return NextResponse.json(
        { error: "This unit already has an active lease. Terminate it first." },
        { status: 400 }
      );
    }

    const lease = await prisma.lease.create({
      data: {
        unitId,
        tenantId,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        monthlyRent: parseFloat(monthlyRent),
        deposit: deposit ? parseFloat(deposit) : 0,
        status: "active",
        notes: notes || null,
      },
      include: {
        tenant: true,
        unit: {
          include: {
            address: { include: { property: true } },
          },
        },
      },
    });

    return NextResponse.json(lease, { status: 201 });
  } catch (error) {
    console.error("Error creating lease:", error);
    return NextResponse.json({ error: "Failed to create lease" }, { status: 500 });
  }
}
