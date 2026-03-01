import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDevActor } from "@/lib/devActor";

function parseEventDate(value: unknown): Date | null {
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
 * GET /api/assets/[id]/events — list event history for an asset
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
    return NextResponse.json({ error: "Only property managers can view asset events" }, { status: 403 });
  }

  const { id } = await params;
  const asset = await verifyOwnedAsset(id, actor.user.id);
  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const events = await prisma.assetEvent.findMany({
    where: { assetId: id },
    orderBy: { eventDate: "desc" },
  });
  return NextResponse.json(events);
}

/**
 * POST /api/assets/[id]/events — add a structured event
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
      return NextResponse.json({ error: "Only property managers can add asset events" }, { status: 403 });
    }

    const { id } = await params;
    const asset = await verifyOwnedAsset(id, actor.user.id);
    if (!asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    const body = await request.json();
    const summary = typeof body.summary === "string" ? body.summary.trim() : "";
    const eventType = typeof body.eventType === "string" ? body.eventType : "";
    const eventDate = parseEventDate(body.eventDate);

    if (!summary || !eventType || !eventDate) {
      return NextResponse.json(
        { error: "summary, eventType, and eventDate are required" },
        { status: 400 }
      );
    }

    const allowedEventTypes = ["install", "inspect", "repair", "replace", "paint", "flooring_update", "other"];
    if (!allowedEventTypes.includes(eventType)) {
      return NextResponse.json({ error: "Invalid eventType value" }, { status: 400 });
    }

    const cost =
      body.cost === undefined || body.cost === null || body.cost === ""
        ? null
        : Number.parseFloat(String(body.cost));
    if (cost !== null && Number.isNaN(cost)) {
      return NextResponse.json({ error: "Invalid cost value" }, { status: 400 });
    }

    const created = await prisma.assetEvent.create({
      data: {
        assetId: id,
        summary,
        eventType: eventType as
          | "install"
          | "inspect"
          | "repair"
          | "replace"
          | "paint"
          | "flooring_update"
          | "other",
        eventDate,
        cost,
        vendorName: typeof body.vendorName === "string" ? body.vendorName.trim() || null : null,
        details: typeof body.details === "string" ? body.details.trim() || null : null,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("Error creating asset event:", error);
    return NextResponse.json({ error: "Failed to create asset event" }, { status: 500 });
  }
}
