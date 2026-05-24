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
| `AUTH_SECRET` | ✅ | Random string ≥ 32 chars (`openssl rand -base64 32`) |
| `AUTH_GOOGLE_ID` | * | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | * | Google OAuth client secret |
| `AUTH_GITHUB_ID` | * | GitHub OAuth App ID |
| `AUTH_GITHUB_SECRET` | * | GitHub OAuth App secret |
| `OPENAI_API_KEY` | | OpenAI API key (AI insights) |
| `STRIPE_SECRET_KEY` | | Stripe secret key (billing) |
| `STRIPE_PUBLISHABLE_KEY` | | Stripe publishable key |
| `STRIPE_WEBHOOK_SECRET` | | Stripe webhook signing secret |
| `STRIPE_PRO_PRICE_ID` | | Stripe Price ID for Pro plan |
| `STRIPE_ENTERPRISE_PRICE_ID` | | Stripe Price ID for Enterprise plan |
| `RESEND_API_KEY` | | Resend API key (email) |
| `NEXT_PUBLIC_APP_URL` | ✅ | Your production URL (e.g., `https://ai-spend-audit.vercel.app`) |

*At least one OAuth provider is required for authentication.

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

### 6. OAuth Setup

**Google:**
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create OAuth 2.0 credentials
3. Add authorized redirect URI: `https://your-domain.com/api/auth/callback/google`

**GitHub:**
1. Go to [GitHub Settings > Developer Settings > OAuth Apps](https://github.com/settings/developers)
2. Create a new OAuth App
3. Authorization callback URL: `https://your-domain.com/api/auth/callback/github`

## Build Verification

```bash
# Verify the build passes before deploying
npm run build
```

## Production Checklist

- [ ] Build passes locally
- [ ] All environment variables set in Vercel
- [ ] Production database is running and migrated
- [ ] OAuth providers configured with production redirect URIs
- [ ] Stripe webhook endpoint configured
- [ ] `NEXT_PUBLIC_APP_URL` set to production URL
- [ ] CORS and security headers confirmed
- [ ] Rate limiting enabled (default)
- [ ] Audit logging active
- [ ] No `.env` files committed
- [ ] No `localhost` references in production code
- [ ] Prisma generates correctly on Vercel
