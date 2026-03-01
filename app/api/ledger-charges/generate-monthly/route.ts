import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDevActor } from "@/lib/devActor";

function parseMonthToDueDate(monthParam: string | null): Date {
  if (!monthParam) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  const [yearStr, monthStr] = monthParam.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  if (!year || !month || month < 1 || month > 12) {
    throw new Error("Invalid month format. Use YYYY-MM.");
  }
  return new Date(year, month - 1, 1);
}

/**
 * POST /api/ledger-charges/generate-monthly?month=YYYY-MM
 * Generate monthly rent charges for all active leases.
 */
export async function POST(request: NextRequest) {
  try {
    const actor = await getDevActor(request);
    if (!actor || actor.effectiveRole !== "property_manager") {
      return NextResponse.json({ error: "Property manager context required" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const dueDate = parseMonthToDueDate(searchParams.get("month"));
    const description = `${dueDate.toLocaleString("en-US", { month: "long", year: "numeric" })} Rent Charge`;

    const revenueAccount = await prisma.account.findUnique({
      where: { accountNumber: "4100" },
    });
    if (!revenueAccount) {
      return NextResponse.json({ error: "Revenue account 4100 not found" }, { status: 400 });
    }

    const activeLeases = await prisma.lease.findMany({
      where: { status: "active" },
      include: {
        unit: {
          include: {
            address: {
              include: { property: true },
            },
          },
        },
      },
    });

    let createdCount = 0;

    for (const lease of activeLeases) {
      const exists = await prisma.ledgerCharge.findFirst({
        where: {
          leaseId: lease.id,
          dueDate,
          description,
        },
      });

      if (!exists) {
        await prisma.ledgerCharge.create({
          data: {
            leaseId: lease.id,
            tenantId: lease.tenantId,
            propertyId: lease.unit.address.property.id,
            accountId: revenueAccount.id,
            description,
            dueDate,
            amount: lease.monthlyRent,
            status: "unpaid",
          },
        });
        createdCount += 1;
      }
    }

    return NextResponse.json({
      month: dueDate.toISOString().slice(0, 7),
      description,
      activeLeases: activeLeases.length,
      createdCount,
    });
  } catch (error) {
    console.error("Error generating monthly ledger charges:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate monthly charges" },
      { status: 500 }
    );
  }
}
