import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDevActor } from "@/lib/devActor";
import { computeNextRunAt, normalizeAutopayDay } from "@/lib/autopay";
import { allowPlatformStripeFallback } from "@/lib/stripe";

function serializeAutopay(config: {
  id: string;
  enabled: boolean;
  dayOfMonth: number;
  maxAmount: number | null;
  nextRunAt: Date | null;
  lastRunAt: Date | null;
  lastStatus: string | null;
  stripePaymentMethodId: string | null;
}) {
  return {
    id: config.id,
    enabled: config.enabled,
    dayOfMonth: config.dayOfMonth,
    maxAmount: config.maxAmount,
    nextRunAt: config.nextRunAt,
    lastRunAt: config.lastRunAt,
    lastStatus: config.lastStatus,
    paymentMethodLast4: config.stripePaymentMethodId?.slice(-4) ?? null,
  };
}

/**
 * GET /api/tenant-autopay/me
 * Return autopay configuration for current tenant active lease.
 */
export async function GET(request: NextRequest) {
  try {
    const actor = await getDevActor(request);
    if (!actor || actor.effectiveRole !== "tenant" || !actor.tenantId) {
      return NextResponse.json({ error: "Tenant context required" }, { status: 403 });
    }

    const activeLease = await prisma.lease.findFirst({
      where: { tenantId: actor.tenantId, status: "active" },
      include: {
        unit: {
          include: {
            address: { include: { property: true } },
          },
        },
      },
      orderBy: { startDate: "desc" },
    });
    if (!activeLease) {
      return NextResponse.json({ autopay: null });
    }

    const config = await prisma.autoPayConfig.findUnique({
      where: {
        leaseId_tenantId: {
          leaseId: activeLease.id,
          tenantId: actor.tenantId,
        },
      },
    });

    if (!config) {
      return NextResponse.json({
        autopay: {
          enabled: false,
          dayOfMonth: 1,
          maxAmount: null,
          nextRunAt: null,
          lastRunAt: null,
          lastStatus: null,
          paymentMethodLast4: null,
        },
      });
    }

    return NextResponse.json({ autopay: serializeAutopay(config) });
  } catch (error) {
    console.error("Error fetching tenant autopay:", error);
    return NextResponse.json({ error: "Failed to fetch autopay configuration" }, { status: 500 });
  }
}

/**
 * PUT /api/tenant-autopay/me
 * Body: { enabled: boolean, dayOfMonth?: number, maxAmount?: number | null }
 */
export async function PUT(request: NextRequest) {
  try {
    const actor = await getDevActor(request);
    if (!actor || actor.effectiveRole !== "tenant" || !actor.tenantId) {
      return NextResponse.json({ error: "Tenant context required" }, { status: 403 });
    }

    const activeLease = await prisma.lease.findFirst({
      where: { tenantId: actor.tenantId, status: "active" },
      include: {
        unit: {
          include: {
            address: { include: { property: true } },
          },
        },
      },
      orderBy: { startDate: "desc" },
    });
    if (!activeLease) {
      return NextResponse.json({ error: "No active lease found" }, { status: 400 });
    }

    const body = await request.json();
    const enabled = Boolean(body.enabled);
    const dayOfMonth = normalizeAutopayDay(Number(body.dayOfMonth ?? 1));
    const maxAmount =
      body.maxAmount === null || body.maxAmount === undefined
        ? null
        : parseFloat(body.maxAmount);
    if (maxAmount !== null && (!Number.isFinite(maxAmount) || maxAmount <= 0)) {
      return NextResponse.json({ error: "maxAmount must be a positive number" }, { status: 400 });
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
        ? "Property is not configured with a Stripe connected account"
        : "Property Stripe onboarding is incomplete. AutoPay cannot be enabled yet.";
      return NextResponse.json({ error }, { status: 400 });
    }
    const accountScopeId = usePlatformFallback ? null : connectedAccountId!;

    let stripeCustomerId: string | null = null;
    let stripePaymentMethodId: string | null = null;
    if (enabled) {
      const latestPayMethod = await prisma.tenantPayment.findFirst({
        where: {
          tenantId: actor.tenantId,
          propertyId: activeLease.unit.address.property.id,
          stripeConnectedAccountId: accountScopeId,
          stripeCustomerId: { not: null },
          stripePaymentMethodId: { not: null },
          stripePaymentStatus: "paid",
        },
        orderBy: { submittedAt: "desc" },
        select: {
          stripeCustomerId: true,
          stripePaymentMethodId: true,
        },
      });

      if (!latestPayMethod?.stripeCustomerId || !latestPayMethod.stripePaymentMethodId) {
        return NextResponse.json(
          {
            error:
              "No saved Stripe payment method found yet. Complete one successful checkout first.",
          },
          { status: 400 }
        );
      }
      stripeCustomerId = latestPayMethod.stripeCustomerId;
      stripePaymentMethodId = latestPayMethod.stripePaymentMethodId;
    }

    const updated = await prisma.autoPayConfig.upsert({
      where: {
        leaseId_tenantId: {
          leaseId: activeLease.id,
          tenantId: actor.tenantId,
        },
      },
      create: {
        leaseId: activeLease.id,
        tenantId: actor.tenantId,
        propertyId: activeLease.unit.address.property.id,
        enabled,
        dayOfMonth,
        maxAmount,
        stripeConnectedAccountId: accountScopeId,
        stripeCustomerId,
        stripePaymentMethodId,
        nextRunAt: enabled ? computeNextRunAt(dayOfMonth) : null,
        lastStatus: enabled ? "scheduled" : "disabled",
      },
      update: {
        enabled,
        dayOfMonth,
        maxAmount,
        stripeConnectedAccountId: accountScopeId,
        stripeCustomerId: enabled ? stripeCustomerId : null,
        stripePaymentMethodId: enabled ? stripePaymentMethodId : null,
        nextRunAt: enabled ? computeNextRunAt(dayOfMonth) : null,
        lastStatus: enabled ? "scheduled" : "disabled",
      },
    });

    return NextResponse.json({ autopay: serializeAutopay(updated) });
  } catch (error) {
    console.error("Error updating tenant autopay:", error);
    return NextResponse.json({ error: "Failed to update autopay configuration" }, { status: 500 });
  }
}
