import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { createAuditLog } from "@/lib/services/audit-log";
import type { SubscriptionPlan, SubscriptionStatus } from "@prisma/client";
import type Stripe from "stripe";

const PLANS = {
  FREE: {
    auditLimit: 5,
    exportLimit: 3,
    aiRecommendations: false,
    teamCollaboration: false,
    stripePriceId: null,
  },
  PRO: {
    auditLimit: 50,
    exportLimit: 100,
    aiRecommendations: true,
    teamCollaboration: true,
    stripePriceId: process.env.STRIPE_PRO_PRICE_ID || "price_pro_monthly",
  },
  ENTERPRISE: {
    auditLimit: 999999,
    exportLimit: 999999,
    aiRecommendations: true,
    teamCollaboration: true,
    stripePriceId: process.env.STRIPE_ENTERPRISE_PRICE_ID || "price_enterprise_monthly",
  },
} as const;

export async function getUserPlan(userId: string): Promise<{
  plan: SubscriptionPlan;
  auditLimit: number;
  exportLimit: number;
  aiRecommendations: boolean;
  teamCollaboration: boolean;
  auditCount: number;
  exportCount: number;
}> {
  if (!userId) {
    return { plan: "FREE", auditLimit: 999999, exportLimit: 999999, aiRecommendations: true, teamCollaboration: true, auditCount: 0, exportCount: 0 };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      subscription: true,
      _count: { select: { audits: true, savedReports: true } },
    },
  });

  if (!user) throw new Error("User not found");

  const plan = (user.subscription?.plan || "FREE") as SubscriptionPlan;
  const planConfig = PLANS[plan];

  return {
    plan,
    auditLimit: user.subscription?.auditLimit ?? planConfig.auditLimit,
    exportLimit: user.subscription?.exportLimit ?? planConfig.exportLimit,
    aiRecommendations: user.subscription?.aiRecommendations ?? planConfig.aiRecommendations,
    teamCollaboration: user.subscription?.teamCollaboration ?? planConfig.teamCollaboration,
    auditCount: user._count.audits,
    exportCount: user._count.savedReports,
  };
}

export async function checkAuditLimit(userId: string): Promise<boolean> {
  const plan = await getUserPlan(userId);
  return plan.auditCount < plan.auditLimit;
}

export async function checkExportLimit(userId: string): Promise<boolean> {
  const plan = await getUserPlan(userId);
  return plan.exportCount < plan.exportLimit;
}

export async function updateSubscriptionLimits(
  subscriptionId: string,
  plan: SubscriptionPlan
) {
  const config = PLANS[plan];
  return prisma.subscription.update({
    where: { id: subscriptionId },
    data: {
      plan,
      auditLimit: config.auditLimit,
      exportLimit: config.exportLimit,
      aiRecommendations: config.aiRecommendations,
      teamCollaboration: config.teamCollaboration,
    },
  });
}

export async function createStripeCheckoutSession(
  userId: string,
  priceId: string,
  plan: SubscriptionPlan
): Promise<string | null> {
  if (!env.STRIPE_SECRET_KEY) return null;

  const { default: Stripe } = await import("stripe");
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2026-04-22.dahlia" });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { subscription: true },
  });
  if (!user) return null;

  let stripeCustomerId = user.subscription?.stripeCustomerId;

  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name || undefined,
      metadata: { userId },
    });
    stripeCustomerId = customer.id;

    await prisma.subscription.update({
      where: { id: user.subscriptionId! },
      data: { stripeCustomerId },
    });
  }

  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${env.NEXT_PUBLIC_APP_URL}/dashboard/settings?billing=success`,
    cancel_url: `${env.NEXT_PUBLIC_APP_URL}/dashboard/settings?billing=canceled`,
    metadata: { userId, plan },
  });

  return session.url;
}

export async function createBillingPortalSession(userId: string): Promise<string | null> {
  if (!env.STRIPE_SECRET_KEY) return null;

  const { default: Stripe } = await import("stripe");
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2026-04-22.dahlia" });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { subscription: true },
  });

  if (!user?.subscription?.stripeCustomerId) return null;

  const session = await stripe.billingPortal.sessions.create({
    customer: user.subscription.stripeCustomerId,
    return_url: `${env.NEXT_PUBLIC_APP_URL}/dashboard/settings`,
  });

  return session.url;
}

export async function handleStripeWebhook(event: Stripe.Event) {
  const { default: Stripe } = await import("stripe");
  const stripeClient = new Stripe(env.STRIPE_SECRET_KEY!, { apiVersion: "2026-04-22.dahlia" });

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      const plan = session.metadata?.plan as SubscriptionPlan;

      if (userId && plan && session.subscription) {
        const sub = await stripeClient.subscriptions.retrieve(session.subscription as string);
        const user = await prisma.user.findUnique({ where: { id: userId } });
        const subscriptionId = user?.subscriptionId;
        if (!subscriptionId) break;

        const subItem = sub.items.data[0];
        await prisma.subscription.update({
          where: { id: subscriptionId },
          data: {
            status: "ACTIVE",
            stripeSubscriptionId: session.subscription as string,
            stripePriceId: session.mode === "subscription" ? subItem.price.id : null,
            currentPeriodStart: new Date(subItem.current_period_start * 1000),
            currentPeriodEnd: new Date(subItem.current_period_end * 1000),
            trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
          },
        });

        const userForLimits = await prisma.user.findUnique({ where: { id: userId } });
        if (userForLimits?.subscriptionId) {
          await updateSubscriptionLimits(userForLimits.subscriptionId, plan);
        }

        await createAuditLog({
          userId,
          action: "subscription.changed",
          entity: "subscription",
          entityId: session.subscription as string,
          metadata: JSON.stringify({ plan }),
        });
      }
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;
      const sub = await prisma.subscription.findFirst({
        where: { stripeCustomerId: customerId },
      });
      if (sub) {
        const status: SubscriptionStatus = subscription.status === "active" ? "ACTIVE"
          : subscription.status === "past_due" ? "PAST_DUE"
          : subscription.status === "canceled" ? "CANCELED"
          : subscription.status === "incomplete" ? "INCOMPLETE"
          : "TRIALING";
        const subItem = subscription.items.data[0];
        await prisma.subscription.update({
          where: { id: sub.id },
          data: {
            status,
            currentPeriodStart: new Date(subItem.current_period_start * 1000),
            currentPeriodEnd: new Date(subItem.current_period_end * 1000),
            canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
          },
        });
      }
      break;
    }

    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;
      const sub = await prisma.subscription.findFirst({
        where: { stripeCustomerId: customerId },
      });
      if (sub) {
        await prisma.billingHistory.create({
          data: {
            subscriptionId: sub.id,
            amount: invoice.amount_paid,
            currency: invoice.currency,
            status: "paid",
            stripeInvoiceId: invoice.id,
            stripeReceiptUrl: invoice.hosted_invoice_url,
            description: `Invoice ${invoice.number}`,
            periodStart: invoice.period_start ? new Date(invoice.period_start * 1000) : null,
            periodEnd: invoice.period_end ? new Date(invoice.period_end * 1000) : null,
          },
        });
      }
      break;
    }
  }
}
