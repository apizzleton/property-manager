import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDevActor } from "@/lib/devActor";
import { getStripeClient } from "@/lib/stripe";
import { syncTenantPaymentFromCheckoutSession } from "@/lib/stripe-payment-sync";

/**
 * POST /api/tenant-payments/sync-session
 * Sync Stripe Checkout session status back to tenant payment when local webhooks
 * are not running (common in local/dev).
 */
export async function POST(request: NextRequest) {
  try {
    const actor = await getDevActor(request);
    if (!actor || actor.effectiveRole !== "tenant" || !actor.tenantId) {
      return NextResponse.json({ error: "Tenant context required" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId.trim() : "";
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    const payment = await prisma.tenantPayment.findFirst({
      where: {
        stripeCheckoutSessionId: sessionId,
        tenantId: actor.tenantId,
      },
      select: {
        id: true,
        stripeConnectedAccountId: true,
      },
    });

    if (!payment) {
      return NextResponse.json({ error: "Payment session not found for this tenant" }, { status: 404 });
    }

    const stripe = getStripeClient();
    const session = payment.stripeConnectedAccountId
      ? await stripe.checkout.sessions.retrieve(
          sessionId,
          { expand: ["payment_intent"] },
          { stripeAccount: payment.stripeConnectedAccountId }
        )
      : await stripe.checkout.sessions.retrieve(sessionId, { expand: ["payment_intent"] });

    const result = await syncTenantPaymentFromCheckoutSession({
      tenantPaymentId: payment.id,
      session,
      stripeAccountId: payment.stripeConnectedAccountId,
    });

    const updated = await prisma.tenantPayment.findUnique({
      where: { id: payment.id },
      select: {
        id: true,
        status: true,
        stripePaymentStatus: true,
        paymentCapturedAt: true,
      },
    });

    return NextResponse.json({
      payment: updated,
      syncResult: result,
      checkoutStatus: session.status,
      checkoutPaymentStatus: session.payment_status,
    });
  } catch (error) {
    console.error("Error syncing checkout session:", error);
    return NextResponse.json({ error: "Failed to sync checkout session" }, { status: 500 });
  }
}
