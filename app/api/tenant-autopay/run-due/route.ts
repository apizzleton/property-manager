import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { allocateOldestFirst, computeOutstandingBalance } from "@/lib/payments";
import { computeAutopayAmount, computeNextRunAt } from "@/lib/autopay";
import {
  allowPlatformStripeFallback,
  getStripeClient,
  getStripeCurrency,
  toStripeFeeAmount,
} from "@/lib/stripe";

function isAuthorized(request: NextRequest): boolean {
  const configuredSecret = process.env.AUTOPAY_RUN_SECRET;
  const providedSecret = request.headers.get("x-autopay-secret");
  if (configuredSecret) {
    return providedSecret === configuredSecret;
  }
  return process.env.NODE_ENV !== "production";
}

/**
 * POST /api/tenant-autopay/run-due
 * Runs scheduled tenant autopay jobs. Intended for cron/scheduler use.
 */
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized autopay execution request" }, { status: 401 });
  }

  try {
    const stripe = getStripeClient();
    const now = new Date();

    const dueConfigs = await prisma.autoPayConfig.findMany({
      where: {
        enabled: true,
        nextRunAt: { lte: now },
      },
      include: {
        lease: true,
        tenant: true,
      },
      orderBy: { nextRunAt: "asc" },
    });

    const summary = {
      due: dueConfigs.length,
      attempted: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      processing: 0,
    };

    for (const config of dueConfigs) {
      const property = await prisma.property.findUnique({
        where: { id: config.propertyId },
        select: {
          stripeConnectAccountId: true,
          stripeConnectChargesEnabled: true,
          stripeConnectDetailsSubmitted: true,
        },
      });
      const accountReady =
        !!property?.stripeConnectAccountId &&
        property.stripeConnectChargesEnabled &&
        property.stripeConnectDetailsSubmitted;
      const usePlatformFallback = !accountReady && allowPlatformStripeFallback();
      if (!accountReady && !usePlatformFallback) {
        await prisma.autoPayConfig.update({
          where: { id: config.id },
          data: {
            lastRunAt: now,
            lastStatus: "stripe_connect_incomplete",
            nextRunAt: computeNextRunAt(config.dayOfMonth, now),
          },
        });
        summary.skipped += 1;
        continue;
      }

      if (
        (!usePlatformFallback && !config.stripeConnectedAccountId) ||
        !config.stripeCustomerId ||
        !config.stripePaymentMethodId
      ) {
        await prisma.autoPayConfig.update({
          where: { id: config.id },
          data: {
            lastRunAt: now,
            lastStatus: "missing_payment_method",
            nextRunAt: computeNextRunAt(config.dayOfMonth, now),
          },
        });
        summary.skipped += 1;
        continue;
      }

      const openCharges = await prisma.ledgerCharge.findMany({
        where: {
          leaseId: config.leaseId,
          tenantId: config.tenantId,
          status: { in: ["unpaid", "partially_paid"] },
        },
        orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      });
      const outstanding = computeOutstandingBalance(openCharges);
      const amount = computeAutopayAmount(outstanding, config.maxAmount);
      if (amount <= 0) {
        await prisma.autoPayConfig.update({
          where: { id: config.id },
          data: {
            lastRunAt: now,
            lastStatus: "no_balance",
            nextRunAt: computeNextRunAt(config.dayOfMonth, now),
          },
        });
        summary.skipped += 1;
        continue;
      }

      const allocation = allocateOldestFirst(openCharges, amount);
      if (allocation.appliedAmount <= 0) {
        await prisma.autoPayConfig.update({
          where: { id: config.id },
          data: {
            lastRunAt: now,
            lastStatus: "allocation_failed",
            nextRunAt: computeNextRunAt(config.dayOfMonth, now),
          },
        });
        summary.failed += 1;
        continue;
      }

      summary.attempted += 1;
      const transferGroup = `autopay_${config.id}_${Date.now()}`;
      const tenantPayment = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const created = await tx.tenantPayment.create({
          data: {
            leaseId: config.leaseId,
            tenantId: config.tenantId,
            propertyId: config.propertyId,
            autoPayConfigId: config.id,
            amount: allocation.appliedAmount,
            paymentProvider: "stripe",
            stripeConnectedAccountId: usePlatformFallback ? null : config.stripeConnectedAccountId,
            stripeCustomerId: config.stripeCustomerId,
            stripePaymentMethodId: config.stripePaymentMethodId,
            stripeTransferGroup: transferGroup,
            stripePaymentStatus: "processing",
            initiatedByRole: "tenant",
            initiatedFrom: usePlatformFallback
              ? "autopay_scheduler_platform_fallback"
              : "autopay_scheduler",
            status: "pending_confirmation",
            memo: "AutoPay monthly rent run",
            processingAttemptCount: 1,
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
        return created;
      });

      try {
        const amountCents = Math.round(allocation.appliedAmount * 100);
        const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
          amount: amountCents,
          currency: getStripeCurrency(),
          customer: config.stripeCustomerId,
          payment_method: config.stripePaymentMethodId,
          off_session: true,
          confirm: true,
          transfer_group: transferGroup,
          metadata: {
            tenantPaymentId: tenantPayment.id,
            tenantId: config.tenantId,
            autoPayConfigId: config.id,
            paymentMode: usePlatformFallback ? "platform_fallback" : "connect",
          },
        };
        if (!usePlatformFallback) {
          const fee = toStripeFeeAmount(amountCents);
          if (fee) {
            paymentIntentParams.application_fee_amount = fee;
          }
        }

        const paymentIntent = usePlatformFallback
          ? await stripe.paymentIntents.create(paymentIntentParams)
          : await stripe.paymentIntents.create(paymentIntentParams, {
              stripeAccount: config.stripeConnectedAccountId!,
            });

        const paid = paymentIntent.status === "succeeded";
        const processing = paymentIntent.status === "processing";
        await prisma.tenantPayment.update({
          where: { id: tenantPayment.id },
          data: {
            stripePaymentIntentId: paymentIntent.id,
            stripePaymentStatus: paid ? "paid" : paymentIntent.status,
            paymentCapturedAt: paid ? new Date() : null,
          },
        });

        await prisma.autoPayConfig.update({
          where: { id: config.id },
          data: {
            lastRunAt: now,
            lastStatus: paid ? "paid" : `intent_${paymentIntent.status}`,
            nextRunAt: computeNextRunAt(config.dayOfMonth, now),
          },
        });

        if (paid) {
          summary.succeeded += 1;
        } else if (processing) {
          // ACH bank debits can remain in processing until Stripe settles asynchronously.
          summary.processing += 1;
        } else {
          summary.failed += 1;
        }
      } catch (error) {
        const message =
          error instanceof Stripe.errors.StripeError
            ? `stripe_error_${error.code || error.type}`
            : "payment_intent_failed";

        await prisma.tenantPayment.update({
          where: { id: tenantPayment.id },
          data: {
            stripePaymentStatus: "failed",
            status: "rejected",
            confirmedAt: new Date(),
          },
        });
        await prisma.autoPayConfig.update({
          where: { id: config.id },
          data: {
            lastRunAt: now,
            lastStatus: message,
            nextRunAt: computeNextRunAt(config.dayOfMonth, now),
          },
        });
        summary.failed += 1;
      }
    }

    return NextResponse.json(summary);
  } catch (error) {
    console.error("Error running due autopay jobs:", error);
    return NextResponse.json({ error: "Failed to run due autopay jobs" }, { status: 500 });
  }
}
