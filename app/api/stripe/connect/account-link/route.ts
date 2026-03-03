import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDevActor } from "@/lib/devActor";
import { getStripeClient } from "@/lib/stripe";

/**
 * POST /api/stripe/connect/account-link
 * Body: { propertyId: string }
 * Creates a Stripe Connect onboarding link for an existing property account.
 */
export async function POST(request: NextRequest) {
  try {
    const actor = await getDevActor(request);
    if (!actor || actor.effectiveRole !== "property_manager") {
      return NextResponse.json({ error: "Property manager context required" }, { status: 403 });
    }

    const body = await request.json();
    const propertyId = String(body.propertyId || "").trim();
    if (!propertyId) {
      return NextResponse.json({ error: "propertyId is required" }, { status: 400 });
    }

    const property = await prisma.property.findFirst({
      where: { id: propertyId, userId: actor.user.id },
      select: { id: true, stripeConnectAccountId: true },
    });
    if (!property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }
    if (!property.stripeConnectAccountId) {
      return NextResponse.json(
        { error: "Create a Stripe connect account for this property first" },
        { status: 400 }
      );
    }

    const appOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim() || request.nextUrl.origin;
    const stripe = getStripeClient();
    const link = await stripe.accountLinks.create({
      account: property.stripeConnectAccountId,
      type: "account_onboarding",
      // Route groups do not appear in URL paths, so property detail is "/properties/:id".
      refresh_url: `${appOrigin}/properties/${property.id}?stripe=refresh`,
      return_url: `${appOrigin}/properties/${property.id}?stripe=return`,
    });

    return NextResponse.json({ url: link.url, expiresAt: link.expires_at });
  } catch (error) {
    console.error("Error creating Stripe account onboarding link:", error);
    return NextResponse.json({ error: "Failed to create onboarding link" }, { status: 500 });
  }
}
