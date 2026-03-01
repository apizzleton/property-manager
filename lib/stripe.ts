import Stripe from "stripe";

const globalForStripe = globalThis as unknown as {
  stripe: Stripe | undefined;
};

/**
 * Get a shared Stripe server client.
 * Uses an API version pinned by the installed SDK types.
 */
export function getStripeClient(): Stripe {
  if (globalForStripe.stripe) {
    return globalForStripe.stripe;
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY");
  }

  const client = new Stripe(secretKey);
  if (process.env.NODE_ENV !== "production") {
    globalForStripe.stripe = client;
  }
  return client;
}

export function getStripeWebhookSecret(): string {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error("Missing STRIPE_WEBHOOK_SECRET");
  }
  return webhookSecret;
}

function parseBooleanEnv(raw: string | undefined): boolean {
  if (!raw) return false;
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

/**
 * Local/dev-only toggle to bypass connected-account requirements
 * and process tenant payments on the platform account instead.
 */
export function allowPlatformStripeFallback(): boolean {
  if (process.env.NODE_ENV === "production") {
    return false;
  }
  return parseBooleanEnv(process.env.STRIPE_ALLOW_PLATFORM_FALLBACK);
}

/**
 * Toggle ACH (us_bank_account) as an allowed payment method in Checkout.
 * Kept behind env flag so rollout can be controlled by environment.
 */
export function isStripeAchEnabled(): boolean {
  return parseBooleanEnv(process.env.STRIPE_ENABLE_ACH);
}

/**
 * Checkout payment method ordering:
 * card first for broad compatibility, ACH second when enabled.
 */
export function getCheckoutPaymentMethodTypes(): Stripe.Checkout.SessionCreateParams.PaymentMethodType[] {
  const methods: Stripe.Checkout.SessionCreateParams.PaymentMethodType[] = ["card"];
  if (isStripeAchEnabled()) {
    methods.push("us_bank_account");
  }
  return methods;
}

export function getStripeCurrency(): string {
  return (process.env.STRIPE_CURRENCY || "usd").toLowerCase();
}

export function getConnectApplicationFeePercent(): number {
  const raw = process.env.STRIPE_CONNECT_APPLICATION_FEE_PERCENT;
  if (!raw) return 0;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error("Invalid STRIPE_CONNECT_APPLICATION_FEE_PERCENT");
  }
  return value;
}

export function toStripeFeeAmount(totalAmountCents: number): number | undefined {
  const percent = getConnectApplicationFeePercent();
  if (percent <= 0) return undefined;
  return Math.floor(totalAmountCents * (percent / 100));
}
