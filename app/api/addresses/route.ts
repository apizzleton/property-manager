import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/addresses — create a new address under a property
 * Body: { propertyId, street, city, state, zip }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { propertyId, street, city, state, zip } = body;

    if (!propertyId || !street || !city || !state || !zip) {
      return NextResponse.json(
        { error: "propertyId, street, city, state, and zip are required" },
        { status: 400 }
      );
    }

    const address = await prisma.address.create({
      data: { propertyId, street, city, state, zip },
      include: { units: true },
    });

    return NextResponse.json(address, { status: 201 });
  } catch (error) {
    console.error("Error creating address:", error);
    return NextResponse.json({ error: "Failed to create address" }, { status: 500 });
  }
}
