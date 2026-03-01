import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDevActor } from "@/lib/devActor";

/**
 * GET /api/work-orders/:id/activities
 * Returns activity timeline entries for the selected work order.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getDevActor(request);
    if (!actor || actor.effectiveRole !== "property_manager") {
      return NextResponse.json({ error: "Property manager context required" }, { status: 403 });
    }

    const { id } = await params;
    const workOrder = await prisma.workOrder.findUnique({ where: { id }, select: { id: true } });
    if (!workOrder) {
      return NextResponse.json({ error: "Work order not found" }, { status: 404 });
    }

    const activities = await prisma.workOrderActivity.findMany({
      where: { workOrderId: id },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(activities);
  } catch (error) {
    console.error("Error fetching work order activities:", error);
    return NextResponse.json({ error: "Failed to fetch work order activities" }, { status: 500 });
  }
}

/**
 * POST /api/work-orders/:id/activities
 * Body: { message, tenantVisible? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getDevActor(request);
    if (!actor || actor.effectiveRole !== "property_manager") {
      return NextResponse.json({ error: "Property manager context required" }, { status: 403 });
    }

    const { id } = await params;
    const workOrder = await prisma.workOrder.findUnique({ where: { id }, select: { id: true } });
    if (!workOrder) {
      return NextResponse.json({ error: "Work order not found" }, { status: 404 });
    }

    const body = await request.json();
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const tenantVisible = Boolean(body.tenantVisible);
    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    const created = await prisma.workOrderActivity.create({
      data: {
        workOrderId: id,
        createdById: actor.user.id,
        message,
        tenantVisible,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("Error creating work order activity:", error);
    return NextResponse.json({ error: "Failed to create work order activity" }, { status: 500 });
  }
}
