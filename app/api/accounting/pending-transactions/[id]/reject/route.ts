import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDevActor } from "@/lib/devActor";

/**
 * POST /api/accounting/pending-transactions/:id/reject
 * Reject a pending tenant payment before it is posted to accounting.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getDevActor(request);
    if (!actor || actor.effectiveRole !== "property_manager") {
      return NextResponse.json({ error: "Property manager context required" }, { status: 403 });
    }

    const { id } = await params;

    const payment = await prisma.tenantPayment.findUnique({ where: { id } });
    if (!payment || payment.status !== "pending_confirmation") {
      return NextResponse.json({ error: "Pending transaction not found" }, { status: 404 });
    }

    const rejected = await prisma.tenantPayment.update({
      where: { id },
      data: {
        status: "rejected",
        confirmedAt: new Date(),
        confirmedByUserId: actor.user.id,
      },
      include: {
        allocations: true,
      },
    });

    return NextResponse.json(rejected);
  } catch (error) {
    console.error("Error rejecting pending transaction:", error);
    return NextResponse.json({ error: "Failed to reject transaction" }, { status: 500 });
  }
}
