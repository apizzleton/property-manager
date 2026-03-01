import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDevActor } from "@/lib/devActor";
import { computeOutstandingBalance } from "@/lib/payments";

/**
 * GET /api/leases/:id/ledger
 * Returns ledger charges, payments, and summary for a lease (PM-side).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getDevActor(request);
    if (!actor || actor.effectiveRole !== "property_manager") {
      return NextResponse.json({ error: "Property manager context required" }, { status: 403 });
    }

    const { id: leaseId } = await params;

    const lease = await prisma.lease.findUnique({
      where: { id: leaseId },
      include: {
        tenant: true,
        unit: {
          include: {
            address: { include: { property: true } },
          },
        },
      },
    });

    if (!lease) {
      return NextResponse.json({ error: "Lease not found" }, { status: 404 });
    }

    const charges = await prisma.ledgerCharge.findMany({
      where: { leaseId },
      include: {
        account: true,
        allocations: {
          include: { tenantPayment: true },
        },
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    });

    const payments = await prisma.tenantPayment.findMany({
      where: { leaseId },
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

    return NextResponse.json({
      lease: {
        id: lease.id,
        startDate: lease.startDate,
        endDate: lease.endDate,
        monthlyRent: lease.monthlyRent,
        deposit: lease.deposit,
        status: lease.status,
        tenantName: `${lease.tenant.firstName} ${lease.tenant.lastName}`,
        tenantEmail: lease.tenant.email,
        unitNumber: lease.unit.unitNumber,
        propertyName: lease.unit.address.property.name,
        address: `${lease.unit.address.street}, ${lease.unit.address.city}`,
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
      payments: payments.map((p) => ({
        id: p.id,
        amount: p.amount,
        status: p.status,
        submittedAt: p.submittedAt,
        confirmedAt: p.confirmedAt,
        memo: p.memo,
        allocations: p.allocations.map((a) => ({
          ledgerChargeDescription: a.ledgerCharge.description,
          allocatedAmount: a.allocatedAmount,
          account: {
            accountNumber: a.ledgerCharge.account.accountNumber,
            name: a.ledgerCharge.account.name,
          },
        })),
      })),
    });
  } catch (error) {
    console.error("Error fetching lease ledger:", error);
    return NextResponse.json({ error: "Failed to fetch lease ledger" }, { status: 500 });
  }
}
