import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * PUT /api/vendors/:id — update a vendor
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const vendor = await prisma.vendor.update({
      where: { id },
      data: {
        ...(body.name && { name: body.name }),
        email: body.email !== undefined ? (body.email || null) : undefined,
        phone: body.phone !== undefined ? (body.phone || null) : undefined,
        specialty: body.specialty !== undefined ? (body.specialty || null) : undefined,
        notes: body.notes !== undefined ? (body.notes || null) : undefined,
      },
    });

    return NextResponse.json(vendor);
  } catch (error) {
    console.error("Error updating vendor:", error);
    return NextResponse.json({ error: "Failed to update vendor" }, { status: 500 });
  }
}

/**
 * DELETE /api/vendors/:id
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.vendor.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting vendor:", error);
    return NextResponse.json({ error: "Failed to delete vendor" }, { status: 500 });
  }
}
