import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripeClient, getStripeWebhookSecret } from "@/lib/stripe";
import { syncTenantPaymentFromCheckoutSession } from "@/lib/stripe-payment-sync";

/**
 * Stripe webhook handler for tenant checkout sessions.
 * We only expose a payment to PM confirmation after Stripe marks it paid.
 */
export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 });
  }

  try {
    const payload = await request.text();
    const stripe = getStripeClient();
    const event = stripe.webhooks.constructEvent(payload, signature, getStripeWebhookSecret());
    const eventAccount =
      (event as Stripe.Event & { account?: string }).account ?? null;

    // Idempotency: ignore events we already processed.
    try {
      await prisma.stripeWebhookEvent.create({
        data: {
          id: event.id,
          type: event.type,
          account: eventAccount,
        },
      });
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: string }).code === "P2002"
      ) {
        console.info("Stripe webhook duplicate ignored", { eventId: event.id, type: event.type, account: eventAccount });
        return NextResponse.json({ received: true, duplicate: true });
      }
      throw error;
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const tenantPaymentId = session.metadata?.tenantPaymentId;
        if (!tenantPaymentId) break;
        const result = await syncTenantPaymentFromCheckoutSession({
          tenantPaymentId,
          session,
          stripeAccountId: eventAccount,
          eventId: event.id,
        });
        console.info("Stripe webhook checkout.session.completed synced", { eventId: event.id, ...result });
        await prisma.stripeWebhookEvent.update({
          where: { id: event.id },
          data: { tenantPaymentId },
        });
        break;
      }
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        const tenantPaymentId = session.metadata?.tenantPaymentId;
        if (!tenantPaymentId) break;
        const result = await syncTenantPaymentFromCheckoutSession({
          tenantPaymentId,
          session,
          stripeAccountId: eventAccount,
          eventId: event.id,
        });
        console.info("Stripe webhook async success synced", { eventId: event.id, ...result });
        await prisma.stripeWebhookEvent.update({
          where: { id: event.id },
          data: { tenantPaymentId },
        });
        break;
      }
      case "checkout.session.async_payment_failed":
      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        const tenantPaymentId = session.metadata?.tenantPaymentId;
        if (!tenantPaymentId) break;
        const result = await syncTenantPaymentFromCheckoutSession({
          tenantPaymentId,
          session,
          stripeAccountId: eventAccount,
          eventId: event.id,
          forceStatus: event.type === "checkout.session.expired" ? "expired" : "failed",
        });
        console.info("Stripe webhook async failure synced", { eventId: event.id, ...result });
        await prisma.stripeWebhookEvent.update({
          where: { id: event.id },
          data: { tenantPaymentId },
        });
        break;
      }
      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const tenantPaymentId = paymentIntent.metadata?.tenantPaymentId;
        if (!tenantPaymentId) break;

        await prisma.tenantPayment.updateMany({
          where: { id: tenantPaymentId, status: "pending_confirmation" },
          data: {
            stripePaymentIntentId: paymentIntent.id,
            stripeConnectedAccountId: eventAccount,
            stripeCustomerId:
              typeof paymentIntent.customer === "string"
                ? paymentIntent.customer
                : paymentIntent.customer?.id || null,
            stripePaymentMethodId:
              typeof paymentIntent.payment_method === "string"
                ? paymentIntent.payment_method
                : paymentIntent.payment_method?.id || null,
            stripePaymentStatus: "failed",
            status: "rejected",
            confirmedAt: new Date(),
            stripeLastEventId: event.id,
          },
        });
        await prisma.stripeWebhookEvent.update({
          where: { id: event.id },
          data: { tenantPaymentId },
        });
        break;
      }
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const tenantPaymentId = paymentIntent.metadata?.tenantPaymentId;
        if (!tenantPaymentId) break;

        await prisma.tenantPayment.updateMany({
          where: { id: tenantPaymentId },
          data: {
            stripePaymentIntentId: paymentIntent.id,
            stripeConnectedAccountId: eventAccount,
            stripeCustomerId:
              typeof paymentIntent.customer === "string"
                ? paymentIntent.customer
                : paymentIntent.customer?.id || null,
            stripePaymentMethodId:
              typeof paymentIntent.payment_method === "string"
                ? paymentIntent.payment_method
                : paymentIntent.payment_method?.id || null,
            stripePaymentStatus: "paid",
            stripeLastEventId: event.id,
            paymentCapturedAt: new Date(),
          },
        });
        await prisma.stripeWebhookEvent.update({
          where: { id: event.id },
          data: { tenantPaymentId },
        });
        break;
      }
      case "payment_intent.processing": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const tenantPaymentId = paymentIntent.metadata?.tenantPaymentId;
        if (!tenantPaymentId) break;

        await prisma.tenantPayment.updateMany({
          where: { id: tenantPaymentId, status: "pending_confirmation" },
          data: {
            stripePaymentIntentId: paymentIntent.id,
            stripeConnectedAccountId: eventAccount,
            stripePaymentStatus: "processing",
            stripeLastEventId: event.id,
          },
        });
        await prisma.stripeWebhookEvent.update({
          where: { id: event.id },
          data: { tenantPaymentId },
        });
        break;
      }
      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook error:", error);
    return NextResponse.json({ error: "Invalid webhook request" }, { status: 400 });
  }
}
