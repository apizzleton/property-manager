import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDevActor } from "@/lib/devActor";

/**
 * GET /api/portfolios/[id] — get a single portfolio with properties
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getDevActor(request);
  if (!actor) {
    return NextResponse.json({ error: "No development user found. Run the seed script." }, { status: 400 });
  }

  const { id } = await params;
  const portfolio = await prisma.portfolio.findFirst({
    where: { id, userId: actor.user.id },
    include: {
      properties: {
        include: {
          property: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!portfolio) {
    return NextResponse.json({ error: "Portfolio not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: portfolio.id,
    name: portfolio.name,
    description: portfolio.description,
    propertyIds: portfolio.properties.map((pp) => pp.propertyId),
    properties: portfolio.properties.map((pp) => ({ id: pp.property.id, name: pp.property.name })),
  });
}

/**
 * PUT /api/portfolios/[id] — update portfolio name/description and/or property membership
 * Body: { name?, description?, propertyIds? }
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

    const { id } = await params;
    const existing = await prisma.portfolio.findFirst({
      where: { id, userId: actor.user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Portfolio not found" }, { status: 404 });
    }

    const body = await request.json();
    const { name, description, propertyIds } = body;

    const updates: { name?: string; description?: string | null } = {};
    if (typeof name === "string" && name.trim()) updates.name = name.trim();
    if (description !== undefined) updates.description = description?.trim() || null;

    // If propertyIds provided, replace membership (sync: delete removed, create new)
    if (Array.isArray(propertyIds)) {
      const ids = propertyIds.filter(Boolean) as string[];
      const count = await prisma.property.count({
        where: { id: { in: ids }, userId: actor.user.id },
      });
      if (count !== ids.length) {
        return NextResponse.json({ error: "One or more properties not found or not owned" }, { status: 400 });
      }

      await prisma.$transaction(async (tx: any) => {
        await tx.portfolioProperty.deleteMany({ where: { portfolioId: id } });
        if (ids.length > 0) {
          await tx.portfolioProperty.createMany({
            data: ids.map((propertyId: string) => ({ portfolioId: id, propertyId })),
          });
        }
      });
    }

    const portfolio = await prisma.portfolio.update({
      where: { id },
      data: updates,
      include: {
        properties: { select: { propertyId: true } },
      },
    });

    return NextResponse.json({
      id: portfolio.id,
      name: portfolio.name,
      description: portfolio.description,
      propertyIds: portfolio.properties.map((pp) => pp.propertyId),
      propertyCount: portfolio.properties.length,
    });
  } catch (error) {
    console.error("Error updating portfolio:", error);
    return NextResponse.json({ error: "Failed to update portfolio" }, { status: 500 });
  }
}

/**
 * DELETE /api/portfolios/[id] — delete a portfolio
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getDevActor(request);
  if (!actor) {
    return NextResponse.json({ error: "No development user found. Run the seed script." }, { status: 400 });
  }

  const { id } = await params;
  const deleted = await prisma.portfolio.deleteMany({
    where: { id, userId: actor.user.id },
  });

  if (deleted.count === 0) {
    return NextResponse.json({ error: "Portfolio not found" }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
