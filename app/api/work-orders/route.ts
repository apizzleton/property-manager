import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/work-orders — list all work orders
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  const workOrders = await prisma.workOrder.findMany({
    where: status ? { status } : undefined,
    include: {
      unit: { include: { address: { include: { property: true } } } },
      tenant: true,
      vendor: true,
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(workOrders);
}

/**
 * POST /api/work-orders — create a work order
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { unitId, tenantId, vendorId, title, description, priority } = body;

    if (!unitId || !title) {
      return NextResponse.json({ error: "unitId and title are required" }, { status: 400 });
    }

    const workOrder = await prisma.workOrder.create({
      data: {
        unitId,
        tenantId: tenantId || null,
        vendorId: vendorId || null,
        title,
        description: description || null,
        priority: priority || "medium",
        status: "open",
      },
      include: {
        unit: { include: { address: { include: { property: true } } } },
        tenant: true,
        vendor: true,
      },
    });

    return NextResponse.json(workOrder, { status: 201 });
  } catch (error) {
    console.error("Error creating work order:", error);
    return NextResponse.json({ error: "Failed to create work order" }, { status: 500 });
  }
}
