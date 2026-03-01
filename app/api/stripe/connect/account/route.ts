import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDevActor } from "@/lib/devActor";
import { getStripeClient } from "@/lib/stripe";

function assertPropertyManagerRole(role: string | null): boolean {
  return role === "property_manager";
}

/**
 * POST /api/stripe/connect/account
 * Body: { propertyId: string }
 * Creates (or reuses) a Stripe Connect Express account for one property.
 */
export async function POST(request: NextRequest) {
  try {
    const actor = await getDevActor(request);
    if (!actor || !assertPropertyManagerRole(actor.effectiveRole)) {
      return NextResponse.json({ error: "Property manager context required" }, { status: 403 });
    }

    const body = await request.json();
    const propertyId = String(body.propertyId || "").trim();
    if (!propertyId) {
      return NextResponse.json({ error: "propertyId is required" }, { status: 400 });
    }

    const property = await prisma.property.findFirst({
      where: { id: propertyId, userId: actor.user.id },
    });
    if (!property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    const stripe = getStripeClient();
    let accountId = property.stripeConnectAccountId;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        email: actor.user.email,
        metadata: {
          propertyId: property.id,
          propertyName: property.name,
          propertyManagerUserId: actor.user.id,
        },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });
      accountId = account.id;
    }

    const account = await stripe.accounts.retrieve(accountId);
    const updated = await prisma.property.update({
      where: { id: property.id },
      data: {
        stripeConnectAccountId: account.id,
        stripeConnectChargesEnabled: account.charges_enabled,
        stripeConnectPayoutsEnabled: account.payouts_enabled,
        stripeConnectDetailsSubmitted: account.details_submitted,
      },
      select: {
        id: true,
        stripeConnectAccountId: true,
        stripeConnectChargesEnabled: true,
        stripeConnectPayoutsEnabled: true,
        stripeConnectDetailsSubmitted: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error creating Stripe connect account:", error);
    return NextResponse.json({ error: "Failed to create Stripe connect account" }, { status: 500 });
  }
}

/**
 * GET /api/stripe/connect/account?propertyId=...
 * Retrieves latest Stripe Connect account status and syncs it to the property.
 */
export async function GET(request: NextRequest) {
  try {
    const actor = await getDevActor(request);
    if (!actor || !assertPropertyManagerRole(actor.effectiveRole)) {
      return NextResponse.json({ error: "Property manager context required" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const propertyId = (searchParams.get("propertyId") || "").trim();
    if (!propertyId) {
      return NextResponse.json({ error: "propertyId is required" }, { status: 400 });
    }

    const property = await prisma.property.findFirst({
      where: { id: propertyId, userId: actor.user.id },
    });
    if (!property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }
    if (!property.stripeConnectAccountId) {
      return NextResponse.json(
        { error: "Property is not connected to Stripe yet" },
        { status: 400 }
      );
    }

    const stripe = getStripeClient();
    const account = await stripe.accounts.retrieve(property.stripeConnectAccountId);
    const updated = await prisma.property.update({
      where: { id: property.id },
      data: {
        stripeConnectChargesEnabled: account.charges_enabled,
        stripeConnectPayoutsEnabled: account.payouts_enabled,
        stripeConnectDetailsSubmitted: account.details_submitted,
      },
      select: {
        id: true,
        stripeConnectAccountId: true,
        stripeConnectChargesEnabled: true,
        stripeConnectPayoutsEnabled: true,
        stripeConnectDetailsSubmitted: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error syncing Stripe connect account status:", error);
    return NextResponse.json({ error: "Failed to fetch Stripe connect status" }, { status: 500 });
  }
}
