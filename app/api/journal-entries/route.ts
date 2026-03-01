import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDevActor } from "@/lib/devActor";
import { resolvePropertyIdsForFilter } from "@/lib/portfolioScope";
import { isBalanced } from "@/lib/accounting";

/**
 * GET /api/journal-entries — list all journal entries
 * Query: propertyId?, portfolioId?, startDate?, endDate?
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const propertyId = searchParams.get("propertyId");
  const portfolioId = searchParams.get("portfolioId");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

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

  const where: Record<string, unknown> = { ...propertyFilter };
  if (startDate || endDate) {
    where.date = {};
    if (startDate) (where.date as Record<string, unknown>).gte = new Date(startDate);
    if (endDate) (where.date as Record<string, unknown>).lte = new Date(endDate);
  }

  const entries = await prisma.journalEntry.findMany({
    where,
    include: {
      property: true,
      lines: {
        include: { account: true },
      },
    },
    orderBy: { date: "desc" },
  });
  return NextResponse.json(entries);
}

/**
 * POST /api/journal-entries — create a new journal entry
 * Body: { date, memo?, reference?, propertyId?, lines: [{accountId, debit, credit, description?}] }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { date, memo, reference, propertyId, lines } = body;

    if (!date || !lines || lines.length < 2) {
      return NextResponse.json(
        { error: "Date and at least 2 journal lines are required" },
        { status: 400 }
      );
    }

    // Validate that debits equal credits (double-entry rule)
    if (!isBalanced(lines)) {
      return NextResponse.json(
        { error: "Journal entry is not balanced. Total debits must equal total credits." },
        { status: 400 }
      );
    }

    const entry = await prisma.journalEntry.create({
      data: {
        date: new Date(date),
        memo: memo || null,
        reference: reference || null,
        propertyId: propertyId || null,
        lines: {
          create: lines.map((line: { accountId: string; debit: number; credit: number; description?: string }) => ({
            accountId: line.accountId,
            debit: parseFloat(String(line.debit)) || 0,
            credit: parseFloat(String(line.credit)) || 0,
            description: line.description || null,
          })),
        },
      },
      include: {
        property: true,
        lines: { include: { account: true } },
      },
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error("Error creating journal entry:", error);
    return NextResponse.json({ error: "Failed to create journal entry" }, { status: 500 });
  }
}
