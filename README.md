# AI Spend Audit

> **Audit, optimize, and reduce your organization's AI tool spending.**
> A production-grade SaaS platform with AI-powered insights, team collaboration, and subscription billing.

## Features

### 🔍 AI Spend Audit Engine
- Multi-tool audit (ChatGPT, Claude, Cursor, Copilot, Gemini, Windsurf, OpenAI API, Anthropic API)
- Intelligent plan optimization with alternative recommendations
- Real-time savings calculations and ROI analysis
- Vendor consolidation suggestions

### 🤖 AI-Powered Insights
- OpenAI integration for intelligent optimization recommendations
- Executive summaries and vendor consolidation strategies
- Automated ROI analysis and spending projections

### 👥 Team Collaboration
- Organization workspace with role-based access (Admin, Analyst, Viewer)
- Team member invitations and department management
- Shared dashboards and collaborative auditing

### 💳 Subscription Billing
- Free / Pro / Enterprise tiered plans
- Stripe checkout and billing portal integration
- Usage-based limits (audits, exports, AI recommendations)
- Automatic plan gating and feature access control

### 📊 Advanced Analytics
- Spending trends over time
- Tool adoption analytics
- AI utilization scoring
- Projected future spend modeling
- Department-wise cost breakdown

### 📈 Premium Dashboard
- Real-time metrics and KPI cards
- Interactive charts (Recharts + Framer Motion)
- PDF export with formatted reports
- Mobile-responsive dark UI

### 🔔 Notification System
- Weekly savings digests
- Overspending alerts
- Optimization reminders
- Email notifications via Resend
- In-app notification center with preferences

### 🛡️ Enterprise Security
- Rate limiting on API endpoints
- Comprehensive audit logging
- NextAuth v5 with Google + GitHub OAuth
- Protected dashboard routes

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 16 (App Router, Turbopack) |
| **Language** | TypeScript (strict mode) |
| **Authentication** | NextAuth v5 (Auth.js) + Prisma Adapter |
| **Database** | PostgreSQL + Prisma 7 ORM |
| **UI** | Tailwind CSS 4, Framer Motion 12 |
| **Charts** | Recharts 3 |
| **PDF** | jsPDF + html2canvas |
| **State** | Zustand |
| **Billing** | Stripe |
| **AI** | OpenAI API (GPT-4o-mini) |
| **Email** | Resend |
| **Validation** | Zod |

## Architecture

```
├── app/
│   ├── (auth)/          # Sign-in, sign-up pages
│   ├── (dashboard)/     # Protected dashboard pages
│   └── api/             # REST API routes (20+ endpoints)
├── components/
│   ├── admin/           # Admin dashboard
│   ├── analytics/       # Advanced analytics UI
│   ├── auth/            # Session providers
│   ├── billing/         # Subscription plan cards
│   ├── dashboard/       # Charts, reports, metrics
│   ├── layout/          # Sidebar, topbar, navbar
│   ├── notifications/   # Notification panel
│   ├── pricing/         # Pricing intelligence
│   ├── team/            # Team management
│   └── ui/              # Reusable primitives
├── lib/
│   ├── services/        # Business logic layer
│   │   ├── admin-service.ts
│   │   ├── ai-service.ts
│   │   ├── analytics-service.ts
│   │   ├── audit-service.ts
│   │   ├── audit-log.ts
│   │   ├── notification-service.ts
│   │   ├── organization-service.ts
│   │   ├── pricing-intelligence.ts
│   │   ├── rate-limit.ts
│   │   └── subscription-service.ts
│   ├── audit-engine.ts  # Core optimization engine
│   ├── auth.ts          # NextAuth configuration
│   ├── db.ts            # Prisma client singleton
│   └── env.ts           # Zod validation
├── prisma/
│   └── schema.prisma    # Database schema (13 models)
└── middleware.ts         # Route protection
```

## Submission Documents

This repository now includes the following supporting documentation required for portfolio or Credex-style submissions:
- `DEVLOG.md`
- `REFLECTION.md`
- `TESTS.md`
- `PRICING_DATA.md`
- `PROMPTS.md`
- `GTM.md`
- `ECONOMICS.md`
- `USER_INTERVIEWS.md`
- `LANDING_COPY.md`
- `METRICS.md`
- `ARCHITECTURE.md`

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL database
- (Optional) OpenAI API key for AI insights
- (Optional) Stripe keys for billing
- (Optional) Resend API key for emails

### Environment Variables

```bash
# Required
DATABASE_URL="postgresql://user:password@host:5432/db"
AUTH_SECRET="your-random-secret-at-least-32-chars"

# OAuth (at least one required)
AUTH_GOOGLE_ID=""
AUTH_GOOGLE_SECRET=""
AUTH_GITHUB_ID=""
AUTH_GITHUB_SECRET=""

# Optional — feature falls back gracefully when missing
OPENAI_API_KEY=""
STRIPE_SECRET_KEY=""
STRIPE_PUBLISHABLE_KEY=""
RESEND_API_KEY=""
```

### Installation

```bash
npm install
npx prisma generate
npx prisma db push
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000).

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed Vercel deployment instructions, including all required environment variables and production configuration.

## License

MIT
# ai-spend-audit
