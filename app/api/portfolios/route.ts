import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDevActor } from "@/lib/devActor";

/**
 * GET /api/portfolios — list portfolios for the current user
 */
export async function GET(request: NextRequest) {
  const actor = await getDevActor(request);
  if (!actor) {
    return NextResponse.json({ error: "No development user found. Run the seed script." }, { status: 400 });
  }

  const portfolios = await prisma.portfolio.findMany({
    where: { userId: actor.user.id },
    include: {
      properties: { select: { propertyId: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(
    portfolios.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      propertyIds: p.properties.map((pp) => pp.propertyId),
      propertyCount: p.properties.length,
    }))
  );
}

/**
 * POST /api/portfolios — create a new portfolio
 * Body: { name, description?, propertyIds? }
 */
export async function POST(request: NextRequest) {
  try {
    const actor = await getDevActor(request);
    if (!actor) {
      return NextResponse.json({ error: "No development user found. Run the seed script." }, { status: 400 });
    }

    const body = await request.json();
    const { name, description, propertyIds } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Portfolio name is required" }, { status: 400 });
    }

    // Verify all property IDs belong to user's properties
    const ids = Array.isArray(propertyIds) ? propertyIds.filter(Boolean) : [];
    if (ids.length > 0) {
      const count = await prisma.property.count({
        where: { id: { in: ids }, userId: actor.user.id },
      });
      if (count !== ids.length) {
        return NextResponse.json({ error: "One or more properties not found or not owned" }, { status: 400 });
      }
    }

    // Create portfolio first, then assign properties (avoids nested create issues with join table)
    const portfolio = await prisma.portfolio.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        userId: actor.user.id,
      },
    });

    // Create PortfolioProperty join records if any property IDs provided
    if (ids.length > 0) {
      await prisma.portfolioProperty.createMany({
        data: ids.map((propertyId: string) => ({
          portfolioId: portfolio.id,
          propertyId,
        })),
      });
    }

    // Fetch with properties for response
    const portfolioWithProperties = await prisma.portfolio.findUniqueOrThrow({
      where: { id: portfolio.id },
      include: {
        properties: { select: { propertyId: true } },
      },
    });

    return NextResponse.json(
      {
        id: portfolioWithProperties.id,
        name: portfolioWithProperties.name,
        description: portfolioWithProperties.description,
        propertyIds: portfolioWithProperties.properties.map((pp) => pp.propertyId),
        propertyCount: portfolioWithProperties.properties.length,
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const isStalePrismaClient =
      error instanceof TypeError &&
      message.includes("Cannot read properties of undefined") &&
      message.includes("create");

    console.error("Error creating portfolio:", error);
    return NextResponse.json(
      {
        error: "Failed to create portfolio",
        detail: isStalePrismaClient
          ? "Prisma client is out of sync with the schema. Run `npm run prisma:generate`, then restart `npm run dev`."
          : message,
      },
      { status: 500 }
    );
  }
}

