import { NextRequest, NextResponse } from "next/server";
import { reconcileStaleStripePayments } from "@/lib/stripe-payment-sync";

function isAuthorized(request: NextRequest): boolean {
  const configuredSecret = process.env.TENANT_PAYMENT_RECONCILE_SECRET;
  const providedSecret = request.headers.get("x-reconcile-secret");
  if (configuredSecret) {
    return providedSecret === configuredSecret;
  }
  return process.env.NODE_ENV !== "production";
}

/**
 * POST /api/tenant-payments/reconcile-stale
 * Reconcile stale Stripe checkout payments that missed webhook updates.
 * Intended for scheduler/cron usage.
 */
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized reconcile request" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => null);
    const requestedLimit = Number(body?.limit);
    const requestedAge = Number(body?.minAgeMinutes);
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(200, requestedLimit)) : 50;
    const minAgeMinutes = Number.isFinite(requestedAge) ? Math.max(1, Math.min(120, requestedAge)) : 2;

    const summary = await reconcileStaleStripePayments({ limit, minAgeMinutes });

    console.info("Stale stripe payment reconcile run complete", {
      limit,
      minAgeMinutes,
      ...summary,
    });

    return NextResponse.json({
      success: true,
      limit,
      minAgeMinutes,
      summary,
    });
  } catch (error) {
    console.error("Error reconciling stale stripe payments:", error);
    return NextResponse.json({ error: "Failed to reconcile stale stripe payments" }, { status: 500 });
  }
}
