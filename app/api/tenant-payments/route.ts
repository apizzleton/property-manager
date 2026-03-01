import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getDevActor } from "@/lib/devActor";
import { allocateOldestFirst, computeOutstandingBalance } from "@/lib/payments";
import {
  allowPlatformStripeFallback,
  getCheckoutPaymentMethodTypes,
  getStripeClient,
  getStripeCurrency,
  toStripeFeeAmount,
} from "@/lib/stripe";

/**
 * POST /api/tenant-payments
 * Create a pending tenant payment and allocation rows.
 * Journal entry is created only after PM confirmation.
 */
export async function POST(request: NextRequest) {
  try {
    const actor = await getDevActor(request);
    if (!actor || actor.effectiveRole !== "tenant" || !actor.tenantId) {
      return NextResponse.json({ error: "Tenant context required" }, { status: 403 });
    }

    // Validate Stripe config before writing any payment records.
    let stripe: Stripe;
    try {
      stripe = getStripeClient();
    } catch {
      return NextResponse.json(
        { error: "Stripe payments are not configured. Please contact support." },
        { status: 503 }
      );
    }

    const body = await request.json();
    const amount = parseFloat(body.amount);
    const memo = body.memo?.trim() || null;

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "Payment amount must be greater than 0" }, { status: 400 });
    }

    const activeLease = await prisma.lease.findFirst({
      where: { tenantId: actor.tenantId, status: "active" },
      include: {
        unit: { include: { address: { include: { property: true } } } },
      },
      orderBy: { startDate: "desc" },
    });

    if (!activeLease) {
      return NextResponse.json({ error: "No active lease found for tenant" }, { status: 400 });
    }

    const property = activeLease.unit.address.property;
    const connectedAccountId = property.stripeConnectAccountId;
    const connectReady =
      !!connectedAccountId &&
      property.stripeConnectChargesEnabled &&
      property.stripeConnectDetailsSubmitted;
    const usePlatformFallback = !connectReady && allowPlatformStripeFallback();
    if (!connectReady && !usePlatformFallback) {
      const error = !connectedAccountId
        ? "This property does not have a Stripe connected account configured yet."
        : "Stripe onboarding is not complete for this property yet.";
      return NextResponse.json({ error }, { status: 400 });
    }

    const openCharges = await prisma.ledgerCharge.findMany({
      where: {
        leaseId: activeLease.id,
        tenantId: actor.tenantId,
        status: { in: ["unpaid", "partially_paid"] },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    });

    const outstanding = computeOutstandingBalance(openCharges);
    if (outstanding <= 0) {
      return NextResponse.json({ error: "No outstanding charges to pay" }, { status: 400 });
    }

    if (amount > outstanding + 0.01) {
      return NextResponse.json(
        { error: `Payment exceeds outstanding balance (${outstanding.toFixed(2)})` },
        { status: 400 }
      );
    }

    const allocation = allocateOldestFirst(openCharges, amount);
    if (allocation.appliedAmount <= 0 || allocation.allocations.length === 0) {
      return NextResponse.json({ error: "Unable to allocate payment to charges" }, { status: 400 });
    }

    let stripeCustomerId =
      (
        await prisma.tenantPayment.findFirst({
          where: {
            tenantId: actor.tenantId,
            propertyId: activeLease.unit.address.property.id,
            stripeConnectedAccountId: usePlatformFallback ? null : connectedAccountId!,
            stripeCustomerId: { not: null },
          },
          select: { stripeCustomerId: true },
          orderBy: { submittedAt: "desc" },
        })
      )?.stripeCustomerId ?? null;

    if (!stripeCustomerId) {
      const stripeCustomerParams: Stripe.CustomerCreateParams = {
        email: actor.user.email,
        name: actor.user.name,
        metadata: {
          tenantId: actor.tenantId,
          leaseId: activeLease.id,
          propertyId: activeLease.unit.address.property.id,
          paymentMode: usePlatformFallback ? "platform_fallback" : "connect",
        },
      };
      const stripeCustomer = usePlatformFallback
        ? await stripe.customers.create(stripeCustomerParams)
        : await stripe.customers.create(stripeCustomerParams, { stripeAccount: connectedAccountId! });
      stripeCustomerId = stripeCustomer.id;
    }

    const transferGroup = `tenant_payment_${Date.now()}_${actor.tenantId}`;

    const payment = await prisma.$transaction(async (tx) => {
      const created = await tx.tenantPayment.create({
        data: {
          leaseId: activeLease.id,
          tenantId: actor.tenantId!,
          propertyId: activeLease.unit.address.property.id,
          amount: allocation.appliedAmount,
          paymentProvider: "stripe",
          stripeConnectedAccountId: usePlatformFallback ? null : connectedAccountId,
          stripeCustomerId,
          stripeTransferGroup: transferGroup,
          stripePaymentStatus: "checkout_created",
          stripeCustomerEmail: actor.user.email,
          memo,
          initiatedByRole: "tenant",
          initiatedFrom: usePlatformFallback ? "tenant_portal_platform_fallback" : "tenant_portal",
          status: "pending_confirmation",
        },
      });

      await tx.paymentAllocation.createMany({
        data: allocation.allocations.map((item) => ({
          tenantPaymentId: created.id,
          ledgerChargeId: item.ledgerChargeId,
          allocatedAmount: item.allocatedAmount,
          allocationOrder: item.allocationOrder,
        })),
      });

      return tx.tenantPayment.findUnique({
        where: { id: created.id },
        include: {
          lease: {
            include: { unit: { include: { address: { include: { property: true } } } } },
          },
          tenant: true,
          allocations: {
            include: {
              ledgerCharge: {
                include: { account: true },
              },
            },
            orderBy: { allocationOrder: "asc" },
          },
        },
      });
    });
    if (!payment) {
      throw new Error("Failed to create tenant payment");
    }

    const appOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim() || request.nextUrl.origin;
    const successUrl = `${appOrigin}/dashboard?payment=success`;
    const cancelUrl = `${appOrigin}/dashboard?payment=cancelled`;

    let sessionId: string;
    let checkoutUrl: string;
    try {
      const totalAmountCents = Math.round(allocation.appliedAmount * 100);
      const applicationFeeAmount = toStripeFeeAmount(totalAmountCents);
      const checkoutPaymentMethods = getCheckoutPaymentMethodTypes();
      const sessionCreateParams: Stripe.Checkout.SessionCreateParams = {
        mode: "payment",
        success_url: successUrl,
        cancel_url: cancelUrl,
        customer: stripeCustomerId ?? undefined,
        payment_method_types: checkoutPaymentMethods,
        // Keep one-time Checkout compatible while still saving for future AutoPay.
        // setup_future_usage on the PaymentIntent handles payment method reuse.
        ...(checkoutPaymentMethods.includes("us_bank_account")
          ? {
              payment_method_options: {
                us_bank_account: {
                  verification_method: "automatic",
                },
              },
            }
          : {}),
        metadata: {
          tenantPaymentId: payment.id,
          tenantId: actor.tenantId ?? "",
          leaseId: activeLease.id,
          connectedAccountId: connectedAccountId ?? "platform",
          paymentMode: usePlatformFallback ? "platform_fallback" : "connect",
        },
        payment_intent_data: {
          metadata: {
            tenantPaymentId: payment.id,
            tenantId: actor.tenantId ?? "",
            connectedAccountId: connectedAccountId ?? "platform",
            paymentMode: usePlatformFallback ? "platform_fallback" : "connect",
          },
          setup_future_usage: "off_session",
          transfer_group: transferGroup,
          ...(!usePlatformFallback && applicationFeeAmount
            ? { application_fee_amount: applicationFeeAmount }
            : {}),
        },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: getStripeCurrency(),
              unit_amount: totalAmountCents,
              product_data: {
                name: "Tenant rent payment",
                description:
                  memo ||
                  `${activeLease.unit.address.property.name} - Unit ${activeLease.unit.unitNumber}`,
              },
            },
          },
        ],
      };

      const session = usePlatformFallback
        ? await stripe.checkout.sessions.create(sessionCreateParams)
        : await stripe.checkout.sessions.create(sessionCreateParams, {
            stripeAccount: connectedAccountId!,
          });

      if (!session.url) {
        throw new Error("Stripe did not return a checkout URL");
      }

      sessionId = session.id;
      checkoutUrl = session.url;

      await prisma.tenantPayment.update({
        where: { id: payment.id },
        data: {
          stripeCheckoutSessionId: session.id,
          stripePaymentIntentId:
            typeof session.payment_intent === "string" ? session.payment_intent : null,
          stripeSetupIntentId:
            typeof session.setup_intent === "string" ? session.setup_intent : null,
          stripePaymentStatus: session.payment_status || "unpaid",
        },
      });
    } catch (stripeError) {
      // Cleanup staged payment records if checkout creation fails.
      await prisma.$transaction(async (tx) => {
        await tx.paymentAllocation.deleteMany({
          where: { tenantPaymentId: payment.id },
        });
        await tx.tenantPayment.delete({
          where: { id: payment.id },
        });
      });
      throw stripeError;
    }

    return NextResponse.json(
      {
        payment,
        checkoutUrl,
        checkoutSessionId: sessionId,
        connectedAccountId: usePlatformFallback ? null : connectedAccountId,
        usedPlatformFallback: usePlatformFallback,
        summary: {
          outstandingBefore: outstanding,
          submittedAmount: amount,
          appliedAmount: allocation.appliedAmount,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating tenant payment:", error);
    let message = "Failed to create tenant payment";
    if (error instanceof Error && error.message.includes("STRIPE_SECRET_KEY")) {
      message = "Stripe is not configured. Add STRIPE_SECRET_KEY to your environment.";
    } else if (
      error &&
      typeof error === "object" &&
      "type" in error &&
      String((error as { type?: string }).type || "").toLowerCase().includes("stripe")
    ) {
      message =
        (error as { message?: string }).message || "Stripe rejected the payment setup request.";
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
