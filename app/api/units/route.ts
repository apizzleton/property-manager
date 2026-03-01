import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/units — create a new unit under an address
 * Body: { addressId, unitNumber, bedrooms?, bathrooms?, sqft?, marketRent? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { addressId, unitNumber, bedrooms, bathrooms, sqft, marketRent } = body;

    if (!addressId || !unitNumber) {
      return NextResponse.json(
        { error: "addressId and unitNumber are required" },
        { status: 400 }
      );
    }

    const unit = await prisma.unit.create({
      data: {
        addressId,
        unitNumber,
        bedrooms: bedrooms ? parseInt(bedrooms) : 0,
        bathrooms: bathrooms ? parseFloat(bathrooms) : 1,
        sqft: sqft ? parseFloat(sqft) : null,
        marketRent: marketRent ? parseFloat(marketRent) : null,
      },
    });

    return NextResponse.json(unit, { status: 201 });
  } catch (error) {
    console.error("Error creating unit:", error);
    return NextResponse.json({ error: "Failed to create unit" }, { status: 500 });
  }
}
