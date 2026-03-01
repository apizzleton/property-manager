import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDevActor } from "@/lib/devActor";

function parseLoggedAt(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function verifyOwnedAsset(assetId: string, userId: string) {
  return prisma.asset.findFirst({
    where: { id: assetId, property: { userId } },
    select: { id: true },
  });
}

/**
 * GET /api/assets/[id]/notes — list manual note log for an asset
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
    return NextResponse.json({ error: "Only property managers can view asset notes" }, { status: 403 });
  }

  const { id } = await params;
  const asset = await verifyOwnedAsset(id, actor.user.id);
  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const notes = await prisma.assetNote.findMany({
    where: { assetId: id },
    orderBy: { loggedAt: "desc" },
  });
  return NextResponse.json(notes);
}

/**
 * POST /api/assets/[id]/notes — append a manual note entry
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getDevActor(request);
    if (!actor) {
      return NextResponse.json({ error: "No development user found. Run the seed script." }, { status: 400 });
    }
    if (actor.effectiveRole !== "property_manager") {
      return NextResponse.json({ error: "Only property managers can add asset notes" }, { status: 403 });
    }

    const { id } = await params;
    const asset = await verifyOwnedAsset(id, actor.user.id);
    if (!asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    const body = await request.json();
    const note = typeof body.note === "string" ? body.note.trim() : "";
    if (!note) {
      return NextResponse.json({ error: "note is required" }, { status: 400 });
    }

    let loggedAt: Date | null = null;
    if (body.loggedAt !== undefined && body.loggedAt !== null && body.loggedAt !== "") {
      loggedAt = parseLoggedAt(body.loggedAt);
      if (!loggedAt) {
        return NextResponse.json({ error: "Invalid loggedAt value" }, { status: 400 });
      }
    }

    const created = await prisma.assetNote.create({
      data: {
        assetId: id,
        note,
        loggedAt: loggedAt ?? new Date(),
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("Error creating asset note:", error);
    return NextResponse.json({ error: "Failed to create asset note" }, { status: 500 });
  }
}
