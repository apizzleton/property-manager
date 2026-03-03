This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

### Supabase DB in local development

Local development and local testing use the database configured in `.env`.
To use your hosted Supabase database while running locally, set both of these:

```bash
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres?sslmode=require
DIRECT_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres?sslmode=require
```

Notes:
- `DATABASE_URL` is used by runtime Prisma queries.
- `DIRECT_URL` is used by Prisma migration commands (falls back to `DATABASE_URL` if unset).
- This repo currently does not define `.env.local`/`.env.development` DB overrides, so local commands use `.env`.

### Prisma runtime sync note

After Prisma schema changes, always refresh generated client/runtime before testing:

```bash
npx prisma generate
```

Then restart the dev server (`npm run dev`). This avoids stale runtime errors when newly added models (like AutoPay tables) are queried by API routes.

## Stripe Connect + AutoPay Setup (Test Mode)

Tenant payments use Stripe Checkout and are routed to each property's configured Stripe connected account.
Only Stripe-paid transactions are shown in accounting pending confirmation.

Required environment variables:

```bash
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_APP_URL=http://localhost:3000
STRIPE_ALLOW_PLATFORM_FALLBACK=false
NEXT_PUBLIC_STRIPE_ALLOW_PLATFORM_FALLBACK=false
STRIPE_ENABLE_ACH=false
STRIPE_CURRENCY=usd
STRIPE_CONNECT_APPLICATION_FEE_PERCENT=0
AUTOPAY_RUN_SECRET=some_shared_secret
TENANT_PAYMENT_RECONCILE_SECRET=some_shared_secret
```

Notes:
- `STRIPE_SECRET_KEY` must be a test mode platform key.
- `STRIPE_CONNECT_APPLICATION_FEE_PERCENT` is optional and can be `0`.
- If `AUTOPAY_RUN_SECRET` is set, cron calls must provide `x-autopay-secret` header.
- Set `STRIPE_ENABLE_ACH=true` to allow `us_bank_account` in tenant Checkout.

### Local webhook testing

Forward Stripe webhooks:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Use the printed signing secret as `STRIPE_WEBHOOK_SECRET`.

Important:
- Webhooks are still the primary source of truth, especially for asynchronous methods (ACH).
- For local card checkout testing, the app now includes a return-page + server reconciliation fallback, so a missed listener should not leave payments stuck indefinitely.

### Stale payment reconciliation (webhook safety net)

Run the reconciliation endpoint manually (or from a scheduler) to repair Stripe payments that missed webhook updates:

```bash
curl -X POST http://localhost:3000/api/tenant-payments/reconcile-stale \
  -H "x-reconcile-secret: some_shared_secret" \
  -H "Content-Type: application/json" \
  -d "{\"limit\":50,\"minAgeMinutes\":2}"
```

Notes:
- In production, set `TENANT_PAYMENT_RECONCILE_SECRET` and always pass `x-reconcile-secret`.
- In local dev without that env var, reconcile is allowed by default.
- PM pending transaction reads also run a small bounded reconcile pass before returning results.

### Connect account requirements

Each property should have a Stripe Connect Express account and completed onboarding.
Useful local APIs:

```bash
# Create or reuse an Express account for a property
POST /api/stripe/connect/account { "propertyId": "..." }

# Get latest account status (syncs flags to property)
GET /api/stripe/connect/account?propertyId=...

# Create onboarding link
POST /api/stripe/connect/account-link { "propertyId": "..." }
```

Checkout/AutoPay cannot start for a property until onboarding is complete.

### Optional local Connect bypass

For local development, you can temporarily route tenant payments through your platform Stripe account
without a connected account:

```bash
STRIPE_ALLOW_PLATFORM_FALLBACK=true
NEXT_PUBLIC_STRIPE_ALLOW_PLATFORM_FALLBACK=true
```

Important:
- This fallback is disabled in production by code guardrails.
- Keep both vars `false` outside local/dev testing.

### ACH bank payments (tenant Checkout + AutoPay)

To enable ACH in local testing:

```bash
STRIPE_ENABLE_ACH=true
```

Stripe dashboard requirements (test mode):
- Enable ACH / US bank account payment methods on the account handling Checkout.
- If using Connect fallback mode, this means the **platform** account.
- If using full Connect mode later, each connected account must be ACH-capable.

Behavior notes:
- Checkout can offer both card and US bank account.
- ACH payments may remain `processing` before final success/failure webhook events.
- PM pending confirmation queue only shows Stripe payments once captured/paid.

### AutoPay flow

1. Tenant completes one successful Checkout payment (saves payment method).
2. Tenant enables AutoPay in dashboard and picks run day/max cap.
3. Scheduler calls:

```bash
curl -X POST http://localhost:3000/api/tenant-autopay/run-due \
  -H "x-autopay-secret: some_shared_secret"
```

4. Due AutoPay jobs create off-session PaymentIntents in test mode and update payment records.

### Expected behavior

- Manual payment: clicking `Continue to Checkout` opens Stripe Checkout for the property's connected account (or platform account in local fallback mode), with ACH available when enabled.
- Webhook marks payment as paid/captured; only then PM sees it in pending confirmations.
- AutoPay runs process only enabled tenants with due schedules and saved payment methods.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
