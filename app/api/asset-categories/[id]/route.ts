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
 * PUT /api/asset-categories/:id — rename a category
 * Body: { name }
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
      return NextResponse.json({ error: "Only property managers can update asset categories" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "Category name is required" }, { status: 400 });
    }

    const existing = await prisma.assetCategory.findFirst({
      where: { id, userId: actor.user.id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    const duplicate = await prisma.assetCategory.findFirst({
      where: { userId: actor.user.id, name, id: { not: id } },
      select: { id: true },
    });
    if (duplicate) {
      return NextResponse.json({ error: "Category already exists" }, { status: 409 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const categoryBefore = await tx.assetCategory.findUniqueOrThrow({ where: { id } });
      await tx.asset.updateMany({
        where: {
          property: { userId: actor.user.id },
          category: categoryBefore.name,
        },
        data: { category: name },
      });
      return tx.assetCategory.update({
        where: { id },
        data: { name },
      });
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating asset category:", error);
    return NextResponse.json(
      { error: "Failed to update asset category", detail: toCategoryErrorDetail(error) },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/asset-categories/:id — delete a category
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getDevActor(request);
    if (!actor) {
      return NextResponse.json({ error: "No development user found. Run the seed script." }, { status: 400 });
    }
    if (actor.effectiveRole !== "property_manager") {
      return NextResponse.json({ error: "Only property managers can delete asset categories" }, { status: 403 });
    }

    const { id } = await params;
    const category = await prisma.assetCategory.findFirst({
      where: { id, userId: actor.user.id },
      select: { id: true, name: true },
    });
    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    const linkedAssets = await prisma.asset.count({
      where: {
        property: { userId: actor.user.id },
        category: category.name,
      },
    });
    if (linkedAssets > 0) {
      return NextResponse.json(
        { error: "Cannot delete category while assets still use it" },
        { status: 400 }
      );
    }

    await prisma.assetCategory.delete({ where: { id: category.id } });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error deleting asset category:", error);
    return NextResponse.json(
      { error: "Failed to delete asset category", detail: toCategoryErrorDetail(error) },
      { status: 500 }
    );
  }
}
