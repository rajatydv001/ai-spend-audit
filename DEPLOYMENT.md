# Deployment Guide

## Vercel (Recommended)

### 1. Push to GitHub

```bash
git remote add origin https://github.com/YOUR_USERNAME/ai-spend-audit
git push -u origin main
```

### 2. Import to Vercel

- Go to [vercel.com/new](https://vercel.com/new)
- Import your `ai-spend-audit` repository
- Select **Next.js** framework preset

### 3. Set Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string (use [Neon](https://neon.tech), [Supabase](https://supabase.com), or [Aiven](https://aiven.io)) |
| `SESSION_SECRET` | ✅ | Random string ≥ 32 chars (`openssl rand -base64 32`) used to sign session cookies |
| `OPENAI_API_KEY` | | OpenAI API key (AI insights) |
| `STRIPE_SECRET_KEY` | | Stripe secret key (billing) |
| `STRIPE_PUBLISHABLE_KEY` | | Stripe publishable key |
| `STRIPE_WEBHOOK_SECRET` | | Stripe webhook signing secret |
| `STRIPE_PRO_PRICE_ID` | | Stripe Price ID for Pro plan |
| `STRIPE_ENTERPRISE_PRICE_ID` | | Stripe Price ID for Enterprise plan |
| `RESEND_API_KEY` | | Resend API key (email) |
| `NEXT_PUBLIC_APP_URL` | ✅ | Your production URL (e.g., `https://ai-spend-audit.vercel.app`) |
| `UPSTASH_REDIS_REST_URL` | ✅ | Distributed rate limiting: endpoint of an Upstash Redis REST database |
| `UPSTASH_REDIS_REST_TOKEN` | ✅ | Distributed rate limiting: REST token for the Upstash endpoint |
| `TRUST_PROXY` | | Set to `1`/`true` ONLY when the app is behind a proxy you trust to set `X-Forwarded-For` (e.g. Vercel/Vercel Edge). Off by default so real origins cannot spoof their IP |
| `SEED_ADMIN_PASSWORD` | | Password for the seeded admin; production seeding also requires `ALLOW_ADMIN_SEED_IN_PRODUCTION=true` |

> **Authentication:** the app uses email + password sign-in (bcrypt hashes and
> signed HTTP-only session cookies, verified with the `SESSION_SECRET`). There
> is no OAuth provider, so no OAuth client/secret configuration is needed.
>
> **Rate limiting:** the in-process memory limiter is a DEV/TEST backend only.
> In **production the build and the app fail closed** unless
> `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are both set: a
> per-instance store would silently turn the limit into per-instance as soon as
> more than one process (or a cold start) exists. Rate limits are then shared
> across all instances. The two Upstash variables must be set together; a
> partial configuration is never silently ignored.

### 4. Database Setup

```bash
# Push schema to production database
npx prisma db push

# Or create a migration
npx prisma migrate dev --name init
```

### 5. Stripe Configuration

1. Create products/prices in [Stripe Dashboard](https://dashboard.stripe.com/products)
2. Set the Price IDs as environment variables
3. Configure webhook endpoint: `https://your-domain.com/api/stripe/webhook`
4. Set the webhook secret as `STRIPE_WEBHOOK_SECRET`

### 6. Database Seeding

Seeding is **not** part of the build (`vercel.json` build command only runs
`prisma generate`; the previous `tsx prisma/seed.ts` build step was removed so a
deploy can never seed production credentials).

Run it manually when you want the default organization and elevated `ADMIN`
account (`admin@aispendingaudit.com`):

```bash
npm exec prisma db seed
```

The elevated seed is skipped entirely in production unless you explicitly set
`ALLOW_ADMIN_SEED_IN_PRODUCTION=true` and `SEED_ADMIN_PASSWORD` — it is
intended for local/demo environments only.

## Build Verification

```bash
# Verify the build passes before deploying — a production build runs with
# NODE_ENV=production, so it REQUIRES NEXT_PUBLIC_APP_URL, DATABASE_URL,
# SESSION_SECRET, UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN:
# a missing/invalid distributed rate-limit config fails the build (fail closed).
npm run build
```

## Production Checklist

- [ ] Build passes locally (with the production env variables set)
- [ ] All environment variables set in Vercel
- [ ] CI runs with repository secrets: `DATABASE_URL`, `SESSION_SECRET`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- [ ] `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` both set (production fails closed without them)
- [ ] `TRUST_PROXY=1` set for Vercel/edge (proxy-controlled client IPs); otherwise forwarded headers are ignored
- [ ] Production database is running and migrated
- [ ] Stripe webhook endpoint configured
- [ ] `NEXT_PUBLIC_APP_URL` set to production URL
- [ ] Security headers verified against the production URL (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, CSP with `frame-ancestors 'none'`)
- [ ] Rate limiting active and shared (Upstash) in production
- [ ] Audit logging active
- [ ] No `.env` files committed
- [ ] No `localhost` references in production code
- [ ] Prisma generates correctly on Vercel
