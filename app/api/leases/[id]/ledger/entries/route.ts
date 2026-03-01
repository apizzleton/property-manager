import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getDevActor } from "@/lib/devActor";
import { allocateOldestFirst } from "@/lib/payments";

type EntryAction = "charge" | "payment" | "credit";

function nextLedgerStatus(amount: number, paidAmount: number): "unpaid" | "partially_paid" | "paid" {
  if (paidAmount <= 0) return "unpaid";
  if (paidAmount >= amount - 0.01) return "paid";
  return "partially_paid";
}

/**
 * POST /api/leases/:id/ledger/entries
 * PM-side manual ledger actions that DO NOT create accounting journal entries.
 * Supports posting charges, receiving payments, and issuing credits.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await getDevActor(request);
    if (!actor || actor.effectiveRole !== "property_manager") {
      return NextResponse.json({ error: "Property manager context required" }, { status: 403 });
    }

    const { id: leaseId } = await params;
    const body = await request.json();
    const action = body.action as EntryAction;

    const lease = await prisma.lease.findUnique({
      where: { id: leaseId },
      include: {
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

    if (action === "charge") {
      const description = String(body.description || "").trim();
      const amount = parseFloat(body.amount);
      const dueDate = body.dueDate ? new Date(body.dueDate) : null;

      if (!description || !amount || amount <= 0 || !dueDate || Number.isNaN(dueDate.getTime())) {
        return NextResponse.json(
          { error: "description, amount (> 0), and dueDate are required for charges" },
          { status: 400 }
        );
      }

      const revenueAccount = await prisma.account.findUnique({
        where: { accountNumber: "4100" },
      });
      if (!revenueAccount) {
        return NextResponse.json({ error: "Revenue account 4100 not found" }, { status: 400 });
      }

      const charge = await prisma.ledgerCharge.create({
        data: {
          leaseId,
          tenantId: lease.tenantId,
          propertyId: lease.unit.address.property.id,
          accountId: revenueAccount.id,
          description,
          dueDate,
          amount: parseFloat(amount.toFixed(2)),
          paidAmount: 0,
          status: "unpaid",
        },
      });

      return NextResponse.json({ action, charge }, { status: 201 });
    }

    if (action === "payment" || action === "credit") {
      const amount = parseFloat(body.amount);
      const memo = String(body.memo || "").trim() || null;
      if (!amount || amount <= 0) {
        return NextResponse.json({ error: "amount (> 0) is required" }, { status: 400 });
      }

      const openCharges = await prisma.ledgerCharge.findMany({
        where: {
          leaseId,
          status: { in: ["unpaid", "partially_paid"] },
        },
        orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      });

      const allocationResult = allocateOldestFirst(openCharges, amount);
      if (allocationResult.appliedAmount <= 0) {
        return NextResponse.json({ error: "No outstanding charges available to apply this amount" }, { status: 400 });
      }

      const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const payment = await tx.tenantPayment.create({
          data: {
            leaseId,
            tenantId: lease.tenantId,
            propertyId: lease.unit.address.property.id,
            amount: allocationResult.appliedAmount,
            paymentProvider: "manual",
            initiatedByRole: "property_manager",
            initiatedFrom: action === "credit" ? "pm_credit" : "pm_manual_receipt",
            status: "confirmed",
            memo,
            submittedAt: new Date(),
            confirmedAt: new Date(),
            confirmedByUserId: actor.user.id,
          },
        });

        await tx.paymentAllocation.createMany({
          data: allocationResult.allocations.map((a) => ({
            tenantPaymentId: payment.id,
            ledgerChargeId: a.ledgerChargeId,
            allocatedAmount: a.allocatedAmount,
            allocationOrder: a.allocationOrder,
          })),
        });

        for (const alloc of allocationResult.allocations) {
          const charge = openCharges.find((c) => c.id === alloc.ledgerChargeId);
          if (!charge) continue;
          const paidAmount = parseFloat((charge.paidAmount + alloc.allocatedAmount).toFixed(2));
          await tx.ledgerCharge.update({
            where: { id: charge.id },
            data: {
              paidAmount,
              status: nextLedgerStatus(charge.amount, paidAmount),
            },
          });
        }

        return payment;
      });

      return NextResponse.json({ action, payment: result, appliedAmount: allocationResult.appliedAmount }, { status: 201 });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    console.error("Error posting manual lease ledger entry:", error);
    return NextResponse.json({ error: "Failed to post ledger entry" }, { status: 500 });
  }
}
