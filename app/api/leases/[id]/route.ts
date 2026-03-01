import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/leases/:id — fetch a single lease with tenant and unit details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const lease = await prisma.lease.findUnique({
      where: { id },
      include: {
        tenant: true,
        unit: {
          include: {
            address: { include: { property: true } },
          },
        },
      },
    });

    if (!lease) {
      return NextResponse.json({ error: "Lease not found" }, { status: 404 });
    }

    return NextResponse.json(lease);
  } catch (error) {
    console.error("Error fetching lease:", error);
    return NextResponse.json({ error: "Failed to fetch lease" }, { status: 500 });
  }
}

/**
 * PUT /api/leases/:id — update a lease (change status, edit terms)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const lease = await prisma.lease.update({
      where: { id },
      data: {
        ...(body.status && { status: body.status }),
        ...(body.monthlyRent && { monthlyRent: parseFloat(body.monthlyRent) }),
        ...(body.deposit !== undefined && { deposit: parseFloat(body.deposit) }),
        ...(body.startDate && { startDate: new Date(body.startDate) }),
        endDate: body.endDate !== undefined ? (body.endDate ? new Date(body.endDate) : null) : undefined,
        notes: body.notes !== undefined ? (body.notes || null) : undefined,
      },
      include: {
        tenant: true,
        unit: {
          include: { address: { include: { property: true } } },
        },
      },
    });

    return NextResponse.json(lease);
  } catch (error) {
    console.error("Error updating lease:", error);
    return NextResponse.json({ error: "Failed to update lease" }, { status: 500 });
  }
}

/**
 * DELETE /api/leases/:id — delete a lease
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.lease.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting lease:", error);
    return NextResponse.json({ error: "Failed to delete lease" }, { status: 500 });
  }
}
