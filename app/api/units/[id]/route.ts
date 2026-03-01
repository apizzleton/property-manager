import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/units/:id — get a single unit with related details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const unit = await prisma.unit.findUnique({
      where: { id },
      include: {
        address: {
          include: {
            property: { select: { id: true, name: true, type: true } },
          },
        },
        leases: {
          include: {
            tenant: true,
          },
          orderBy: { startDate: "desc" },
        },
        workOrders: {
          include: { tenant: true, vendor: true },
          orderBy: { createdAt: "desc" },
        },
        documents: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!unit) {
      return NextResponse.json({ error: "Unit not found" }, { status: 404 });
    }

    // Asset support is best-effort here so unit detail still loads even if
    // a local database hasn't been synced to the new asset schema yet.
    let assets: Array<{
      id: string;
      name: string;
      category: string;
      condition: "new" | "good" | "fair" | "poor" | "needs_replacement";
      warrantyEnd: Date | null;
      events: { eventDate: Date; eventType: string; summary: string }[];
      _count: { events: number; notesLog: number };
    }> = [];
    try {
      assets = await prisma.asset.findMany({
        where: { unitId: id },
        include: {
          events: {
            orderBy: { eventDate: "desc" },
            take: 1,
            select: { eventDate: true, eventType: true, summary: true },
          },
          _count: { select: { events: true, notesLog: true } },
        },
        orderBy: { createdAt: "desc" },
      });
    } catch (assetError) {
      console.warn("Asset data unavailable for unit detail:", assetError);
    }

    return NextResponse.json({ ...unit, assets });
  } catch (error) {
    console.error("Error loading unit detail:", error);
    return NextResponse.json({ error: "Failed to load unit detail" }, { status: 500 });
  }
}

/**
 * PUT /api/units/:id — update a unit
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { unitNumber, bedrooms, bathrooms, sqft, marketRent } = body;

    const unit = await prisma.unit.update({
      where: { id },
      data: {
        ...(unitNumber && { unitNumber }),
        ...(bedrooms !== undefined && { bedrooms: parseInt(bedrooms) }),
        ...(bathrooms !== undefined && { bathrooms: parseFloat(bathrooms) }),
        sqft: sqft !== undefined ? (sqft ? parseFloat(sqft) : null) : undefined,
        marketRent: marketRent !== undefined ? (marketRent ? parseFloat(marketRent) : null) : undefined,
      },
    });

    return NextResponse.json(unit);
  } catch (error) {
    console.error("Error updating unit:", error);
    return NextResponse.json({ error: "Failed to update unit" }, { status: 500 });
  }
}

/**
 * DELETE /api/units/:id — delete a unit
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.unit.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting unit:", error);
    return NextResponse.json({ error: "Failed to delete unit" }, { status: 500 });
  }
}
