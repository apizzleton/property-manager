import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDevActor } from "@/lib/devActor";

/**
 * GET /api/tenant-maintenance
 * Returns tenant-visible maintenance requests and active units.
 */
export async function GET(request: NextRequest) {
  try {
    const actor = await getDevActor(request);
    if (!actor || actor.effectiveRole !== "tenant" || !actor.tenantId) {
      return NextResponse.json({ error: "Tenant context required" }, { status: 403 });
    }

    const activeLeases = await prisma.lease.findMany({
      where: { tenantId: actor.tenantId, status: "active" },
      include: {
        unit: {
          include: {
            address: { include: { property: { select: { id: true, name: true } } } },
          },
        },
      },
      orderBy: { startDate: "desc" },
    });

    const activeUnitIds = activeLeases.map((lease) => lease.unitId);
    const requests = await prisma.workOrder.findMany({
      where: {
        OR: [
          { tenantId: actor.tenantId },
          ...(activeUnitIds.length > 0 ? [{ unitId: { in: activeUnitIds } }] : []),
        ],
      },
      include: {
        unit: {
          include: {
            address: { include: { property: { select: { id: true, name: true } } } },
          },
        },
        vendor: { select: { id: true, name: true } },
        activities: {
          where: { tenantVisible: true },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const units = activeLeases.map((lease) => ({
      id: lease.unit.id,
      unitNumber: lease.unit.unitNumber,
      propertyName: lease.unit.address.property.name,
      addressLine: lease.unit.address.street,
    }));

    return NextResponse.json({ requests, units });
  } catch (error) {
    console.error("Error fetching tenant maintenance requests:", error);
    return NextResponse.json({ error: "Failed to fetch maintenance requests" }, { status: 500 });
  }
}

/**
 * POST /api/tenant-maintenance
 * Body: { unitId, title, description?, priority? }
 */
export async function POST(request: NextRequest) {
  try {
    const actor = await getDevActor(request);
    if (!actor || actor.effectiveRole !== "tenant" || !actor.tenantId) {
      return NextResponse.json({ error: "Tenant context required" }, { status: 403 });
    }

    const body = await request.json();
    const unitId = typeof body.unitId === "string" ? body.unitId.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const priority = typeof body.priority === "string" ? body.priority : "medium";

    if (!unitId || !title) {
      return NextResponse.json({ error: "unitId and title are required" }, { status: 400 });
    }

    const activeLease = await prisma.lease.findFirst({
      where: { tenantId: actor.tenantId, status: "active", unitId },
      select: { id: true },
    });
    if (!activeLease) {
      return NextResponse.json({ error: "Unit is not linked to your active lease" }, { status: 400 });
    }

    const allowedPriorities = ["low", "medium", "high", "emergency"];
    const safePriority = allowedPriorities.includes(priority) ? priority : "medium";

    const created = await prisma.workOrder.create({
      data: {
        unitId,
        tenantId: actor.tenantId,
        title,
        description: description || null,
        priority: safePriority,
        status: "open",
        createdById: actor.user.id,
      },
      include: {
        unit: {
          include: {
            address: { include: { property: { select: { id: true, name: true } } } },
          },
        },
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("Error creating tenant maintenance request:", error);
    return NextResponse.json({ error: "Failed to submit maintenance request" }, { status: 500 });
  }
}
