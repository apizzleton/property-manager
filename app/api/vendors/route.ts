import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/vendors — list all vendors
 */
export async function GET() {
  const vendors = await prisma.vendor.findMany({
    include: { workOrders: { select: { id: true, status: true } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(vendors);
}

/**
 * POST /api/vendors — create a vendor
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, phone, specialty, notes } = body;

    if (!name) {
      return NextResponse.json({ error: "Vendor name is required" }, { status: 400 });
    }

    const vendor = await prisma.vendor.create({
      data: {
        name,
        email: email || null,
        phone: phone || null,
        specialty: specialty || null,
        notes: notes || null,
      },
    });

    return NextResponse.json(vendor, { status: 201 });
  } catch (error) {
    console.error("Error creating vendor:", error);
    return NextResponse.json({ error: "Failed to create vendor" }, { status: 500 });
  }
}
