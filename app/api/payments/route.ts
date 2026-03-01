import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDevActor } from "@/lib/devActor";
import { resolvePropertyIdsForFilter } from "@/lib/portfolioScope";

/**
 * POST /api/payments — record a rent payment or expense, auto-creating a journal entry
 * Body: { type: "rent" | "expense", amount, date, propertyId, memo?,
 *         tenantId? (for rent), expenseAccountId? (for expense) }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, amount, date, propertyId, memo, tenantId, expenseAccountId, reference } = body;

    if (!type || !amount || !date) {
      return NextResponse.json({ error: "type, amount, and date are required" }, { status: 400 });
    }

    const parsedAmount = parseFloat(amount);
    if (parsedAmount <= 0) {
      return NextResponse.json({ error: "Amount must be positive" }, { status: 400 });
    }

    // Look up standard accounts by account number
    const cashAccount = await prisma.account.findUnique({ where: { accountNumber: "1110" } }); // Operating Cash
    const rentalIncomeAccount = await prisma.account.findUnique({ where: { accountNumber: "4100" } }); // Rental Income
    const rentReceivableAccount = await prisma.account.findUnique({ where: { accountNumber: "1210" } }); // Rent Receivable

    if (!cashAccount) {
      return NextResponse.json({ error: "Cash account (1110) not found. Run seed." }, { status: 400 });
    }

    let journalLines;

    if (type === "rent") {
      // Rent payment: Debit Cash, Credit Rental Income
      if (!rentalIncomeAccount) {
        return NextResponse.json({ error: "Rental Income account (4100) not found." }, { status: 400 });
      }

      const tenantName = tenantId
        ? await prisma.tenant.findUnique({ where: { id: tenantId }, select: { firstName: true, lastName: true } })
        : null;
      const tenantLabel = tenantName ? `${tenantName.firstName} ${tenantName.lastName}` : "Unknown";

      journalLines = [
        { accountId: cashAccount.id, debit: parsedAmount, credit: 0, description: `Rent payment from ${tenantLabel}` },
        { accountId: rentalIncomeAccount.id, debit: 0, credit: parsedAmount, description: `Rental income — ${tenantLabel}` },
      ];
    } else if (type === "expense") {
      // Expense payment: Debit Expense Account, Credit Cash
      if (!expenseAccountId) {
        return NextResponse.json({ error: "expenseAccountId is required for expenses" }, { status: 400 });
      }
      journalLines = [
        { accountId: expenseAccountId, debit: parsedAmount, credit: 0, description: memo || "Expense" },
        { accountId: cashAccount.id, debit: 0, credit: parsedAmount, description: "Cash paid" },
      ];
    } else if (type === "deposit") {
      // Security deposit: Debit Security Deposit Cash, Credit Security Deposits Held
      const depositCash = await prisma.account.findUnique({ where: { accountNumber: "1120" } });
      const depositLiability = await prisma.account.findUnique({ where: { accountNumber: "2200" } });
      if (!depositCash || !depositLiability) {
        return NextResponse.json({ error: "Security deposit accounts not found." }, { status: 400 });
      }
      journalLines = [
        { accountId: depositCash.id, debit: parsedAmount, credit: 0, description: "Security deposit received" },
        { accountId: depositLiability.id, debit: 0, credit: parsedAmount, description: "Security deposit held" },
      ];
    } else {
      return NextResponse.json({ error: "Invalid payment type. Use 'rent', 'expense', or 'deposit'." }, { status: 400 });
    }

    // Create the journal entry with lines
    const entry = await prisma.journalEntry.create({
      data: {
        date: new Date(date),
        memo: memo || `${type.charAt(0).toUpperCase() + type.slice(1)} payment`,
        reference: reference || null,
        propertyId: propertyId || null,
        lines: { create: journalLines },
      },
      include: {
        lines: { include: { account: true } },
        property: true,
      },
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error("Error recording payment:", error);
    return NextResponse.json({ error: "Failed to record payment" }, { status: 500 });
  }
}

/**
 * GET /api/payments — get payment history (all journal entries classified as payments)
 * Query: propertyId?, portfolioId?
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const propertyId = searchParams.get("propertyId");
  const portfolioId = searchParams.get("portfolioId");

  let propertyFilter: { propertyId?: string | { in: string[] } } = {};
  if (portfolioId) {
    const actor = await getDevActor(request);
    if (!actor) {
      return NextResponse.json({ error: "No development user found. Run the seed script." }, { status: 400 });
    }
    const ids = await resolvePropertyIdsForFilter(actor.user.id, portfolioId, propertyId);
    if (ids !== null) {
      propertyFilter = ids.length === 0 ? { propertyId: { in: [] } } : { propertyId: { in: ids } };
    }
  } else if (propertyId) {
    propertyFilter = { propertyId };
  }

  // Get all journal entries involving cash accounts (1110, 1120)
  const entries = await prisma.journalEntry.findMany({
    where: {
      ...propertyFilter,
      lines: {
        some: {
          account: {
            accountNumber: { in: ["1110", "1120"] },
          },
        },
      },
    },
    include: {
      property: true,
      lines: { include: { account: true } },
    },
    orderBy: { date: "desc" },
  });

  return NextResponse.json(entries);
}
