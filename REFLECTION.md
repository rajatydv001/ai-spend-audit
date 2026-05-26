# Reflection

## What problem does this project solve?
AI Spend Audit helps teams identify wasted spending on AI subscriptions and API usage, then recommends optimizations to reduce costs and improve efficiency. It is designed to help finance, procurement, and product teams make smarter decisions about AI tooling.

## Why did I choose this implementation?
I chose Next.js with TypeScript and Prisma because they provide a scalable full-stack foundation with strong developer ergonomics. Stripe and NextAuth make SaaS onboarding and payments reliable, while Tailwind and Recharts support polished UI and analytics visualization.

## What were the biggest technical challenges?
The hardest parts were balancing a SaaS-grade architecture with a lightweight audit experience and integrating multiple systems cleanly: authentication, billing, AI, notifications, and analytics. Ensuring the app remained responsive while handling many interconnected routes and services was also challenging.

## What would I improve next?
I would add stronger data validation, automated tests for all API routes, and a simplified first-time onboarding flow. I would also expand accessibility support, improve mobile-first design consistency, and add a lightweight audit scheduler.

## What did I learn?
I learned how to structure a modern full-stack SaaS application with Next.js App Router, how to model organizations and role-based permissions in Prisma, and how to safely integrate Stripe webhooks and OpenAI cost-driven insights. I also learned the importance of documentation and test coverage for portfolio-grade submissions.
