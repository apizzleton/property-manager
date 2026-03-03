import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe";

export interface TenantPaymentStripeSyncResult {
  tenantPaymentId: string;
  updated: boolean;
  captured: boolean;
  rejected: boolean;
  stripePaymentStatus: string | null;
}

interface SyncFromSessionInput {
  tenantPaymentId: string;
  session: Stripe.Checkout.Session;
  stripeAccountId?: string | null;
  eventId?: string | null;
  forceStatus?: "failed" | "expired";
}

/**
 * Normalize Checkout session state into our tenant payment record format.
 * Shared by webhook handling and non-webhook reconciliation paths.
 */
export async function syncTenantPaymentFromCheckoutSession({
  tenantPaymentId,
  session,
  stripeAccountId,
  eventId,
  forceStatus,
}: SyncFromSessionInput): Promise<TenantPaymentStripeSyncResult> {
  const stripe = getStripeClient();
  const resolvedStripeAccountId = stripeAccountId ?? null;

  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null;
  const paymentIntent = paymentIntentId
    ? resolvedStripeAccountId
      ? await stripe.paymentIntents.retrieve(paymentIntentId, {}, { stripeAccount: resolvedStripeAccountId })
      : await stripe.paymentIntents.retrieve(paymentIntentId)
    : null;

  const shouldReject = forceStatus === "failed" || forceStatus === "expired" || session.status === "expired";
  const baseStatus =
    forceStatus ||
    (session.payment_status === "unpaid" ? "processing" : session.payment_status || "paid");
  const nextStripeStatus = shouldReject && forceStatus === "expired" ? "expired" : baseStatus;
  const captured = !shouldReject && nextStripeStatus === "paid";

  const updateData: {
    stripeCheckoutSessionId: string;
    stripePaymentIntentId?: string | null;
    stripeConnectedAccountId?: string | null;
    stripeCustomerId?: string | null;
    stripePaymentMethodId?: string | null;
    stripePaymentStatus: string;
    stripeCustomerEmail?: string | null;
    stripeLastEventId?: string;
    paymentCapturedAt?: Date;
    status?: "rejected";
    confirmedAt?: Date;
  } = {
    stripeCheckoutSessionId: session.id,
    stripeConnectedAccountId: resolvedStripeAccountId,
    stripePaymentStatus: nextStripeStatus,
    stripeCustomerEmail: session.customer_details?.email || null,
  };

  if (paymentIntentId) {
    updateData.stripePaymentIntentId = paymentIntentId;
  }
  const stripeCustomerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id || (typeof paymentIntent?.customer === "string" ? paymentIntent.customer : null);
  if (stripeCustomerId !== undefined) {
    updateData.stripeCustomerId = stripeCustomerId;
  }
  const paymentMethodId =
    typeof paymentIntent?.payment_method === "string"
      ? paymentIntent.payment_method
      : paymentIntent?.payment_method?.id || null;
  if (paymentMethodId !== undefined) {
    updateData.stripePaymentMethodId = paymentMethodId;
  }
  if (eventId) {
    updateData.stripeLastEventId = eventId;
  }
  if (captured) {
    updateData.paymentCapturedAt = new Date();
  }
  if (shouldReject) {
    updateData.status = "rejected";
    updateData.confirmedAt = new Date();
  }

  const updated = await prisma.tenantPayment.updateMany({
    where: {
      id: tenantPaymentId,
      ...(shouldReject ? { status: "pending_confirmation" } : {}),
    },
    data: updateData,
  });

  return {
    tenantPaymentId,
    updated: updated.count > 0,
    captured,
    rejected: shouldReject,
    stripePaymentStatus: nextStripeStatus,
  };
}

export interface ReconcileStaleStripePaymentsOptions {
  limit: number;
  minAgeMinutes: number;
}

export interface ReconcileStaleStripePaymentsSummary {
  scanned: number;
  synced: number;
  captured: number;
  rejected: number;
  errors: number;
}

/**
 * Repair stale Stripe-initiated tenant payments that never got webhook updates.
 */
export async function reconcileStaleStripePayments({
  limit,
  minAgeMinutes,
}: ReconcileStaleStripePaymentsOptions): Promise<ReconcileStaleStripePaymentsSummary> {
  const cutoff = new Date(Date.now() - minAgeMinutes * 60 * 1000);
  const stalePayments = await prisma.tenantPayment.findMany({
    where: {
      paymentProvider: "stripe",
      status: "pending_confirmation",
      paymentCapturedAt: null,
      stripeCheckoutSessionId: { not: null },
      submittedAt: { lte: cutoff },
    },
    select: {
      id: true,
      stripeCheckoutSessionId: true,
      stripeConnectedAccountId: true,
    },
    orderBy: { submittedAt: "asc" },
    take: limit,
  });

  const stripe = getStripeClient();
  const summary: ReconcileStaleStripePaymentsSummary = {
    scanned: stalePayments.length,
    synced: 0,
    captured: 0,
    rejected: 0,
    errors: 0,
  };

  for (const payment of stalePayments) {
    if (!payment.stripeCheckoutSessionId) continue;
    try {
      const session = payment.stripeConnectedAccountId
        ? await stripe.checkout.sessions.retrieve(
            payment.stripeCheckoutSessionId,
            { expand: ["payment_intent"] },
            { stripeAccount: payment.stripeConnectedAccountId }
          )
        : await stripe.checkout.sessions.retrieve(payment.stripeCheckoutSessionId, {
            expand: ["payment_intent"],
          });

      const result = await syncTenantPaymentFromCheckoutSession({
        tenantPaymentId: payment.id,
        session,
        stripeAccountId: payment.stripeConnectedAccountId,
      });
      if (result.updated) summary.synced += 1;
      if (result.captured) summary.captured += 1;
      if (result.rejected) summary.rejected += 1;
    } catch (error) {
      summary.errors += 1;
      console.warn("Failed stale payment reconciliation", {
        tenantPaymentId: payment.id,
        checkoutSessionId: payment.stripeCheckoutSessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return summary;
}
