import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDevActor } from "@/lib/devActor";

function toCategoryErrorDetail(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  const isStalePrismaClient =
    error instanceof TypeError &&
    message.includes("Cannot read properties of undefined");

  return isStalePrismaClient
    ? "Prisma client is out of sync with schema changes. Run `npm run prisma:generate`, then restart `npm run dev`."
    : message;
}

/**
 * GET /api/asset-categories — list categories for current property manager
 */
export async function GET(request: NextRequest) {
  try {
    const actor = await getDevActor(request);
    if (!actor) {
      return NextResponse.json({ error: "No development user found. Run the seed script." }, { status: 400 });
    }
    if (actor.effectiveRole !== "property_manager") {
      return NextResponse.json({ error: "Only property managers can view asset categories" }, { status: 403 });
    }

    const categories = await prisma.assetCategory.findMany({
      where: { userId: actor.user.id },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(categories);
  } catch (error) {
    console.error("Error fetching asset categories:", error);
    return NextResponse.json(
      { error: "Failed to fetch asset categories", detail: toCategoryErrorDetail(error) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/asset-categories — create a category
 * Body: { name }
 */
export async function POST(request: NextRequest) {
  try {
    const actor = await getDevActor(request);
    if (!actor) {
      return NextResponse.json({ error: "No development user found. Run the seed script." }, { status: 400 });
    }
    if (actor.effectiveRole !== "property_manager") {
      return NextResponse.json({ error: "Only property managers can create asset categories" }, { status: 403 });
    }

    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "Category name is required" }, { status: 400 });
    }

    const exists = await prisma.assetCategory.findFirst({
      where: { userId: actor.user.id, name },
      select: { id: true },
    });
    if (exists) {
      return NextResponse.json({ error: "Category already exists" }, { status: 409 });
    }

    const created = await prisma.assetCategory.create({
      data: { name, userId: actor.user.id },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("Error creating asset category:", error);
    return NextResponse.json(
      { error: "Failed to create asset category", detail: toCategoryErrorDetail(error) },
      { status: 500 }
    );
  }
}
