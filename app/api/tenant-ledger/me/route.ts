import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDevActor } from "@/lib/devActor";
import { computeOutstandingBalance } from "@/lib/payments";

/**
 * GET /api/tenant-ledger/me
 * Returns ledger charges, payment history, and dashboard summary
 * for the active tenant context.
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
        tenant: true,
        unit: {
          include: {
            address: { include: { property: true } },
          },
        },
      },
      orderBy: { startDate: "desc" },
    });

    if (!activeLease) {
      return NextResponse.json({
        lease: null,
        summary: {
          currentBalance: 0,
          outstandingCharges: 0,
          pendingConfirmationAmount: 0,
        },
        charges: [],
        upcomingCharges: [],
        payments: [],
        autopays: [
          {
            label: "Monthly Rent AutoPay",
            status: "inactive",
            nextRun: null,
            dayOfMonth: 1,
            maxAmount: null,
            paymentMethodLast4: null,
            lastStatus: null,
          },
        ],
      });
    }

    // AutoPay is non-critical for ledger rendering; fall back gracefully if
    // Prisma client/runtime is temporarily out of sync after schema updates.
    let autoPayConfig:
      | {
          enabled: boolean;
          nextRunAt: Date | null;
          dayOfMonth: number;
          maxAmount: number | null;
          stripePaymentMethodId: string | null;
          lastStatus: string | null;
        }
      | null = null;
    try {
      autoPayConfig = await prisma.autoPayConfig.findUnique({
        where: {
          leaseId_tenantId: {
            leaseId: activeLease.id,
            tenantId: actor.tenantId,
          },
        },
        select: {
          enabled: true,
          nextRunAt: true,
          dayOfMonth: true,
          maxAmount: true,
          stripePaymentMethodId: true,
          lastStatus: true,
        },
      });
    } catch (autoPayError) {
      console.warn(
        "AutoPay lookup failed in tenant ledger route; returning fallback autopay state.",
        autoPayError
      );
    }

    const charges = await prisma.ledgerCharge.findMany({
      where: {
        leaseId: activeLease.id,
        tenantId: actor.tenantId,
      },
      include: {
        account: true,
        allocations: {
          include: { tenantPayment: true },
        },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    });

    const payments = await prisma.tenantPayment.findMany({
      where: { leaseId: activeLease.id, tenantId: actor.tenantId },
      include: {
        allocations: {
          include: {
            ledgerCharge: { include: { account: true } },
          },
          orderBy: { allocationOrder: "asc" },
        },
      },
      orderBy: { submittedAt: "desc" },
    });

    const pendingConfirmationAmount = payments
      .filter((p) => p.status === "pending_confirmation")
      .reduce((sum, p) => sum + p.amount, 0);
    const outstandingCharges = computeOutstandingBalance(charges);

    const upcomingCharges = charges
      .filter((charge) => charge.status !== "paid")
      .slice(0, 5);

    return NextResponse.json({
      lease: {
        id: activeLease.id,
        startDate: activeLease.startDate,
        endDate: activeLease.endDate,
        monthlyRent: activeLease.monthlyRent,
        deposit: activeLease.deposit,
        tenantName: `${activeLease.tenant.firstName} ${activeLease.tenant.lastName}`,
        unitNumber: activeLease.unit.unitNumber,
        propertyName: activeLease.unit.address.property.name,
      },
      summary: {
        currentBalance: outstandingCharges,
        outstandingCharges,
        pendingConfirmationAmount,
      },
      charges: charges.map((charge) => ({
        id: charge.id,
        description: charge.description,
        dueDate: charge.dueDate,
        amount: charge.amount,
        paidAmount: charge.paidAmount,
        status: charge.status,
        account: {
          id: charge.account.id,
          accountNumber: charge.account.accountNumber,
          name: charge.account.name,
        },
        pendingAppliedAmount: charge.allocations
          .filter((a) => a.tenantPayment.status === "pending_confirmation")
          .reduce((sum, a) => sum + a.allocatedAmount, 0),
      })),
      upcomingCharges: upcomingCharges.map((charge) => ({
        id: charge.id,
        description: charge.description,
        dueDate: charge.dueDate,
        amount: charge.amount - charge.paidAmount,
      })),
      payments,
      autopays: [
        {
          label: "Monthly Rent AutoPay",
          status: autoPayConfig?.enabled ? "active" : "inactive",
          nextRun: autoPayConfig?.nextRunAt || null,
          dayOfMonth: autoPayConfig?.dayOfMonth ?? 1,
          maxAmount: autoPayConfig?.maxAmount ?? null,
          paymentMethodLast4: autoPayConfig?.stripePaymentMethodId?.slice(-4) ?? null,
          lastStatus: autoPayConfig?.lastStatus ?? null,
        },
      ],
    });
  } catch (error) {
    console.error("Error fetching tenant ledger:", error);
    return NextResponse.json({ error: "Failed to fetch tenant ledger" }, { status: 500 });
  }
}
