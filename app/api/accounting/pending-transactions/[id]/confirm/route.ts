import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDevActor } from "@/lib/devActor";
import { buildConfirmationJournalLines } from "@/lib/payments";
import { isBalanced } from "@/lib/accounting";

/**
 * POST /api/accounting/pending-transactions/:id/confirm
 * Confirm pending tenant payment and post accounting journal entry.
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

    const { id } = await params;

    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.tenantPayment.findUnique({
        where: { id },
        include: {
          tenant: true,
          property: true,
          allocations: {
            include: {
              ledgerCharge: {
                include: { account: true },
              },
            },
          },
        },
      });

      if (!payment || payment.status !== "pending_confirmation") {
        throw new Error("Pending transaction not found");
      }
      if (payment.paymentProvider === "stripe") {
        const isCaptured = payment.stripePaymentStatus === "paid" && !!payment.paymentCapturedAt;
        if (!isCaptured) {
          throw new Error("Stripe payment is not captured yet and cannot be confirmed");
        }
      }

      const settlementAccountNumber =
        payment.property.accountingBasis === "accrual" ? "1130" : "1110";
      const settlementAccount = await tx.account.findUnique({
        where: { accountNumber: settlementAccountNumber },
      });

      if (!settlementAccount) {
        throw new Error(
          settlementAccountNumber === "1130"
            ? "Undeposited Funds account (1130) not found"
            : "Operating Cash account (1110) not found"
        );
      }

      const revenueByAccount = new Map<
        string,
        { accountNumber: string; accountName: string; amount: number }
      >();

      for (const allocation of payment.allocations) {
        const key = allocation.ledgerCharge.accountId;
        const existing = revenueByAccount.get(key);
        if (existing) {
          existing.amount += allocation.allocatedAmount;
        } else {
          revenueByAccount.set(key, {
            accountNumber: allocation.ledgerCharge.account.accountNumber,
            accountName: allocation.ledgerCharge.account.name,
            amount: allocation.allocatedAmount,
          });
        }
      }

      const journalLines = buildConfirmationJournalLines(
        settlementAccount.id,
        [...revenueByAccount.entries()].map(([accountId, value]) => ({
          accountId,
          accountNumber: value.accountNumber,
          accountName: value.accountName,
          amount: value.amount,
        }))
      );

      if (!isBalanced(journalLines)) {
        throw new Error("Generated journal lines are not balanced");
      }

      const postedEntry = await tx.journalEntry.create({
        data: {
          date: new Date(),
          memo: `Tenant payment confirmed — ${payment.tenant.firstName} ${payment.tenant.lastName}`,
          reference: payment.id,
          propertyId: payment.propertyId,
          lines: {
            create: journalLines.map((line) => ({
              accountId: line.accountId,
              debit: line.debit,
              credit: line.credit,
              description: line.description,
            })),
          },
        },
      });

      for (const allocation of payment.allocations) {
        const current = allocation.ledgerCharge.paidAmount;
        const nextPaid = parseFloat((current + allocation.allocatedAmount).toFixed(2));
        const total = allocation.ledgerCharge.amount;
        const status =
          nextPaid >= total - 0.01
            ? "paid"
            : nextPaid > 0
              ? "partially_paid"
              : "unpaid";

        await tx.ledgerCharge.update({
          where: { id: allocation.ledgerChargeId },
          data: {
            paidAmount: nextPaid,
            status,
          },
        });
      }

      return tx.tenantPayment.update({
        where: { id: payment.id },
        data: {
          status: "confirmed",
          confirmedAt: new Date(),
          confirmedByUserId: actor.user.id,
          journalEntryId: postedEntry.id,
        },
        include: {
          allocations: true,
          journalEntry: true,
        },
      });
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error confirming pending transaction:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to confirm transaction" },
      { status: 500 }
    );
  }
}
