import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/accounts — list all chart of accounts entries (hierarchical)
 */
export async function GET() {
  const accounts = await prisma.account.findMany({
    include: {
      children: true,
      journalEntryLines: {
        select: { debit: true, credit: true },
      },
    },
    orderBy: { accountNumber: "asc" },
  });
  return NextResponse.json(accounts);
}

/**
 * POST /api/accounts — create a new account
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountNumber, name, type, subType, description, parentId } = body;

    if (!accountNumber || !name || !type) {
      return NextResponse.json(
        { error: "accountNumber, name, and type are required" },
        { status: 400 }
      );
    }

    // Check for duplicate account number
    const existing = await prisma.account.findUnique({ where: { accountNumber } });
    if (existing) {
      return NextResponse.json({ error: "Account number already exists" }, { status: 400 });
    }

    const account = await prisma.account.create({
      data: {
        accountNumber,
        name,
        type,
        subType: subType || null,
        description: description || null,
        parentId: parentId || null,
      },
    });

    return NextResponse.json(account, { status: 201 });
  } catch (error) {
    console.error("Error creating account:", error);
    return NextResponse.json({ error: "Failed to create account" }, { status: 500 });
  }
}
