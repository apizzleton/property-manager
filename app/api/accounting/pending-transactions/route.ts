import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDevActor } from "@/lib/devActor";
import { resolvePropertyIdsForFilter } from "@/lib/portfolioScope";

/**
 * GET /api/accounting/pending-transactions
 * List pending tenant-initiated transactions for PM confirmation.
 * Query: propertyId?, portfolioId?
 */
export async function GET(request: NextRequest) {
  try {
    const actor = await getDevActor(request);
    if (!actor || actor.effectiveRole !== "property_manager") {
      return NextResponse.json({ error: "Property manager context required" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get("propertyId");
    const portfolioId = searchParams.get("portfolioId");

    let propertyFilter: { propertyId?: string | { in: string[] } } = {};
    if (portfolioId) {
      const ids = await resolvePropertyIdsForFilter(actor.user.id, portfolioId, propertyId);
      if (ids !== null) {
        propertyFilter = ids.length === 0 ? { propertyId: { in: [] } } : { propertyId: { in: ids } };
      }
    } else if (propertyId) {
      propertyFilter = { propertyId };
    }

    const transactions = await prisma.tenantPayment.findMany({
      where: {
        status: "pending_confirmation",
        ...propertyFilter,
        OR: [
          { paymentProvider: "manual" },
          {
            paymentProvider: "stripe",
            stripePaymentStatus: { in: ["paid", "succeeded"] },
            paymentCapturedAt: { not: null },
          },
        ],
      },
      include: {
        tenant: true,
        lease: {
          include: {
            unit: {
              include: {
                address: { include: { property: true } },
              },
            },
          },
        },
        allocations: {
          include: {
            ledgerCharge: {
              include: { account: true },
            },
          },
          orderBy: { allocationOrder: "asc" },
        },
      },
      orderBy: { submittedAt: "asc" },
    });

    return NextResponse.json(
      transactions.map((txn) => ({
        ...txn,
        allocationSummary: txn.allocations.map((allocation) => ({
          id: allocation.id,
          amount: allocation.allocatedAmount,
          charge: {
            id: allocation.ledgerCharge.id,
            description: allocation.ledgerCharge.description,
            dueDate: allocation.ledgerCharge.dueDate,
            accountNumber: allocation.ledgerCharge.account.accountNumber,
            accountName: allocation.ledgerCharge.account.name,
          },
        })),
      }))
    );
  } catch (error) {
    console.error("Error fetching pending transactions:", error);
    return NextResponse.json({ error: "Failed to fetch pending transactions" }, { status: 500 });
  }
}
