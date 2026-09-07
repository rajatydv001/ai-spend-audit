import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { ApiError, badRequest, notFound } from "@/lib/errors";
import { createAuditLog } from "@/lib/services/audit-log";
import { getUserEntitlements } from "@/lib/services/entitlements";
import type { SubscriptionPlan, SubscriptionStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { effectivePlan } from "@/lib/services/entitlements";
import type Stripe from "stripe";
import { withSerializableTransaction } from "@/lib/services/transaction";

const STRIPE_API_VERSION = "2026-04-22.dahlia";

/**
 * Stripe is intentionally not configured until all variables needed to bill
 * safely are present. Distinguishes "Stripe not configured" (local/dev default)
 * from "Stripe is configured" (production). We never fall back to invented
 * price IDs or pretend checkout succeeded without configuration.
 */
export class StripeConfigurationError extends ApiError {
  constructor(message: string) {
    super(message, 503);
    this.name = "StripeConfigurationError";
  }
}

export function isStripeConfigured(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY);
}

async function getStripe(): Promise<Stripe> {
  if (!env.STRIPE_SECRET_KEY) {
    throw new StripeConfigurationError(
      "Stripe is not configured. Set STRIPE_SECRET_KEY to enable billing."
    );
  }
  const { default: StripeClient } = await import("stripe");
  return new StripeClient(env.STRIPE_SECRET_KEY, { apiVersion: STRIPE_API_VERSION });
}

/**
 * Resolve the server-configured Stripe price id for a plan. Price ids are
 * environment configuration, NEVER client-supplied. FREE has no price (checkout
 * for it is rejected). Missing configuration for a paid plan fails loudly
 * rather than guessing.
 */
export function resolveStripePriceId(plan: SubscriptionPlan): string {
  if (plan === "FREE") {
    throw badRequest("The Free plan cannot be upgraded to.");
  }
  const price =
    plan === "PRO" ? env.STRIPE_PRO_PRICE_ID : env.STRIPE_ENTERPRISE_PRICE_ID;
  if (!price) {
    throw new StripeConfigurationError(
      `STRIPE_${plan}_PRICE_ID is not configured. Cannot start checkout for ${plan}.`
    );
  }
  return price;
}

/**
 * Inverse mapping used to derive a plan from a price id seen inside a VERIFIED
 * webhook event. Only configured price ids resolve to a paid plan; anything
 * else resolves to FREE so unverifiable prices can never escalate a plan.
 */
export function resolvePlanByPriceId(priceId?: string | null): SubscriptionPlan | null {
  if (!priceId) return null;
  if (env.STRIPE_PRO_PRICE_ID === priceId) return "PRO";
  if (env.STRIPE_ENTERPRISE_PRICE_ID === priceId) return "ENTERPRISE";
  return null;
}

function mapStripeStatus(
  status: Stripe.Subscription.Status,
  current: SubscriptionStatus
): SubscriptionStatus {
  switch (status) {
    case "active":
      return "ACTIVE";
    case "trialing":
      return "TRIALING";
    case "past_due":
      return "PAST_DUE";
    case "unpaid":
      // An unpaid subscription is a payment failure, not a healthy state.
      // Fail closed to PAST_DUE so entitlements drop immediately.
      return "PAST_DUE";
    case "canceled":
      return "CANCELED";
    case "incomplete":
    case "incomplete_expired":
      return "INCOMPLETE";
    case "paused":
      // Paused (Stripe's PauseCollectionStatus) means billing is halted — the
      // plan is not being paid for, so it cannot keep granting paid features.
      return "INCOMPLETE";
    default:
      // Any future/unknown Stripe status keeps the current local status rather
      // than upgrading entitlements on an unrecognized signal.
      return current;
  }
}

export async function getUserPlan(userId: string): Promise<{
  plan: SubscriptionPlan;
  auditLimit: number;
  exportLimit: number;
  aiRecommendations: boolean;
  teamCollaboration: boolean;
  auditCount: number;
  exportCount: number;
}> {
  // A falsy id can never be entitled: entitlements resolve to the safe FREE
  // defaults rather than an unlocked plan.
  const entitlements = await getUserEntitlements(userId);
  return {
    plan: entitlements.plan,
    auditLimit: entitlements.auditLimit,
    exportLimit: entitlements.exportLimit,
    aiRecommendations: entitlements.features.ai,
    teamCollaboration: entitlements.features.team,
    auditCount: entitlements.auditCount,
    exportCount: entitlements.exportCount,
  };
}

/**
 * Billing summary for the authenticated user's own subscription. `plan` always
 * defaults to FREE (a user without a subscription row is Free); paid status is
 * only ever produced by a verified webhook. Price ids are only exposed when
 * Stripe is configured, so the client never has to invent them.
 */
export async function getBillingInfo(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { subscription: true },
  });
  // Effective plan: a subscription row whose status is not ACTIVE/TRIALING is
  // NOT paid. This keeps the billing UI honest when a plan lapses or is
  // canceled before the client-side state is refreshed.
  const rawPlan = (user?.subscription?.plan ?? "FREE") as SubscriptionPlan;
  const status: SubscriptionStatus | null = user?.subscription?.status ?? null;
  const plan = effectivePlan(rawPlan, status);
  const stripeConfigured = isStripeConfigured();
  return {
    plan,
    status,
    stripeConfigured,
    prices: {
      PRO: stripeConfigured ? (env.STRIPE_PRO_PRICE_ID ?? null) : null,
      ENTERPRISE: stripeConfigured ? (env.STRIPE_ENTERPRISE_PRICE_ID ?? null) : null,
    },
  };
}

export async function createStripeCheckoutSession(
  userId: string,
  plan: SubscriptionPlan,
  clientPriceId?: string | null
): Promise<string> {
  // The free plan cannot be upgraded to; it has no price. Checked before any
  // Stripe/DB work so it always fails fast regardless of configuration.
  if (plan === "FREE") {
    throw badRequest("The Free plan cannot be upgraded to.");
  }

  const stripe = await getStripe();

  // Server resolves the price from environment configuration and NEVER trusts a
  // client-supplied price id. When one is sent, it must match exactly — anything
  // else is a price-escalation attempt and is rejected.
  const priceId = resolveStripePriceId(plan);
  if (clientPriceId && clientPriceId !== priceId) {
    throw badRequest("Price does not match the requested plan.");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { subscription: true },
  });
  if (!user) throw notFound("User not found");

  // Double-subscription guard: the local Subscription row is the single source
  // of truth for the (one) Stripe subscription we attach to the customer.
  // A second checkout while an ACTIVE/TRIALING subscription exists would let
  // Stripe create a second subscription and both `checkout.session.completed`
  // events would race to overwrite the same row. Reject and point the user to
  // the portal instead of starting a parallel billing relationship.
  if (
    user.subscription?.status === "ACTIVE" ||
    user.subscription?.status === "TRIALING"
  ) {
    throw badRequest(
      "You already have an active subscription. Manage it from your billing portal instead of starting a second checkout."
    );
  }

  // Ensure the user owns a Subscription row so ownership is explicit and Stripe
  // state can be attached to it. Created in the least-privilege FREE state; a
  // verified webhook is the only thing that can move it to a paid plan.
  let subscription = user.subscription;
  if (!subscription) {
    subscription = await prisma.subscription.create({
      data: {
        plan: "FREE",
        user: { connect: { id: userId } },
      },
    });
  }

  let stripeCustomerId = subscription.stripeCustomerId;
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name || undefined,
      metadata: { userId },
    });
    stripeCustomerId = customer.id;

    await prisma.subscription.update({
      where: { id: subscription.id },
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

  if (!session.url) {
    throw new Error("Stripe checkout session returned no URL.");
  }
  return session.url;
}

export async function createBillingPortalSession(userId: string): Promise<string | null> {
  const stripe = await getStripe();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { subscription: true },
  });
  if (!user) throw notFound("User not found");

  // Ownership: the only customer we can open a portal for is the one attached
  // to the authenticated user's own subscription.
  const stripeCustomerId = user.subscription?.stripeCustomerId;
  if (!stripeCustomerId) return null;

  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${env.NEXT_PUBLIC_APP_URL}/dashboard/settings`,
  });

  return session.url;
}

/**
 * Unique-violation helper: P2002 is the ONLY error we silently swallow at the
 * webhook entry point. It means the exact state change already happened — either
 * this event id was already recorded (at-least-once delivery) or a concurrent
 * delivery lost the insert race. Replaying is wrong because the verification
 * step (Stripe signature) means the event is real, not forged.
 */
function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

export async function handleStripeWebhook(event: Stripe.Event) {
  const stripeClient = await getStripe();
  const eventId = event.id;

  // The idempotency marker and the event's state changes are ONE serializable
  // transaction. There is no crash window: if processing throws, the whole
  // transaction (marker included) rolls back and Stripe's retry completes the
  // state change. A duplicate/concurrent delivery finds the marker (or loses
  // the unique insert race) and is skipped before touching any state.
  try {
    await withSerializableTransaction(async (tx: Prisma.TransactionClient) => {
      const alreadyProcessed = await tx.stripeEvent.findUnique({ where: { eventId } });
      if (alreadyProcessed) return;

      await tx.stripeEvent.create({ data: { eventId, type: event.type } });

      // Best-effort audit logging cannot live inside the transaction (a failed
      // write would abort the committed state), so it is returned and written
      // AFTER the transaction commits.
      const audit = await processStripeEvent(tx, event, stripeClient);
      if (audit) {
        await createAuditLog(audit).catch(() => undefined);
      }
    });
  } catch (error) {
    if (isUniqueViolation(error)) return; // already processed by us or a peer
    throw error;
  }
}

async function resolveSubscriptionForCustomer(
  tx: Prisma.TransactionClient,
  customerId: string | null | undefined,
  metadataUserId?: string
): Promise<{ id: string; status?: SubscriptionStatus } | null> {
  if (customerId) {
    const matched = await tx.subscription.findFirst({
      where: { stripeCustomerId: customerId },
    });
    if (matched?.id) return { id: matched.id, status: matched.status };
  }
  // Legacy fallback: events delivered before a customer link existed relied on
  // the userId recorded in checkout metadata. Only the authenticated checkout
  // session can have written that metadata, so it is still a safe owner link.
  if (metadataUserId) {
    const user = await tx.user.findUnique({ where: { id: metadataUserId } });
    if (user?.subscriptionId) return { id: user.subscriptionId };
  }
  return null;
}

/**
 * Resolves the local Subscription row for a Stripe subscription.id. Events that
 * reference a subscription we have NOT stored on the row are IGNORED — this is
 * the cross-subscription isolation rule. A stale `subscription.deleted` for an
 * old subscription must never cancel/rewrite a row that now represents a
 * DIFFERENT subscription (the reconnect-after-cancel flow). There is no
 * customer fallback here on purpose: only `checkout.session.completed` (which
 * carries the user's own checkout context) may attach state by customer.
 */
async function resolveSubscriptionForStripeSubscription(
  tx: Prisma.TransactionClient,
  stripeSubscriptionId: string | undefined
): Promise<{ id: string; status?: SubscriptionStatus } | null> {
  if (!stripeSubscriptionId) return null;
  const matched = await tx.subscription.findFirst({
    where: { stripeSubscriptionId },
  });
  if (!matched?.id) return null;
  return { id: matched.id, status: matched.status };
}

async function processStripeEvent(
  tx: Prisma.TransactionClient,
  event: Stripe.Event,
  stripeClient: Stripe
): Promise<{
  userId?: string;
  action: "subscription.changed";
  entity: string;
  entityId?: string;
  metadata?: string;
} | null> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const sub = await resolveSubscriptionForCustomer(
        tx,
        session.customer as string,
        session.metadata?.userId
      );
      if (!sub) return null;

      if (!session.subscription) return null;
      const stripeSub = await stripeClient.subscriptions.retrieve(session.subscription as string);
      const subItem = stripeSub.items.data[0];

      // Plan is derived from the verified price, never from session metadata
      // (which could have been tampered with between issue and completion).
      const priceId = subItem?.price?.id;
      const plan = resolvePlanByPriceId(priceId) ?? "FREE";
      const status: SubscriptionStatus = stripeSub.status === "trialing" ? "TRIALING" : "ACTIVE";

      await tx.subscription.update({
        where: { id: sub.id },
        data: {
          plan,
          status,
          stripeSubscriptionId: session.subscription as string,
          stripePriceId: priceId,
          currentPeriodStart: subItem ? new Date(subItem.current_period_start * 1000) : undefined,
          currentPeriodEnd: subItem ? new Date(subItem.current_period_end * 1000) : undefined,
          trialEndsAt: stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000) : null,
          canceledAt: stripeSub.canceled_at ? new Date(stripeSub.canceled_at * 1000) : null,
        },
      });

      return {
        userId: session.metadata?.userId,
        action: "subscription.changed",
        entity: "subscription",
        entityId: session.subscription as string,
        metadata: JSON.stringify({ plan, status }),
      };
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      // Isolated by Stripe subscription id — never by customer.
      const sub = await resolveSubscriptionForStripeSubscription(tx, subscription.id);
      if (!sub) return null;

      const subItem = subscription.items.data[0];
      const priceId = subItem?.price?.id;
      const resolvedPlan = resolvePlanByPriceId(priceId);
      const status = mapStripeStatus(
        subscription.status,
        (sub.status ?? "TRIALING") as SubscriptionStatus
      );

      await tx.subscription.update({
        where: { id: sub.id },
        data: {
          ...(resolvedPlan ? { plan: resolvedPlan } : {}),
          status,
          stripePriceId: priceId ?? undefined,
          currentPeriodStart: subItem ? new Date(subItem.current_period_start * 1000) : undefined,
          currentPeriodEnd: subItem ? new Date(subItem.current_period_end * 1000) : undefined,
          trialEndsAt: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
          canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
        },
      });

      return null;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      // Isolated by Stripe subscription id — a stale `deleted` delivery for a
      // previous subscription can never cancel the current one.
      const sub = await resolveSubscriptionForStripeSubscription(tx, subscription.id);
      if (!sub) return null;

      await tx.subscription.update({
        where: { id: sub.id },
        data: {
          status: "CANCELED",
          canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : new Date(),
        },
      });
      return null;
    }

    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      // Prefer the invoice's own subscription for isolation, falling back to the
      // customer link only when the revenue predates the subscription-synced row.
      const invoiceSubscription = invoice.parent?.subscription_details?.subscription;
      const sub =
        (typeof invoiceSubscription === "string" && invoiceSubscription
          ? await resolveSubscriptionForStripeSubscription(tx, invoiceSubscription)
          : null) ??
        (await resolveSubscriptionForCustomer(tx, invoice.customer as string));
      if (!sub) return null;

      // At-least-once delivery can replay the same invoice twice. Pre-check
      // inside the transaction; if a concurrent duplicate wins the insert race
      // the P2002 aborts this transaction (marker rolls back) and the outer
      // isUniqueViolation guard swallows it — the row already exists.
      const existingInvoice = await tx.billingHistory.findFirst({
        where: { stripeInvoiceId: invoice.id },
      });
      if (existingInvoice) return null;

      await tx.billingHistory.create({
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
      return null;
    }
  }

  return null;
}