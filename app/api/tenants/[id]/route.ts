import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/tenants/:id — get a single tenant with full details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: {
      leases: {
        include: {
          unit: {
            include: {
              address: { include: { property: true } },
            },
          },
        },
        orderBy: { startDate: "desc" },
      },
    },
  });

  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }
  return NextResponse.json(tenant);
}

/**
 * PUT /api/tenants/:id — update a tenant
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const tenant = await prisma.tenant.update({
      where: { id },
      data: {
        ...(body.firstName && { firstName: body.firstName }),
        ...(body.lastName && { lastName: body.lastName }),
        email: body.email !== undefined ? (body.email || null) : undefined,
        phone: body.phone !== undefined ? (body.phone || null) : undefined,
        emergencyContact: body.emergencyContact !== undefined ? (body.emergencyContact || null) : undefined,
        emergencyPhone: body.emergencyPhone !== undefined ? (body.emergencyPhone || null) : undefined,
        notes: body.notes !== undefined ? (body.notes || null) : undefined,
      },
    });

    return NextResponse.json(tenant);
  } catch (error) {
    console.error("Error updating tenant:", error);
    return NextResponse.json({ error: "Failed to update tenant" }, { status: 500 });
  }
}

/**
 * DELETE /api/tenants/:id — delete a tenant
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.tenant.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting tenant:", error);
    return NextResponse.json({ error: "Failed to delete tenant" }, { status: 500 });
  }
}
