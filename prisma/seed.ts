/**
 * Database Seed Script
 * Seeds the default Chart of Accounts for property management
 * and creates a demo admin user.
 *
 * Run with: npx tsx prisma/seed.ts
 */

// Use @prisma/client since seed runs outside Next.js (no path aliases)
import "dotenv/config";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { hashSync } from "bcryptjs";

// Set up the SQLite adapter pointing to the dev database at project root
const dbPath = path.join(process.cwd(), "dev.db");
const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
const prisma = new PrismaClient({ adapter });

// Default Chart of Accounts for property management
const chartOfAccounts = [
  // ── ASSETS (1000s) ──────────────────────────────────────────────────────
  { number: "1000", name: "Assets", type: "Asset", subType: null, parent: null },
  { number: "1100", name: "Cash and Cash Equivalents", type: "Asset", subType: "Current Asset", parent: "1000" },
  { number: "1110", name: "Operating Cash Account", type: "Asset", subType: "Current Asset", parent: "1100" },
  { number: "1120", name: "Security Deposit Cash Account", type: "Asset", subType: "Current Asset", parent: "1100" },
  { number: "1130", name: "Undeposited Funds", type: "Asset", subType: "Current Asset", parent: "1100" },
  { number: "1200", name: "Accounts Receivable", type: "Asset", subType: "Current Asset", parent: "1000" },
  { number: "1210", name: "Rent Receivable", type: "Asset", subType: "Current Asset", parent: "1200" },
  { number: "1220", name: "Other Receivable", type: "Asset", subType: "Current Asset", parent: "1200" },
  { number: "1300", name: "Prepaid Expenses", type: "Asset", subType: "Current Asset", parent: "1000" },
  { number: "1400", name: "Fixed Assets", type: "Asset", subType: "Fixed Asset", parent: "1000" },
  { number: "1410", name: "Buildings", type: "Asset", subType: "Fixed Asset", parent: "1400" },
  { number: "1420", name: "Land", type: "Asset", subType: "Fixed Asset", parent: "1400" },
  { number: "1430", name: "Equipment", type: "Asset", subType: "Fixed Asset", parent: "1400" },
  { number: "1440", name: "Accumulated Depreciation", type: "Asset", subType: "Contra Asset", parent: "1400" },

  // ── LIABILITIES (2000s) ─────────────────────────────────────────────────
  { number: "2000", name: "Liabilities", type: "Liability", subType: null, parent: null },
  { number: "2100", name: "Accounts Payable", type: "Liability", subType: "Current Liability", parent: "2000" },
  { number: "2200", name: "Security Deposits Held", type: "Liability", subType: "Current Liability", parent: "2000" },
  { number: "2300", name: "Mortgage Payable", type: "Liability", subType: "Long-Term Liability", parent: "2000" },
  { number: "2400", name: "Other Liabilities", type: "Liability", subType: "Current Liability", parent: "2000" },

  // ── EQUITY (3000s) ──────────────────────────────────────────────────────
  { number: "3000", name: "Equity", type: "Equity", subType: null, parent: null },
  { number: "3100", name: "Owner's Equity", type: "Equity", subType: "Owner's Equity", parent: "3000" },
  { number: "3200", name: "Retained Earnings", type: "Equity", subType: "Retained Earnings", parent: "3000" },

  // ── REVENUE (4000s) ─────────────────────────────────────────────────────
  { number: "4000", name: "Revenue", type: "Revenue", subType: null, parent: null },
  { number: "4100", name: "Rental Income", type: "Revenue", subType: "Operating Revenue", parent: "4000" },
  { number: "4200", name: "Late Fee Income", type: "Revenue", subType: "Operating Revenue", parent: "4000" },
  { number: "4300", name: "Application Fee Income", type: "Revenue", subType: "Operating Revenue", parent: "4000" },
  { number: "4400", name: "Parking Income", type: "Revenue", subType: "Operating Revenue", parent: "4000" },
  { number: "4500", name: "Laundry Income", type: "Revenue", subType: "Operating Revenue", parent: "4000" },
  { number: "4900", name: "Other Income", type: "Revenue", subType: "Other Revenue", parent: "4000" },

  // ── EXPENSES (5000s) ────────────────────────────────────────────────────
  { number: "5000", name: "Expenses", type: "Expense", subType: null, parent: null },
  { number: "5100", name: "Maintenance & Repairs", type: "Expense", subType: "Operating Expense", parent: "5000" },
  { number: "5110", name: "General Maintenance", type: "Expense", subType: "Operating Expense", parent: "5100" },
  { number: "5120", name: "Plumbing", type: "Expense", subType: "Operating Expense", parent: "5100" },
  { number: "5130", name: "Electrical", type: "Expense", subType: "Operating Expense", parent: "5100" },
  { number: "5140", name: "HVAC", type: "Expense", subType: "Operating Expense", parent: "5100" },
  { number: "5150", name: "Landscaping", type: "Expense", subType: "Operating Expense", parent: "5100" },
  { number: "5200", name: "Utilities", type: "Expense", subType: "Operating Expense", parent: "5000" },
  { number: "5210", name: "Water & Sewer", type: "Expense", subType: "Operating Expense", parent: "5200" },
  { number: "5220", name: "Electric", type: "Expense", subType: "Operating Expense", parent: "5200" },
  { number: "5230", name: "Gas", type: "Expense", subType: "Operating Expense", parent: "5200" },
  { number: "5240", name: "Trash Removal", type: "Expense", subType: "Operating Expense", parent: "5200" },
  { number: "5300", name: "Insurance", type: "Expense", subType: "Operating Expense", parent: "5000" },
  { number: "5400", name: "Property Tax", type: "Expense", subType: "Operating Expense", parent: "5000" },
  { number: "5500", name: "Management Fees", type: "Expense", subType: "Operating Expense", parent: "5000" },
  { number: "5600", name: "Advertising & Marketing", type: "Expense", subType: "Operating Expense", parent: "5000" },
  { number: "5700", name: "Legal & Professional", type: "Expense", subType: "Operating Expense", parent: "5000" },
  { number: "5800", name: "Depreciation Expense", type: "Expense", subType: "Operating Expense", parent: "5000" },
  { number: "5900", name: "Other Expenses", type: "Expense", subType: "Other Expense", parent: "5000" },
];

function startOfMonth(date = new Date(), offset = 0) {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1);
}

function monthChargeLabel(dueDate: Date) {
  return `${dueDate.toLocaleString("en-US", { month: "long", year: "numeric" })} Rent Charge`;
}

function toStatus(amount: number, paidAmount: number): "unpaid" | "partially_paid" | "paid" {
  if (paidAmount <= 0) return "unpaid";
  if (paidAmount >= amount) return "paid";
  return "partially_paid";
}

async function main() {
  console.log("Seeding database...");

  // Create demo admin user
  const adminUser = await prisma.user.upsert({
    where: { email: "admin@propmanager.local" },
    update: {},
    create: {
      email: "admin@propmanager.local",
      name: "Property Manager",
      passwordHash: hashSync("admin123", 10),
      role: "landlord",
    },
  });
  console.log(`  Created admin user: ${adminUser.email}`);

  // Create demo tenant login user
  const tenantUser = await prisma.user.upsert({
    where: { email: "tenant@propmanager.local" },
    update: {
      name: "Demo Tenant",
      role: "tenant",
    },
    create: {
      email: "tenant@propmanager.local",
      name: "Demo Tenant",
      passwordHash: hashSync("tenant123", 10),
      role: "tenant",
    },
  });
  console.log(`  Created tenant user: ${tenantUser.email}`);

  // Ensure there is a tenant profile linked to the tenant login user.
  const tenantProfile = await prisma.tenant.upsert({
    where: { userId: tenantUser.id },
    update: {
      firstName: "Demo",
      lastName: "Tenant",
      email: tenantUser.email,
      userId: tenantUser.id,
    },
    create: {
      firstName: "Demo",
      lastName: "Tenant",
      email: tenantUser.email,
      userId: tenantUser.id,
    },
  });
  console.log(`  Linked tenant profile: ${tenantProfile.firstName} ${tenantProfile.lastName}`);

  // Build a map of account number → id for parent lookups
  const accountMap = new Map<string, string>();

  // Seed Chart of Accounts — insert parents first, then children
  for (const acct of chartOfAccounts) {
    const parentId = acct.parent ? accountMap.get(acct.parent) ?? null : null;
    const created = await prisma.account.upsert({
      where: { accountNumber: acct.number },
      update: {},
      create: {
        accountNumber: acct.number,
        name: acct.name,
        type: acct.type,
        subType: acct.subType,
        parentId: parentId,
        description: `${acct.type} — ${acct.name}`,
      },
    });
    accountMap.set(acct.number, created.id);
  }
  console.log(`  Seeded ${chartOfAccounts.length} chart of accounts entries`);

  // Resolve key accounting accounts for seeded transactions.
  const rentRevenue = await prisma.account.findUnique({
    where: { accountNumber: "4100" },
  });
  const rentReceivable = await prisma.account.findUnique({
    where: { accountNumber: "1210" },
  });
  const operatingCash = await prisma.account.findUnique({
    where: { accountNumber: "1110" },
  });
  if (!rentRevenue) {
    throw new Error("Revenue account 4100 is required for ledger charge seeding");
  }
  if (!rentReceivable || !operatingCash) {
    throw new Error("Accounts 1210 (Rent Receivable) and 1110 (Operating Cash) are required");
  }

  // Larger demo portfolio dataset for richer UI testing across all modules.
  const propertySeeds = [
    {
      name: "Maple Grove Apartments",
      type: "residential",
      notes: "[SEED] 18-unit suburban complex",
      address: { street: "101 Maple Ave", city: "Omaha", state: "NE", zip: "68102" },
      units: [
        { unitNumber: "1A", bedrooms: 1, bathrooms: 1, sqft: 740, marketRent: 1225 },
        { unitNumber: "1B", bedrooms: 2, bathrooms: 1, sqft: 900, marketRent: 1395 },
        { unitNumber: "2A", bedrooms: 2, bathrooms: 1.5, sqft: 980, marketRent: 1495 },
        { unitNumber: "2B", bedrooms: 3, bathrooms: 2, sqft: 1175, marketRent: 1750 },
      ],
    },
    {
      name: "Cedar Heights Townhomes",
      type: "residential",
      notes: "[SEED] Townhome community",
      address: { street: "455 Cedar Heights Dr", city: "Lincoln", state: "NE", zip: "68508" },
      units: [
        { unitNumber: "TH-01", bedrooms: 2, bathrooms: 2, sqft: 1180, marketRent: 1725 },
        { unitNumber: "TH-02", bedrooms: 2, bathrooms: 2, sqft: 1210, marketRent: 1760 },
        { unitNumber: "TH-03", bedrooms: 3, bathrooms: 2.5, sqft: 1450, marketRent: 2050 },
        { unitNumber: "TH-04", bedrooms: 3, bathrooms: 2.5, sqft: 1480, marketRent: 2095 },
      ],
    },
    {
      name: "Riverwalk Lofts",
      type: "mixed",
      notes: "[SEED] Mixed-use loft property",
      address: { street: "88 Riverwalk Blvd", city: "Des Moines", state: "IA", zip: "50309" },
      units: [
        { unitNumber: "L-101", bedrooms: 1, bathrooms: 1, sqft: 810, marketRent: 1460 },
        { unitNumber: "L-102", bedrooms: 1, bathrooms: 1, sqft: 835, marketRent: 1490 },
        { unitNumber: "L-201", bedrooms: 2, bathrooms: 2, sqft: 1095, marketRent: 1875 },
        { unitNumber: "L-202", bedrooms: 2, bathrooms: 2, sqft: 1120, marketRent: 1920 },
      ],
    },
  ] as const;

  const tenantSeeds = [
    { firstName: "Maya", lastName: "Patel", email: "maya.patel@demo-tenant.local" },
    { firstName: "Jordan", lastName: "Kim", email: "jordan.kim@demo-tenant.local" },
    { firstName: "Avery", lastName: "Johnson", email: "avery.johnson@demo-tenant.local" },
    { firstName: "Noah", lastName: "Rivera", email: "noah.rivera@demo-tenant.local" },
    { firstName: "Sofia", lastName: "Lopez", email: "sofia.lopez@demo-tenant.local" },
    { firstName: "Liam", lastName: "Carter", email: "liam.carter@demo-tenant.local" },
    { firstName: "Emma", lastName: "Nguyen", email: "emma.nguyen@demo-tenant.local" },
    { firstName: "Lucas", lastName: "Bennett", email: "lucas.bennett@demo-tenant.local" },
    { firstName: "Zoe", lastName: "Miller", email: "zoe.miller@demo-tenant.local" },
    { firstName: "Ethan", lastName: "Brooks", email: "ethan.brooks@demo-tenant.local" },
    { firstName: "Olivia", lastName: "Gray", email: "olivia.gray@demo-tenant.local" },
  ] as const;

  const tenantsByEmail = new Map<string, { id: string; email: string | null }>();
  tenantsByEmail.set(tenantProfile.email ?? "", tenantProfile);
  for (const t of tenantSeeds) {
    const existing = await prisma.tenant.findFirst({
      where: { email: t.email },
    });
    const seeded = existing
      ? await prisma.tenant.update({
          where: { id: existing.id },
          data: {
            firstName: t.firstName,
            lastName: t.lastName,
          },
        })
      : await prisma.tenant.create({
          data: {
            firstName: t.firstName,
            lastName: t.lastName,
            email: t.email,
            notes: "[SEED] Tenant profile for demo data",
          },
        });
    tenantsByEmail.set(t.email, seeded);
  }

  const unitsCreated: Array<{ unitId: string; rent: number; propertyId: string }> = [];
  for (const propertySeed of propertySeeds) {
    let property = await prisma.property.findFirst({
      where: { name: propertySeed.name, userId: adminUser.id },
    });
    if (!property) {
      property = await prisma.property.create({
        data: {
          name: propertySeed.name,
          type: propertySeed.type,
          notes: propertySeed.notes,
          userId: adminUser.id,
        },
      });
    }

    let address = await prisma.address.findFirst({
      where: {
        propertyId: property.id,
        street: propertySeed.address.street,
      },
    });
    if (!address) {
      address = await prisma.address.create({
        data: {
          propertyId: property.id,
          ...propertySeed.address,
        },
      });
    }

    for (const unitSeed of propertySeed.units) {
      let unit = await prisma.unit.findFirst({
        where: { addressId: address.id, unitNumber: unitSeed.unitNumber },
      });
      if (!unit) {
        unit = await prisma.unit.create({
          data: {
            addressId: address.id,
            ...unitSeed,
          },
        });
      }
      unitsCreated.push({
        unitId: unit.id,
        rent: unit.marketRent ?? unitSeed.marketRent,
        propertyId: property.id,
      });
    }
  }

  // Keep the first tenant lease-linked to login credentials for portal testing.
  const leaseTenantEmails = [
    tenantUser.email,
    ...tenantSeeds.slice(0, 8).map((t) => t.email),
  ] as const;

  const seededLeases: Array<{
    leaseId: string;
    tenantId: string;
    propertyId: string;
    monthlyRent: number;
    leaseIndex: number;
  }> = [];
  for (let i = 0; i < leaseTenantEmails.length; i++) {
    const unitData = unitsCreated[i];
    if (!unitData) break;

    const tenant = tenantsByEmail.get(leaseTenantEmails[i] ?? "");
    if (!tenant) continue;

    const existingLease = await prisma.lease.findFirst({
      where: {
        unitId: unitData.unitId,
        tenantId: tenant.id,
        status: "active",
      },
    });

    const monthlyRent = unitData.rent;
    const lease = existingLease ?? await prisma.lease.create({
      data: {
        unitId: unitData.unitId,
        tenantId: tenant.id,
        startDate: startOfMonth(new Date(), -(i % 4)),
        monthlyRent,
        deposit: monthlyRent,
        status: "active",
        notes: "[SEED] Active lease",
      },
    });

    seededLeases.push({
      leaseId: lease.id,
      tenantId: tenant.id,
      propertyId: unitData.propertyId,
      monthlyRent,
      leaseIndex: i,
    });
  }

  // Seed rent ledger charges and payment activity across recent/future months.
  for (const leaseInfo of seededLeases) {
    const monthOffsets = [-2, -1, 0, 1];
    const chargesByOffset = new Map<number, { id: string; amount: number }>();

    for (const monthOffset of monthOffsets) {
      const dueDate = startOfMonth(new Date(), monthOffset);
      const description = monthChargeLabel(dueDate);
      const chargeAmount = leaseInfo.monthlyRent;

      const ratio = monthOffset === -2
        ? 1
        : monthOffset === -1
          ? 0.65
          : monthOffset === 0
            ? 0.2
            : 0;
      const paidAmount = Math.round(chargeAmount * ratio * 100) / 100;

      let charge = await prisma.ledgerCharge.findFirst({
        where: {
          leaseId: leaseInfo.leaseId,
          dueDate,
          description,
        },
      });
      if (!charge) {
        charge = await prisma.ledgerCharge.create({
          data: {
            leaseId: leaseInfo.leaseId,
            tenantId: leaseInfo.tenantId,
            propertyId: leaseInfo.propertyId,
            accountId: rentRevenue.id,
            description,
            dueDate,
            amount: chargeAmount,
            paidAmount,
            status: toStatus(chargeAmount, paidAmount),
          },
        });
      } else {
        charge = await prisma.ledgerCharge.update({
          where: { id: charge.id },
          data: {
            amount: chargeAmount,
            paidAmount,
            status: toStatus(chargeAmount, paidAmount),
          },
        });
      }

      chargesByOffset.set(monthOffset, { id: charge.id, amount: charge.amount });
    }

    // Confirmed payment for prior month to populate transactions and allocations.
    const priorMonthCharge = chargesByOffset.get(-1);
    if (priorMonthCharge) {
      const paymentAmount = Math.round(priorMonthCharge.amount * 0.65 * 100) / 100;
      const paymentMemo = `[SEED] Rent payment - lease ${leaseInfo.leaseIndex + 1}`;
      let payment = await prisma.tenantPayment.findFirst({
        where: {
          leaseId: leaseInfo.leaseId,
          memo: paymentMemo,
        },
      });
      if (!payment) {
        payment = await prisma.tenantPayment.create({
          data: {
            leaseId: leaseInfo.leaseId,
            tenantId: leaseInfo.tenantId,
            propertyId: leaseInfo.propertyId,
            amount: paymentAmount,
            initiatedByRole: "tenant",
            initiatedFrom: "tenant_portal",
            status: "confirmed",
            memo: paymentMemo,
            submittedAt: new Date(startOfMonth(new Date(), -1).getTime() + 7 * 24 * 60 * 60 * 1000),
            confirmedAt: new Date(startOfMonth(new Date(), -1).getTime() + 8 * 24 * 60 * 60 * 1000),
            confirmedByUserId: adminUser.id,
            paymentProvider: "manual",
            stripePaymentStatus: "succeeded",
          },
        });
      }

      const existingAlloc = await prisma.paymentAllocation.findFirst({
        where: {
          tenantPaymentId: payment.id,
          ledgerChargeId: priorMonthCharge.id,
        },
      });
      if (!existingAlloc) {
        await prisma.paymentAllocation.create({
          data: {
            tenantPaymentId: payment.id,
            ledgerChargeId: priorMonthCharge.id,
            allocatedAmount: paymentAmount,
            allocationOrder: 1,
          },
        });
      }

      const entryReference = `[SEED-PMT-${payment.id}]`;
      let journalEntry = await prisma.journalEntry.findFirst({
        where: { reference: entryReference },
      });
      if (!journalEntry) {
        journalEntry = await prisma.journalEntry.create({
          data: {
            date: payment.confirmedAt ?? payment.submittedAt,
            memo: "Seeded tenant payment posting",
            reference: entryReference,
            propertyId: leaseInfo.propertyId,
            isPosted: true,
          },
        });

        await prisma.journalEntryLine.createMany({
          data: [
            {
              journalEntryId: journalEntry.id,
              accountId: operatingCash.id,
              debit: paymentAmount,
              credit: 0,
              description: "Tenant payment received",
            },
            {
              journalEntryId: journalEntry.id,
              accountId: rentReceivable.id,
              debit: 0,
              credit: paymentAmount,
              description: "Apply payment to rent receivable",
            },
          ],
        });
      }
    }

    // Pending payment for current month to populate approval workflow queue.
    const currentMonthCharge = chargesByOffset.get(0);
    if (currentMonthCharge) {
      const pendingMemo = `[SEED] Pending payment - lease ${leaseInfo.leaseIndex + 1}`;
      const existingPending = await prisma.tenantPayment.findFirst({
        where: {
          leaseId: leaseInfo.leaseId,
          memo: pendingMemo,
          status: "pending_confirmation",
        },
      });
      if (!existingPending) {
        await prisma.tenantPayment.create({
          data: {
            leaseId: leaseInfo.leaseId,
            tenantId: leaseInfo.tenantId,
            propertyId: leaseInfo.propertyId,
            amount: Math.round(currentMonthCharge.amount * 0.2 * 100) / 100,
            initiatedByRole: "tenant",
            initiatedFrom: "tenant_portal",
            status: "pending_confirmation",
            memo: pendingMemo,
            submittedAt: new Date(startOfMonth(new Date(), 0).getTime() + 5 * 24 * 60 * 60 * 1000),
            paymentProvider: "manual",
            stripePaymentStatus: "processing",
          },
        });
      }
    }
  }

  console.log(`  Seeded demo portfolio: ${propertySeeds.length} properties, ${unitsCreated.length} units`);
  console.log(`  Seeded tenants: ${tenantSeeds.length + 1} profiles`);
  console.log(`  Seeded leases + ledger + payments for ${seededLeases.length} active leases`);

  console.log("Seeding complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
