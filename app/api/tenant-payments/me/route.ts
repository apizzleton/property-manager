import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDevActor } from "@/lib/devActor";

/**
 * GET /api/tenant-payments/me
 * Tenant payment history for the active dev tenant context.
 */
export async function GET(request: NextRequest) {
  try {
    const actor = await getDevActor(request);
    if (!actor || actor.effectiveRole !== "tenant" || !actor.tenantId) {
      return NextResponse.json({ error: "Tenant context required" }, { status: 403 });
    }

    const payments = await prisma.tenantPayment.findMany({
      where: { tenantId: actor.tenantId },
      include: {
        lease: {
          include: { unit: { include: { address: { include: { property: true } } } } },
        },
        allocations: {
          include: {
            ledgerCharge: {
              include: { account: true },
            },
          },
          orderBy: { allocationOrder: "asc" },
        },
        journalEntry: true,
      },
      orderBy: { submittedAt: "desc" },
    });

    return NextResponse.json(payments);
  } catch (error) {
    console.error("Error fetching tenant payment history:", error);
    return NextResponse.json({ error: "Failed to fetch tenant payments" }, { status: 500 });
  }
}
