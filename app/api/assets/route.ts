import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDevActor } from "@/lib/devActor";

function parseOptionalDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * GET /api/assets — list assets for the current property manager
 * Query: propertyId?, unitId?, category?, q?
 */
export async function GET(request: NextRequest) {
  const actor = await getDevActor(request);
  if (!actor) {
    return NextResponse.json({ error: "No development user found. Run the seed script." }, { status: 400 });
  }
  if (actor.effectiveRole !== "property_manager") {
    return NextResponse.json({ error: "Only property managers can view assets" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const propertyId = searchParams.get("propertyId")?.trim() || undefined;
  const unitId = searchParams.get("unitId")?.trim() || undefined;
  const category = searchParams.get("category")?.trim() || undefined;
  const q = searchParams.get("q")?.trim() || undefined;

  const assets = await prisma.asset.findMany({
    where: {
      property: { userId: actor.user.id },
      ...(propertyId ? { propertyId } : {}),
      ...(unitId ? { unitId } : {}),
      ...(category ? { category } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q } },
              { category: { contains: q } },
              { brand: { contains: q } },
              { model: { contains: q } },
              { serialNumber: { contains: q } },
            ],
          }
        : {}),
    },
    include: {
      property: { select: { id: true, name: true } },
      unit: { select: { id: true, unitNumber: true } },
      events: {
        orderBy: { eventDate: "desc" },
        take: 1,
        select: { eventDate: true, eventType: true, summary: true },
      },
      _count: { select: { events: true, notesLog: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(assets);
}

/**
 * POST /api/assets — create a new asset
 */
export async function POST(request: NextRequest) {
  try {
    const actor = await getDevActor(request);
    if (!actor) {
      return NextResponse.json({ error: "No development user found. Run the seed script." }, { status: 400 });
    }
    if (actor.effectiveRole !== "property_manager") {
      return NextResponse.json({ error: "Only property managers can create assets" }, { status: 403 });
    }

    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const category = typeof body.category === "string" ? body.category.trim() : "";
    const propertyId = typeof body.propertyId === "string" ? body.propertyId.trim() : "";
    const unitId = typeof body.unitId === "string" && body.unitId.trim() ? body.unitId.trim() : null;

    if (!name || !category || !propertyId) {
      return NextResponse.json(
        { error: "name, category, and propertyId are required" },
        { status: 400 }
      );
    }

    const property = await prisma.property.findFirst({
      where: { id: propertyId, userId: actor.user.id },
      select: { id: true },
    });
    if (!property) {
      return NextResponse.json({ error: "Property not found or not owned" }, { status: 404 });
    }

    if (unitId) {
      const unit = await prisma.unit.findFirst({
        where: { id: unitId, address: { propertyId } },
        select: { id: true },
      });
      if (!unit) {
        return NextResponse.json(
          { error: "Unit not found for selected property" },
          { status: 400 }
        );
      }
    }

    const categoryExists = await prisma.assetCategory.findFirst({
      where: { userId: actor.user.id, name: category },
      select: { id: true },
    });
    if (!categoryExists) {
      return NextResponse.json(
        { error: "Category must be created in Settings before use" },
        { status: 400 }
      );
    }

    const installDate = parseOptionalDate(body.installDate);
    const warrantyEnd = parseOptionalDate(body.warrantyEnd);
    const allowedConditions = ["new", "good", "fair", "poor", "needs_replacement"];
    if (body.condition !== undefined && !allowedConditions.includes(body.condition)) {
      return NextResponse.json({ error: "Invalid condition value" }, { status: 400 });
    }
    if (body.installDate && !installDate) {
      return NextResponse.json({ error: "Invalid installDate" }, { status: 400 });
    }
    if (body.warrantyEnd && !warrantyEnd) {
      return NextResponse.json({ error: "Invalid warrantyEnd" }, { status: 400 });
    }

    const asset = await prisma.asset.create({
      data: {
        name,
        category,
        brand: typeof body.brand === "string" ? body.brand.trim() || null : null,
        model: typeof body.model === "string" ? body.model.trim() || null : null,
        serialNumber: typeof body.serialNumber === "string" ? body.serialNumber.trim() || null : null,
        condition: typeof body.condition === "string" ? body.condition : "good",
        notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
        installDate,
        warrantyEnd,
        propertyId,
        unitId,
      },
      include: {
        property: { select: { id: true, name: true } },
        unit: { select: { id: true, unitNumber: true } },
      },
    });

    return NextResponse.json(asset, { status: 201 });
  } catch (error) {
    console.error("Error creating asset:", error);
    return NextResponse.json({ error: "Failed to create asset" }, { status: 500 });
  }
}
