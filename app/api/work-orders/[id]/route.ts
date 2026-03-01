import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * PUT /api/work-orders/:id — update a work order (status, vendor, cost, etc.)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const data: Record<string, unknown> = {};
    if (body.status) data.status = body.status;
    if (body.vendorId !== undefined) data.vendorId = body.vendorId || null;
    if (body.priority) data.priority = body.priority;
    if (body.title) data.title = body.title;
    if (body.description !== undefined) data.description = body.description || null;
    if (body.cost !== undefined) data.cost = body.cost ? parseFloat(body.cost) : null;
    // Auto-set completedAt when status changes to completed
    if (body.status === "completed") data.completedAt = new Date();
    if (body.status === "open" || body.status === "in_progress") data.completedAt = null;

    const workOrder = await prisma.workOrder.update({
      where: { id },
      data,
      include: {
        unit: { include: { address: { include: { property: true } } } },
        tenant: true,
        vendor: true,
      },
    });

    return NextResponse.json(workOrder);
  } catch (error) {
    console.error("Error updating work order:", error);
    return NextResponse.json({ error: "Failed to update work order" }, { status: 500 });
  }
}

/**
 * DELETE /api/work-orders/:id
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.workOrder.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting work order:", error);
    return NextResponse.json({ error: "Failed to delete work order" }, { status: 500 });
  }
}
