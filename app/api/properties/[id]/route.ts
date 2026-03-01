import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/properties/:id — get a single property with all nested data
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const property = await prisma.property.findUnique({
    where: { id },
    include: {
      addresses: {
        include: {
          units: {
            include: {
              leases: {
                include: { tenant: true },
                orderBy: { startDate: "desc" },
              },
            },
          },
        },
      },
    },
  });

  if (!property) {
    return NextResponse.json({ error: "Property not found" }, { status: 404 });
  }

  return NextResponse.json(property);
}

/**
 * PUT /api/properties/:id — update a property
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      name,
      type,
      notes,
      accountingBasis,
      stripeConnectAccountId,
      stripeConnectChargesEnabled,
      stripeConnectPayoutsEnabled,
      stripeConnectDetailsSubmitted,
    } = body;

    if (accountingBasis !== undefined && !["cash", "accrual"].includes(accountingBasis)) {
      return NextResponse.json(
        { error: "accountingBasis must be either 'cash' or 'accrual'" },
        { status: 400 }
      );
    }

    const property = await prisma.property.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(type && { type }),
        notes: notes !== undefined ? notes : undefined,
        accountingBasis: accountingBasis !== undefined ? accountingBasis : undefined,
        stripeConnectAccountId:
          stripeConnectAccountId !== undefined ? stripeConnectAccountId || null : undefined,
        stripeConnectChargesEnabled:
          stripeConnectChargesEnabled !== undefined
            ? Boolean(stripeConnectChargesEnabled)
            : undefined,
        stripeConnectPayoutsEnabled:
          stripeConnectPayoutsEnabled !== undefined
            ? Boolean(stripeConnectPayoutsEnabled)
            : undefined,
        stripeConnectDetailsSubmitted:
          stripeConnectDetailsSubmitted !== undefined
            ? Boolean(stripeConnectDetailsSubmitted)
            : undefined,
      },
      include: {
        addresses: { include: { units: true } },
      },
    });

    return NextResponse.json(property);
  } catch (error) {
    console.error("Error updating property:", error);
    return NextResponse.json({ error: "Failed to update property" }, { status: 500 });
  }
}

/**
 * DELETE /api/properties/:id — delete a property and all related data
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await prisma.property.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting property:", error);
    return NextResponse.json({ error: "Failed to delete property" }, { status: 500 });
  }
}
