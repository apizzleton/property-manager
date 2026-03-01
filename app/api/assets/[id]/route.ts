import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDevActor } from "@/lib/devActor";

function parseOptionalDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function getOwnedAsset(assetId: string, userId: string) {
  return prisma.asset.findFirst({
    where: { id: assetId, property: { userId } },
    include: {
      property: { select: { id: true, name: true } },
      unit: { select: { id: true, unitNumber: true } },
      events: { orderBy: { eventDate: "desc" }, take: 50 },
      notesLog: { orderBy: { loggedAt: "desc" }, take: 50 },
    },
  });
}

/**
 * GET /api/assets/[id] — fetch one asset with recent event and note history
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getDevActor(request);
  if (!actor) {
    return NextResponse.json({ error: "No development user found. Run the seed script." }, { status: 400 });
  }
  if (actor.effectiveRole !== "property_manager") {
    return NextResponse.json({ error: "Only property managers can view assets" }, { status: 403 });
  }

  const { id } = await params;
  const asset = await getOwnedAsset(id, actor.user.id);
  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  return NextResponse.json(asset);
}

/**
 * PUT /api/assets/[id] — update an asset
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getDevActor(request);
    if (!actor) {
      return NextResponse.json({ error: "No development user found. Run the seed script." }, { status: 400 });
    }
    if (actor.effectiveRole !== "property_manager") {
      return NextResponse.json({ error: "Only property managers can update assets" }, { status: 403 });
    }

    const { id } = await params;
    const existing = await prisma.asset.findFirst({
      where: { id, property: { userId: actor.user.id } },
      select: { id: true, propertyId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    const body = await request.json();
    const updates: {
      name?: string;
      category?: string;
      brand?: string | null;
      model?: string | null;
      serialNumber?: string | null;
      condition?: "new" | "good" | "fair" | "poor" | "needs_replacement";
      notes?: string | null;
      installDate?: Date | null;
      warrantyEnd?: Date | null;
      propertyId?: string;
      unitId?: string | null;
    } = {};

    if (typeof body.name === "string" && body.name.trim()) updates.name = body.name.trim();
    if (typeof body.category === "string" && body.category.trim()) {
      const nextCategory = body.category.trim();
      const categoryExists = await prisma.assetCategory.findFirst({
        where: { userId: actor.user.id, name: nextCategory },
        select: { id: true },
      });
      if (!categoryExists) {
        return NextResponse.json(
          { error: "Category must be created in Settings before use" },
          { status: 400 }
        );
      }
      updates.category = nextCategory;
    }
    if (body.brand !== undefined) updates.brand = typeof body.brand === "string" ? body.brand.trim() || null : null;
    if (body.model !== undefined) updates.model = typeof body.model === "string" ? body.model.trim() || null : null;
    if (body.serialNumber !== undefined) {
      updates.serialNumber = typeof body.serialNumber === "string" ? body.serialNumber.trim() || null : null;
    }
    if (body.notes !== undefined) updates.notes = typeof body.notes === "string" ? body.notes.trim() || null : null;

    if (body.condition !== undefined) {
      const allowed = ["new", "good", "fair", "poor", "needs_replacement"];
      if (!allowed.includes(body.condition)) {
        return NextResponse.json({ error: "Invalid condition value" }, { status: 400 });
      }
      updates.condition = body.condition;
    }

    if (body.installDate !== undefined) {
      if (body.installDate === null || body.installDate === "") {
        updates.installDate = null;
      } else {
        const installDate = parseOptionalDate(body.installDate);
        if (!installDate) return NextResponse.json({ error: "Invalid installDate" }, { status: 400 });
        updates.installDate = installDate;
      }
    }

    if (body.warrantyEnd !== undefined) {
      if (body.warrantyEnd === null || body.warrantyEnd === "") {
        updates.warrantyEnd = null;
      } else {
        const warrantyEnd = parseOptionalDate(body.warrantyEnd);
        if (!warrantyEnd) return NextResponse.json({ error: "Invalid warrantyEnd" }, { status: 400 });
        updates.warrantyEnd = warrantyEnd;
      }
    }

    if (body.propertyId !== undefined) {
      if (typeof body.propertyId !== "string" || !body.propertyId.trim()) {
        return NextResponse.json({ error: "Invalid propertyId" }, { status: 400 });
      }
      const propertyId = body.propertyId.trim();
      const property = await prisma.property.findFirst({
        where: { id: propertyId, userId: actor.user.id },
        select: { id: true },
      });
      if (!property) {
        return NextResponse.json({ error: "Property not found or not owned" }, { status: 404 });
      }
      updates.propertyId = propertyId;
    }

    if (body.unitId !== undefined) {
      const nextUnitId =
        typeof body.unitId === "string" && body.unitId.trim() ? body.unitId.trim() : null;
      const targetPropertyId = updates.propertyId ?? existing.propertyId;

      if (nextUnitId) {
        const unit = await prisma.unit.findFirst({
          where: { id: nextUnitId, address: { propertyId: targetPropertyId } },
          select: { id: true },
        });
        if (!unit) {
          return NextResponse.json({ error: "Unit not found for selected property" }, { status: 400 });
        }
      }
      updates.unitId = nextUnitId;
    }

    const asset = await prisma.asset.update({
      where: { id },
      data: updates,
      include: {
        property: { select: { id: true, name: true } },
        unit: { select: { id: true, unitNumber: true } },
      },
    });

    return NextResponse.json(asset);
  } catch (error) {
    console.error("Error updating asset:", error);
    return NextResponse.json({ error: "Failed to update asset" }, { status: 500 });
  }
}

/**
 * DELETE /api/assets/[id] — remove an asset
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getDevActor(request);
  if (!actor) {
    return NextResponse.json({ error: "No development user found. Run the seed script." }, { status: 400 });
  }
  if (actor.effectiveRole !== "property_manager") {
    return NextResponse.json({ error: "Only property managers can delete assets" }, { status: 403 });
  }

  const { id } = await params;
  const deleted = await prisma.asset.deleteMany({
    where: { id, property: { userId: actor.user.id } },
  });

  if (deleted.count === 0) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
