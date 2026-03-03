import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDevActor } from "@/lib/devActor";

/**
 * GET /api/accounting/pending-transactions/stale-metrics
 * Returns quick visibility into Stripe payments that look stale.
 */
export async function GET(request: NextRequest) {
  try {
    const actor = await getDevActor(request);
    if (!actor || actor.effectiveRole !== "property_manager") {
      return NextResponse.json({ error: "Property manager context required" }, { status: 403 });
    }

    const cutoff = new Date(Date.now() - 2 * 60 * 1000);
    const [stalePendingStripe, pendingCapturedStripe, pendingManual] = await Promise.all([
      prisma.tenantPayment.count({
        where: {
          paymentProvider: "stripe",
          status: "pending_confirmation",
          paymentCapturedAt: null,
          stripeCheckoutSessionId: { not: null },
          submittedAt: { lte: cutoff },
        },
      }),
      prisma.tenantPayment.count({
        where: {
          paymentProvider: "stripe",
          status: "pending_confirmation",
          paymentCapturedAt: { not: null },
          stripePaymentStatus: { in: ["paid", "succeeded"] },
        },
      }),
      prisma.tenantPayment.count({
        where: {
          paymentProvider: "manual",
          status: "pending_confirmation",
        },
      }),
    ]);

    return NextResponse.json({
      stalePendingStripe,
      pendingCapturedStripe,
      pendingManual,
    });
  } catch (error) {
    console.error("Error loading stale payment metrics:", error);
    return NextResponse.json({ error: "Failed to load stale payment metrics" }, { status: 500 });
  }
}
