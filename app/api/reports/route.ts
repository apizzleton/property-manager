import { NextRequest, NextResponse } from "next/server";
import { endOfDay, startOfDay } from "date-fns";
import { prisma } from "@/lib/prisma";
import { getDevActor } from "@/lib/devActor";
import { resolvePropertyIdsForFilter } from "@/lib/portfolioScope";
import { accountBalance, normalBalance } from "@/lib/accounting";

/** Parse date string to start/end of day so entries on the selected date are included. */
function parseReportDateRange(startDate: string | null, endDate: string | null) {
  const range: { gte?: Date; lte?: Date } = {};
  if (startDate) range.gte = startOfDay(new Date(startDate + "T12:00:00"));
  if (endDate) range.lte = endOfDay(new Date(endDate + "T12:00:00"));
  return range;
}

/**
 * GET /api/reports?type=...&startDate=...&endDate=...&propertyId=...&portfolioId=...
 * Supported types: trial-balance, profit-loss, balance-sheet, cash-flow, general-ledger, rent-roll
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const asOfDate = searchParams.get("asOfDate");
  const compareAsOfDate = searchParams.get("compareAsOfDate");
  const propertyId = searchParams.get("propertyId");
  const portfolioId = searchParams.get("portfolioId");
  const accountId = searchParams.get("accountId");

  if (!type) {
    return NextResponse.json({ error: "Report type is required" }, { status: 400 });
  }

  // Resolve effective property IDs when portfolioId is used
  let effectivePropertyIds: string[] | null = propertyId ? [propertyId] : null;
  if (portfolioId) {
    const actor = await getDevActor(request);
    if (!actor) {
      return NextResponse.json({ error: "No development user found. Run the seed script." }, { status: 400 });
    }
    effectivePropertyIds = await resolvePropertyIdsForFilter(actor.user.id, portfolioId, propertyId);
  }

  try {
    switch (type) {
      case "trial-balance":
        return NextResponse.json(await getTrialBalance(startDate, endDate, effectivePropertyIds));
      case "profit-loss":
        return NextResponse.json(await getProfitAndLoss(startDate, endDate, effectivePropertyIds));
      case "balance-sheet":
        return NextResponse.json(await getBalanceSheet(endDate, effectivePropertyIds));
      case "cash-flow":
        return NextResponse.json(await getCashFlow(startDate, endDate, effectivePropertyIds));
      case "general-ledger":
        return NextResponse.json(await getGeneralLedger(accountId, startDate, endDate, effectivePropertyIds));
      case "rent-roll":
        return NextResponse.json(await getRentRoll(asOfDate, compareAsOfDate, effectivePropertyIds));
      default:
        return NextResponse.json({ error: "Unknown report type" }, { status: 400 });
    }
  } catch (error) {
    console.error("Error generating report:", error);
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }
}

/** Build property filter for journal entries */
function journalPropertyFilter(propertyIds: string[] | null) {
  if (propertyIds === null) return {};
  if (propertyIds.length === 0) return { propertyId: { in: [] } };
  return { propertyId: { in: propertyIds } };
}

// ── Trial Balance ─────────────────────────────────────────────────────────
async function getTrialBalance(startDate: string | null, endDate: string | null, propertyIds: string[] | null) {
  const dateFilter = parseReportDateRange(startDate, endDate);

  const accounts = await prisma.account.findMany({
    where: { isActive: true },
    include: {
      journalEntryLines: {
        where: {
          journalEntry: {
            ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
            ...journalPropertyFilter(propertyIds),
          },
        },
      },
    },
    orderBy: { accountNumber: "asc" },
  });

  let totalDebits = 0;
  let totalCredits = 0;

  const rows = accounts
    .map((acct) => {
      const balance = accountBalance(acct.journalEntryLines, acct.type);
      const isDebitNormal = normalBalance(acct.type) === "debit";
      const debit = isDebitNormal ? balance : 0;
      const credit = !isDebitNormal ? balance : 0;
      totalDebits += debit;
      totalCredits += credit;
      return {
        accountNumber: acct.accountNumber,
        accountName: acct.name,
        type: acct.type,
        debit,
        credit,
        balance,
      };
    })
    .filter((row) => row.balance !== 0); // Only show accounts with activity

  return { rows, totalDebits, totalCredits, isBalanced: Math.abs(totalDebits - totalCredits) < 0.01 };
}

// ── Profit & Loss ─────────────────────────────────────────────────────────
async function getProfitAndLoss(startDate: string | null, endDate: string | null, propertyIds: string[] | null) {
  const dateFilter = parseReportDateRange(startDate, endDate);

  const accounts = await prisma.account.findMany({
    where: { type: { in: ["Revenue", "Expense"] }, isActive: true },
    include: {
      journalEntryLines: {
        where: {
          journalEntry: {
            ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
            ...journalPropertyFilter(propertyIds),
          },
        },
      },
    },
    orderBy: { accountNumber: "asc" },
  });

  const revenue: { name: string; number: string; amount: number }[] = [];
  const expenses: { name: string; number: string; amount: number }[] = [];
  let totalRevenue = 0;
  let totalExpenses = 0;

  accounts.forEach((acct) => {
    const bal = accountBalance(acct.journalEntryLines, acct.type);
    if (bal === 0) return;

    if (acct.type === "Revenue") {
      revenue.push({ name: acct.name, number: acct.accountNumber, amount: bal });
      totalRevenue += bal;
    } else {
      expenses.push({ name: acct.name, number: acct.accountNumber, amount: bal });
      totalExpenses += bal;
    }
  });

  return { revenue, expenses, totalRevenue, totalExpenses, netIncome: totalRevenue - totalExpenses };
}

// ── Balance Sheet ─────────────────────────────────────────────────────────
async function getBalanceSheet(endDate: string | null, propertyIds: string[] | null) {
  const dateFilter = parseReportDateRange(null, endDate);

  const accounts = await prisma.account.findMany({
    where: { type: { in: ["Asset", "Liability", "Equity"] }, isActive: true },
    include: {
      journalEntryLines: {
        where: {
          journalEntry: {
            ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
            ...journalPropertyFilter(propertyIds),
          },
        },
      },
    },
    orderBy: { accountNumber: "asc" },
  });

  const assets: { name: string; number: string; amount: number }[] = [];
  const liabilities: { name: string; number: string; amount: number }[] = [];
  const equity: { name: string; number: string; amount: number }[] = [];
  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalEquity = 0;

  accounts.forEach((acct) => {
    const bal = accountBalance(acct.journalEntryLines, acct.type);
    if (bal === 0) return;

    if (acct.type === "Asset") {
      assets.push({ name: acct.name, number: acct.accountNumber, amount: bal });
      totalAssets += bal;
    } else if (acct.type === "Liability") {
      liabilities.push({ name: acct.name, number: acct.accountNumber, amount: bal });
      totalLiabilities += bal;
    } else {
      equity.push({ name: acct.name, number: acct.accountNumber, amount: bal });
      totalEquity += bal;
    }
  });

  return {
    assets, liabilities, equity,
    totalAssets, totalLiabilities, totalEquity,
    isBalanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
  };
}

// ── Cash Flow ─────────────────────────────────────────────────────────────
async function getCashFlow(startDate: string | null, endDate: string | null, propertyIds: string[] | null) {
  const dateFilter = parseReportDateRange(startDate, endDate);

  // Get all journal lines for cash-type accounts (1100 series)
  const cashLines = await prisma.journalEntryLine.findMany({
    where: {
      account: { accountNumber: { startsWith: "11" } },
      journalEntry: {
        ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
        ...journalPropertyFilter(propertyIds),
      },
    },
    include: {
      journalEntry: {
        include: { lines: { include: { account: true } } },
      },
      account: true,
    },
  });

  // Categorize cash flows
  let operating = 0;
  let investing = 0;
  let financing = 0;
  const details: { date: string; memo: string; amount: number; category: string }[] = [];

  cashLines.forEach((line) => {
    const amount = line.debit - line.credit; // Positive = cash in, negative = cash out
    const entry = line.journalEntry;

    // Classify based on the OTHER accounts in the entry
    const otherLines = entry.lines.filter((l) => l.id !== line.id);
    const otherTypes = otherLines.map((l) => l.account.type);

    let category = "Operating";
    if (otherTypes.includes("Asset") && otherLines.some((l) => l.account.accountNumber.startsWith("14"))) {
      category = "Investing";
    } else if (otherTypes.includes("Liability") && otherLines.some((l) => l.account.accountNumber.startsWith("23"))) {
      category = "Financing";
    } else if (otherTypes.includes("Equity")) {
      category = "Financing";
    }

    if (category === "Operating") operating += amount;
    else if (category === "Investing") investing += amount;
    else financing += amount;

    details.push({
      date: entry.date.toISOString(),
      memo: entry.memo || "No description",
      amount,
      category,
    });
  });

  return { operating, investing, financing, netChange: operating + investing + financing, details };
}

// ── General Ledger ────────────────────────────────────────────────────────
async function getGeneralLedger(
  accountId: string | null,
  startDate: string | null,
  endDate: string | null,
  propertyIds: string[] | null
) {
  const dateFilter = parseReportDateRange(startDate, endDate);
  const where: Record<string, unknown> = {};
  if (accountId) where.accountId = accountId;

  const lines = await prisma.journalEntryLine.findMany({
    where: {
      ...where,
      journalEntry: {
        ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
        ...journalPropertyFilter(propertyIds),
      },
    },
    include: {
      account: true,
      journalEntry: { include: { property: true } },
    },
    orderBy: { journalEntry: { date: "asc" } },
  });

  return { lines };
}

// ── Rent Roll ─────────────────────────────────────────────────────────────
function rentRollPropertyFilter(propertyIds: string[] | null) {
  if (propertyIds === null) return {};
  if (propertyIds.length === 0) return { unit: { address: { propertyId: { in: [] } } } };
  return { unit: { address: { propertyId: { in: propertyIds } } } };
}

async function buildRentRollSnapshot(asOfDate: string | null, propertyIds: string[] | null) {
  const asOf = asOfDate ? endOfDay(new Date(asOfDate + "T12:00:00")) : endOfDay(new Date());
  const leases = await prisma.lease.findMany({
    where: {
      startDate: { lte: asOf },
      OR: [{ endDate: null }, { endDate: { gte: asOf } }],
      ...rentRollPropertyFilter(propertyIds),
    },
    include: {
      tenant: true,
      unit: {
        include: {
          address: { include: { property: true } },
        },
      },
    },
    orderBy: { unit: { address: { property: { name: "asc" } } } },
  });

  const rows = leases.map((lease) => ({
    property: lease.unit.address.property.name,
    address: `${lease.unit.address.street}, ${lease.unit.address.city}`,
    unit: lease.unit.unitNumber,
    tenant: `${lease.tenant.firstName} ${lease.tenant.lastName}`,
    monthlyRent: lease.monthlyRent,
    deposit: lease.deposit,
    leaseStart: lease.startDate,
    leaseEnd: lease.endDate,
  }));

  const totalMonthlyRent = rows.reduce((sum, r) => sum + r.monthlyRent, 0);
  const annualizedRent = totalMonthlyRent * 12;

  return {
    asOfDate: asOf.toISOString(),
    rows,
    totalMonthlyRent,
    annualizedRent,
  };
}

async function getRentRoll(
  asOfDate: string | null,
  compareAsOfDate: string | null,
  propertyIds: string[] | null
) {
  const current = await buildRentRollSnapshot(asOfDate, propertyIds);
  if (!compareAsOfDate) return current;

  const compare = await buildRentRollSnapshot(compareAsOfDate, propertyIds);
  return {
    ...current,
    comparison: {
      ...compare,
      deltaMonthlyRent: current.totalMonthlyRent - compare.totalMonthlyRent,
      deltaAnnualizedRent: current.annualizedRent - compare.annualizedRent,
    },
  };
}
