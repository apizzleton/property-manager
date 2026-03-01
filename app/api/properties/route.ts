import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDevActor } from "@/lib/devActor";

/**
 * GET /api/properties — list all properties with addresses and units
 * Query: portfolioId? — when provided, return only properties in that portfolio
 */
export async function GET(request: NextRequest) {
  const actor = await getDevActor(request);
  if (!actor) {
    return NextResponse.json({ error: "No development user found. Run the seed script." }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const portfolioId = searchParams.get("portfolioId");

  // Tenant view is scoped to properties where the tenant has an active lease.
  const tenantWhere =
    actor.effectiveRole === "tenant" && actor.tenantId
      ? {
          addresses: {
            some: {
              units: {
                some: {
                  leases: {
                    some: {
                      tenantId: actor.tenantId ?? "",
                      status: "active",
                    },
                  },
                },
              },
            },
          },
        }
      : undefined;

  // Portfolio filter: restrict to properties in the portfolio (PM only)
  let portfolioWhere: { id?: { in: string[] } } | undefined;
  if (portfolioId && actor.effectiveRole !== "tenant") {
    const portfolio = await prisma.portfolio.findFirst({
      where: { id: portfolioId, userId: actor.user.id },
      include: { properties: { select: { propertyId: true } } },
    });
    if (portfolio) {
      const ids = portfolio.properties.map((p) => p.propertyId);
      portfolioWhere = ids.length > 0 ? { id: { in: ids } } : { id: { in: [] } };
    }
  }

  const where =
    tenantWhere && portfolioWhere
      ? { AND: [tenantWhere, portfolioWhere] }
      : tenantWhere ?? portfolioWhere ?? undefined;

  const properties = await prisma.property.findMany({
    where,
    include: {
      addresses: {
        include: {
          units: {
            include: {
              leases: {
                where: { status: "active" },
                include: { tenant: true },
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(properties);
}

/**
 * POST /api/properties — create a new property
 * Body: { name, type?, notes?, userId }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      type,
      notes,
      accountingBasis,
      stripeConnectAccountId,
      stripeConnectChargesEnabled,
      stripeConnectPayoutsEnabled,
      stripeConnectDetailsSubmitted,
    } = body;

    if (!name) {
      return NextResponse.json({ error: "Property name is required" }, { status: 400 });
    }

    const actor = await getDevActor(request);
    if (!actor) {
      return NextResponse.json({ error: "No development user found. Run the seed script." }, { status: 400 });
    }

    if (accountingBasis && !["cash", "accrual"].includes(accountingBasis)) {
      return NextResponse.json(
        { error: "accountingBasis must be either 'cash' or 'accrual'" },
        { status: 400 }
      );
    }

    const property = await prisma.property.create({
      data: {
        name,
        type: type || "residential",
        notes: notes || null,
        userId: actor.user.id,
        accountingBasis: accountingBasis || "accrual",
        stripeConnectAccountId: stripeConnectAccountId || null,
        stripeConnectChargesEnabled: Boolean(stripeConnectChargesEnabled),
        stripeConnectPayoutsEnabled: Boolean(stripeConnectPayoutsEnabled),
        stripeConnectDetailsSubmitted: Boolean(stripeConnectDetailsSubmitted),
      },
      include: {
        addresses: { include: { units: true } },
      },
    });

    return NextResponse.json(property, { status: 201 });
  } catch (error) {
    console.error("Error creating property:", error);
    return NextResponse.json({ error: "Failed to create property" }, { status: 500 });
  }
}
