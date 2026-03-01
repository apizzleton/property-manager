import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getStripeClient, getStripeWebhookSecret } from "@/lib/stripe";

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
        return NextResponse.json({ received: true, duplicate: true });
      }
      throw error;
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const tenantPaymentId = session.metadata?.tenantPaymentId;
        if (!tenantPaymentId) break;

        let stripePaymentMethodId: string | null = null;
        let stripeCustomerId: string | null =
          typeof session.customer === "string" ? session.customer : null;
        const paymentIntentId =
          typeof session.payment_intent === "string" ? session.payment_intent : null;

        if (paymentIntentId) {
          const paymentIntent = eventAccount
            ? await stripe.paymentIntents.retrieve(paymentIntentId, {}, { stripeAccount: eventAccount })
            : await stripe.paymentIntents.retrieve(paymentIntentId);
          stripePaymentMethodId =
            typeof paymentIntent.payment_method === "string"
              ? paymentIntent.payment_method
              : paymentIntent.payment_method?.id || null;
          if (!stripeCustomerId) {
            stripeCustomerId =
              typeof paymentIntent.customer === "string"
                ? paymentIntent.customer
                : paymentIntent.customer?.id || null;
          }
        }

        await prisma.tenantPayment.updateMany({
          where: { id: tenantPaymentId },
          data: {
            stripeCheckoutSessionId: session.id,
            stripePaymentIntentId: paymentIntentId,
            stripeConnectedAccountId: eventAccount,
            stripeCustomerId,
            stripePaymentMethodId,
            stripePaymentStatus:
              session.payment_status === "unpaid" ? "processing" : session.payment_status || "paid",
            stripeCustomerEmail: session.customer_details?.email || null,
            stripeLastEventId: event.id,
            paymentCapturedAt: session.payment_status === "paid" ? new Date() : null,
          },
        });
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

        await prisma.tenantPayment.updateMany({
          where: { id: tenantPaymentId },
          data: {
            stripeCheckoutSessionId: session.id,
            stripeConnectedAccountId: eventAccount,
            stripePaymentStatus: "paid",
            stripeCustomerEmail: session.customer_details?.email || null,
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
      case "checkout.session.async_payment_failed":
      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        const tenantPaymentId = session.metadata?.tenantPaymentId;
        if (!tenantPaymentId) break;

        await prisma.tenantPayment.updateMany({
          where: { id: tenantPaymentId, status: "pending_confirmation" },
          data: {
            stripeCheckoutSessionId: session.id,
            stripeConnectedAccountId: eventAccount,
            stripePaymentStatus:
              event.type === "checkout.session.expired" ? "expired" : "failed",
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
