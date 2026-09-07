import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  subUpdate: vi.fn(),
  subCreate: vi.fn(),
  subFindFirst: vi.fn(),
  billCreate: vi.fn(),
  billFindFirst: vi.fn(),
  auditLogCreate: vi.fn(),
  stripeEventFind: vi.fn(),
  stripeEventCreate: vi.fn(),
  stripeEventDelete: vi.fn(),
  $transaction: vi.fn(),
}));

const txProxy = {
  user: { findUnique: mocks.userFindUnique },
  subscription: {
    update: mocks.subUpdate,
    create: mocks.subCreate,
    findFirst: mocks.subFindFirst,
  },
  billingHistory: { create: mocks.billCreate, findFirst: mocks.billFindFirst },
  auditLog: { create: mocks.auditLogCreate },
  stripeEvent: {
    findUnique: mocks.stripeEventFind,
    create: mocks.stripeEventCreate,
    delete: mocks.stripeEventDelete,
  },
};

vi.mock("@/lib/env", () => ({
  env: {
    STRIPE_SECRET_KEY: undefined as string | undefined,
    STRIPE_PRO_PRICE_ID: "price_pro_monthly",
    STRIPE_ENTERPRISE_PRICE_ID: "price_enterprise_monthly",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  },
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    subscription: { update: mocks.subUpdate, findFirst: mocks.subFindFirst, create: mocks.subCreate },
    audit: { count: vi.fn() },
    savedReport: { count: vi.fn() },
    billingHistory: { create: mocks.billCreate, findFirst: mocks.billFindFirst },
    auditLog: { create: mocks.auditLogCreate },
    stripeEvent: {
      findUnique: mocks.stripeEventFind,
      create: mocks.stripeEventCreate,
      delete: mocks.stripeEventDelete,
    },
    $transaction: mocks.$transaction,
  },
}));

vi.mock("@/lib/services/transaction", async () => {
  return await vi.importActual<typeof import("@/lib/services/transaction")>(
    "@/lib/services/transaction"
  );
});

vi.mock("stripe", () => {
  const shared = {
    customers: { create: vi.fn() },
    checkout: { sessions: { create: vi.fn() } },
    billingPortal: { sessions: { create: vi.fn() } },
    subscriptions: { retrieve: vi.fn() },
  };
  class MockStripe {
    constructor() {
      return shared as unknown as MockStripe;
    }
    static inst = shared;
  }
  return { default: MockStripe };
});

import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import MockStripe from "stripe";
import type Stripe from "stripe";
import {
  createStripeCheckoutSession,
  createBillingPortalSession,
  handleStripeWebhook,
  getBillingInfo,
  StripeConfigurationError,
} from "@/lib/services/subscription-service";

const sharedClient = (MockStripe as unknown as {
  inst: {
    customers: { create: ReturnType<typeof vi.fn> };
    checkout: { sessions: { create: ReturnType<typeof vi.fn> } };
    billingPortal: { sessions: { create: ReturnType<typeof vi.fn> } };
    subscriptions: { retrieve: ReturnType<typeof vi.fn> };
  };
}).inst;

const userFind = prisma.user.findUnique as ReturnType<typeof vi.fn>;
const subUpdate = prisma.subscription.update as ReturnType<typeof vi.fn>;
const subFindFirst = prisma.subscription.findFirst as ReturnType<typeof vi.fn>;
const subCreate = prisma.subscription.create as ReturnType<typeof vi.fn>;
const billCreate = prisma.billingHistory.create as ReturnType<typeof vi.fn>;
const billFindFirst = prisma.billingHistory.findFirst as ReturnType<typeof vi.fn>;
const auditLogCreate = prisma.auditLog.create as ReturnType<typeof vi.fn>;
const stripeEventFind = prisma.stripeEvent.findUnique as ReturnType<typeof vi.fn>;
const stripeEventCreate = prisma.stripeEvent.create as ReturnType<typeof vi.fn>;
const stripeEventDelete = prisma.stripeEvent.delete as ReturnType<typeof vi.fn>;

beforeEach(() => {
  env.STRIPE_SECRET_KEY = undefined;
  env.STRIPE_PRO_PRICE_ID = "price_pro_monthly";
  env.STRIPE_ENTERPRISE_PRICE_ID = "price_enterprise_monthly";
  [
    userFind,
    subUpdate,
    subFindFirst,
    subCreate,
    billCreate,
    billFindFirst,
    stripeEventFind,
    stripeEventCreate,
    stripeEventDelete,
    sharedClient.customers.create,
    sharedClient.checkout.sessions.create,
    sharedClient.billingPortal.sessions.create,
    sharedClient.subscriptions.retrieve,
  ].forEach((m) => m.mockReset());
  // Webhook processing runs inside withSerializableTransaction: execute the
  // callback against the same model mocks (the tx client proxy).
  mocks.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(txProxy));
  // By default the event has not been processed before.
  stripeEventFind.mockResolvedValue(null);
  stripeEventCreate.mockResolvedValue({});
  billFindFirst.mockResolvedValue(null);
  auditLogCreate.mockResolvedValue({});
  subFindFirst.mockResolvedValue(null);
});

describe("getBillingInfo", () => {
  it("reports FREE for a user with no subscription (safe default)", async () => {
    userFind.mockResolvedValue({ id: "u1", subscription: null });
    const info = await getBillingInfo("u1");
    expect(info.plan).toBe("FREE");
    expect(info.status).toBeNull();
    expect(info.stripeConfigured).toBe(false);
    expect(info.prices).toEqual({ PRO: null, ENTERPRISE: null });
  });

  it("reports the real plan/status and configured prices when Stripe is enabled", async () => {
    env.STRIPE_SECRET_KEY = "sk_test_123";
    userFind.mockResolvedValue({
      id: "u1",
      subscription: { plan: "PRO", status: "ACTIVE" },
    });
    const info = await getBillingInfo("u1");
    expect(info.plan).toBe("PRO");
    expect(info.status).toBe("ACTIVE");
    expect(info.stripeConfigured).toBe(true);
    expect(info.prices).toEqual({ PRO: "price_pro_monthly", ENTERPRISE: "price_enterprise_monthly" });
  });
});

describe("stripe configuration gates", () => {
  it("fails checkout with a clear configuration error when STRIPE_SECRET_KEY is missing", async () => {
    const err = await createStripeCheckoutSession("u1", "PRO", "price_pro_monthly").catch((e) => e);
    expect(err).toBeInstanceOf(StripeConfigurationError);
    expect(err.statusCode).toBe(503);
    expect(String(err.message)).toMatch(/Stripe is not configured/i);
    expect(sharedClient.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("fails checkout with a clear error when the plan price id env var is missing", async () => {
    env.STRIPE_SECRET_KEY = "sk_test_123";
    env.STRIPE_PRO_PRICE_ID = undefined;
    const err = await createStripeCheckoutSession("u1", "PRO", "price_pro_monthly").catch((e) => e);
    expect(err.statusCode).toBe(503);
    expect(String(err.message)).toMatch(/STRIPE_PRO_PRICE_ID is not configured/i);
  });

  it("fails the portal the same way when Stripe is not configured", async () => {
    const err = await createBillingPortalSession("u1").catch((e) => e);
    expect(err).toBeInstanceOf(StripeConfigurationError);
    expect(err.statusCode).toBe(503);
    expect(sharedClient.billingPortal.sessions.create).not.toHaveBeenCalled();
  });
});

describe("stripe checkout authorization", () => {
  it("rejects checkout for the Free plan (it has no price)", async () => {
    env.STRIPE_SECRET_KEY = "sk_test_123";
    const err = await createStripeCheckoutSession("u1", "FREE").catch((e) => e);
    expect(err.statusCode).toBe(400);
    expect(sharedClient.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("rejects a client-supplied price that does not match the configured plan price (escalation attempt)", async () => {
    env.STRIPE_SECRET_KEY = "sk_test_123";
    userFind.mockResolvedValue({
      id: "u1",
      subscriptionId: "s1",
      subscription: { stripeCustomerId: "cus_1" },
    });

    const err = await createStripeCheckoutSession("u1", "PRO", "price_evil_cheap").catch((e) => e);
    expect(err.statusCode).toBe(400);
    expect(sharedClient.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("derives the price from server configuration (never from the client) and creates the session", async () => {
    env.STRIPE_SECRET_KEY = "sk_test_123";
    userFind.mockResolvedValue({
      id: "u1",
      email: "a@b.com",
      subscriptionId: "s1",
      subscription: { stripeCustomerId: "cus_1" },
    });
    sharedClient.checkout.sessions.create.mockResolvedValue({ url: "https://checkout/url" });

    const url = await createStripeCheckoutSession("u1", "PRO", "price_pro_monthly");
    expect(url).toBe("https://checkout/url");
    expect(sharedClient.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        line_items: [{ price: "price_pro_monthly", quantity: 1 }],
        metadata: { userId: "u1", plan: "PRO" },
      })
    );
  });

  it("creates a Stripe customer when none exists yet", async () => {
    env.STRIPE_SECRET_KEY = "sk_test_123";
    userFind.mockResolvedValue({
      id: "u1",
      email: "a@b.com",
      subscriptionId: "s1",
      subscription: { id: "s1", stripeCustomerId: null },
    });
    sharedClient.customers.create.mockResolvedValue({ id: "cus_new" });
    sharedClient.checkout.sessions.create.mockResolvedValue({ url: "https://checkout/url2" });
    await createStripeCheckoutSession("u1", "ENTERPRISE", "price_enterprise_monthly");
    expect(sharedClient.customers.create).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { userId: "u1" } })
    );
    expect(subUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "s1" }, data: { stripeCustomerId: "cus_new" } })
    );
  });

  it("creates a least-privilege FREE subscription for a user without one before checkout", async () => {
    env.STRIPE_SECRET_KEY = "sk_test_123";
    userFind.mockResolvedValue({
      id: "u1",
      email: "a@b.com",
      subscriptionId: null,
      subscription: null,
    });
    subCreate.mockResolvedValue({ id: "s_new", stripeCustomerId: null });
    sharedClient.customers.create.mockResolvedValue({ id: "cus_new" });
    sharedClient.checkout.sessions.create.mockResolvedValue({ url: "https://checkout/url3" });

    await createStripeCheckoutSession("u1", "PRO", "price_pro_monthly");

    // The row is created as FREE — paid state only ever comes from a webhook.
    expect(subCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ plan: "FREE" }) })
    );
  });

  it("rejects a second checkout while an ACTIVE subscription exists (no double billing)", async () => {
    env.STRIPE_SECRET_KEY = "sk_test_123";
    userFind.mockResolvedValue({
      id: "u1",
      email: "a@b.com",
      subscription: {
        id: "s1",
        plan: "PRO",
        status: "ACTIVE",
        stripeCustomerId: "cus_1",
      },
    });

    const err = await createStripeCheckoutSession("u1", "ENTERPRISE", "price_enterprise_monthly").catch((e) => e);
    expect(err.statusCode).toBe(400);
    // No second Stripe customer, no second session, no overwrite.
    expect(sharedClient.customers.create).not.toHaveBeenCalled();
    expect(sharedClient.checkout.sessions.create).not.toHaveBeenCalled();
    expect(subUpdate).not.toHaveBeenCalled();
  });

  it("allows checkout only for lapsed (CANCELED) subscriptions so re-subscription works", async () => {
    env.STRIPE_SECRET_KEY = "sk_test_123";
    userFind.mockResolvedValue({
      id: "u1",
      email: "a@b.com",
      subscription: {
        id: "s1",
        plan: "PRO",
        status: "CANCELED",
        stripeCustomerId: "cus_1",
      },
    });
    sharedClient.checkout.sessions.create.mockResolvedValue({ url: "https://checkout/resub" });

    const url = await createStripeCheckoutSession("u1", "PRO", "price_pro_monthly");
    expect(url).toBe("https://checkout/resub");
    expect(sharedClient.checkout.sessions.create).toHaveBeenCalledTimes(1);
  });
});

describe("stripe billing portal authorization", () => {
  it("opens a portal only for the customer on the authenticated user's own subscription", async () => {
    env.STRIPE_SECRET_KEY = "sk_test_123";
    userFind.mockResolvedValue({
      id: "u1",
      subscription: { stripeCustomerId: "cus_me" },
    });
    sharedClient.billingPortal.sessions.create.mockResolvedValue({ url: "https://portal" });

    const url = await createBillingPortalSession("u1");
    expect(url).toBe("https://portal");
    expect(sharedClient.billingPortal.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_me", return_url: "http://localhost:3000/dashboard/settings" })
    );
  });

  it("returns null when the user has no Stripe customer (nothing to manage)", async () => {
    env.STRIPE_SECRET_KEY = "sk_test_123";
    userFind.mockResolvedValue({ id: "u1", subscription: null });
    expect(await createBillingPortalSession("u1")).toBeNull();
    expect(sharedClient.billingPortal.sessions.create).not.toHaveBeenCalled();
  });
});

describe("handleStripeWebhook — checkout.session.completed", () => {
  it("maps a configured PRO price to plan PRO and syncs limits", async () => {
    env.STRIPE_SECRET_KEY = "sk";
    subFindFirst.mockResolvedValue({ id: "s1", status: "FREE" });
    sharedClient.subscriptions.retrieve.mockResolvedValue({
      items: { data: [{ price: { id: "price_pro_monthly" }, current_period_start: 1700000000, current_period_end: 1702592000 }] },
      trial_end: null,
      status: "active",
    });
    subUpdate.mockResolvedValue({});

    const event = {
      type: "checkout.session.completed",
      data: {
        object: {
          customer: "cus_1",
          subscription: "sub_1",
          mode: "subscription",
          metadata: { userId: "u1" },
        },
      },
    } as unknown as Stripe.Event;

    await handleStripeWebhook(event);
    assert(subUpdate, [
      { where: { id: "s1" }, data: { plan: "PRO", status: "ACTIVE", stripeSubscriptionId: "sub_1" } },
    ]);
  });

  it("sets TRIALING with the trial end when the checkout starts a trial", async () => {
    env.STRIPE_SECRET_KEY = "sk";
    subFindFirst.mockResolvedValue({ id: "s1", status: "FREE" });
    sharedClient.subscriptions.retrieve.mockResolvedValue({
      items: { data: [{ price: { id: "price_pro_monthly" }, current_period_start: 1700000000, current_period_end: 1702592000 }] },
      trial_end: 1702592000,
      status: "trialing",
    });
    subUpdate.mockResolvedValue({});

    const event = {
      type: "checkout.session.completed",
      data: { object: { customer: "cus_1", subscription: "sub_1", mode: "subscription", metadata: { userId: "u1" } } },
    } as unknown as Stripe.Event;

    await handleStripeWebhook(event);
    expect(subUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "s1" },
        data: expect.objectContaining({ status: "TRIALING", trialEndsAt: new Date(1702592000 * 1000) }),
      })
    );
  });

  it("grants FREE (never a paid plan) when the completed checkout references an unknown price", async () => {
    env.STRIPE_SECRET_KEY = "sk";
    subFindFirst.mockResolvedValue({ id: "s1", status: "FREE" });
    sharedClient.subscriptions.retrieve.mockResolvedValue({
      items: { data: [{ price: { id: "price_attacker" }, current_period_start: 1700000000, current_period_end: 1702592000 }] },
      trial_end: null,
      status: "active",
    });
    subUpdate.mockResolvedValue({});

    const event = {
      type: "checkout.session.completed",
      data: { object: { customer: "cus_1", subscription: "sub_1", mode: "subscription", metadata: { userId: "u1" } } },
    } as unknown as Stripe.Event;

    await handleStripeWebhook(event);
    expect(subUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "s1" }, data: expect.objectContaining({ plan: "FREE" }) })
    );
  });

  it("falls back to the legacy userId metadata when no customer link exists", async () => {
    env.STRIPE_SECRET_KEY = "sk";
    userFind.mockResolvedValue({ id: "u1", subscriptionId: "s1" });
    sharedClient.subscriptions.retrieve.mockResolvedValue({
      items: { data: [{ price: { id: "price_pro_monthly" }, current_period_start: 1700000000, current_period_end: 1702592000 }] },
      trial_end: null,
      status: "active",
    });
    subUpdate.mockResolvedValue({});

    const event = {
      type: "checkout.session.completed",
      data: { object: { metadata: { userId: "u1" }, subscription: "sub_1", mode: "subscription" } },
    } as unknown as Stripe.Event;

    await handleStripeWebhook(event);
    expect(subUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "s1" },
        data: expect.objectContaining({ status: "ACTIVE", stripeSubscriptionId: "sub_1" }),
      })
    );
    expect(subUpdate).toHaveBeenCalledTimes(1);
  });
});

describe("handleStripeWebhook — status synchronization", () => {
  const updatedEvent = (status: string, custom: Record<string, unknown> = {}) =>
    ({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_1",
          customer: "cus_1",
          status,
          items: { data: [{ current_period_start: 1700000000, current_period_end: 1702592000 }] },
          canceled_at: null,
          ...custom,
        },
      },
    }) as unknown as Stripe.Event;

  it("maps active / canceled", async () => {
    env.STRIPE_SECRET_KEY = "sk";
    subFindFirst.mockResolvedValue({ id: "s1", status: "ACTIVE" });
    subUpdate.mockResolvedValue({});

    await handleStripeWebhook(updatedEvent("active"));
    expect(subUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "s1" }, data: expect.objectContaining({ status: "ACTIVE" }) })
    );

    subUpdate.mockClear();
    subFindFirst.mockResolvedValue({ id: "s1", status: "ACTIVE" });
    await handleStripeWebhook(updatedEvent("canceled", { canceled_at: 1700000000 }));
    expect(subUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "s1" }, data: expect.objectContaining({ status: "CANCELED", canceledAt: new Date(1700000000 * 1000) }) })
    );
  });

  it("maps past_due and incomplete", async () => {
    env.STRIPE_SECRET_KEY = "sk";
    subFindFirst.mockResolvedValue({ id: "s1", status: "ACTIVE" });
    subUpdate.mockResolvedValue({});

    await handleStripeWebhook(updatedEvent("past_due"));
    expect(subUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "s1" }, data: expect.objectContaining({ status: "PAST_DUE" }) })
    );

    subUpdate.mockClear();
    await handleStripeWebhook(updatedEvent("incomplete"));
    expect(subUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "s1" }, data: expect.objectContaining({ status: "INCOMPLETE" }) })
    );
  });

  it("fails closed (PAST_DUE) for unpaid and (INCOMPLETE) for paused — never keeps paid access", async () => {
    env.STRIPE_SECRET_KEY = "sk";
    subFindFirst.mockResolvedValue({ id: "s1", status: "ACTIVE" });
    subUpdate.mockResolvedValue({});

    await handleStripeWebhook(updatedEvent("unpaid"));
    expect(subUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "s1" }, data: expect.objectContaining({ status: "PAST_DUE" }) })
    );

    subUpdate.mockClear();
    await handleStripeWebhook(updatedEvent("paused"));
    expect(subUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "s1" }, data: expect.objectContaining({ status: "INCOMPLETE" }) })
    );
  });

  it("maps trialing to TRIALING with the trial window", async () => {
    env.STRIPE_SECRET_KEY = "sk";
    subFindFirst.mockResolvedValue({ id: "s1", status: "FREE" });
    subUpdate.mockResolvedValue({});

    await handleStripeWebhook(updatedEvent("trialing", { trial_end: 1702592000 }));
    expect(subUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "s1" },
        data: expect.objectContaining({ status: "TRIALING", trialEndsAt: new Date(1702592000 * 1000) }),
      })
    );
  });

  it("derives the paid plan from a configured price on subscription.updated", async () => {
    env.STRIPE_SECRET_KEY = "sk";
    subFindFirst.mockResolvedValue({ id: "s1", status: "ACTIVE" });
    subUpdate.mockResolvedValue({});

    await handleStripeWebhook(
      updatedEvent("active", {
        items: { data: [{ price: { id: "price_enterprise_monthly" }, current_period_start: 1, current_period_end: 2 }] },
      })
    );
    expect(subUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "s1" }, data: expect.objectContaining({ plan: "ENTERPRISE" }) })
    );
  });

  it("synchronizes cancellation on customer.subscription.deleted", async () => {
    env.STRIPE_SECRET_KEY = "sk";
    subFindFirst.mockResolvedValue({ id: "s1", status: "ACTIVE" });
    subUpdate.mockResolvedValue({});

    const event = {
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_1", customer: "cus_1", canceled_at: 1700000000 } },
    } as unknown as Stripe.Event;

    await handleStripeWebhook(event);
    expect(subUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "s1" }, data: expect.objectContaining({ status: "CANCELED" }) })
    );
  });

  it("ignores events for a customer that owns no local subscription (no cross-tenant writes)", async () => {
    env.STRIPE_SECRET_KEY = "sk";
    subFindFirst.mockResolvedValue(null);
    subUpdate.mockResolvedValue({});

    await handleStripeWebhook(updatedEvent("active"));
    expect(subUpdate).not.toHaveBeenCalled();
  });
});

describe("handleStripeWebhook — cross-subscription deletion isolation (P0)", () => {
  // The local Subscription row can move from sub_OLD → sub_NEW (cancel then
  // re-subscribe). A stale at-least-once delivery of `deleted` for sub_OLD must
  // NEVER cancel/rewrite the row that now represents sub_NEW.
  it("ignores customer.subscription.deleted for a Stripe subscription the row no longer holds", async () => {
    env.STRIPE_SECRET_KEY = "sk";
    // The row currently represents a DIFFERENT subscription (sub_NEW); the
    // stale event references sub_OLD which is stored nowhere locally.
    subFindFirst.mockImplementation(({ where }: { where: { stripeSubscriptionId?: string } }) => {
      if (where.stripeSubscriptionId === "sub_NEW") {
        return Promise.resolve({ id: "s1", status: "ACTIVE" });
      }
      return Promise.resolve(null);
    });
    subUpdate.mockResolvedValue({});

    const staleDeleted = {
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_OLD", customer: "cus_1", canceled_at: 1700000000 } },
    } as unknown as Stripe.Event;

    await handleStripeWebhook(staleDeleted);
    // The current subscription must not have been touched by the old one's
    // cancellation.
    expect(subUpdate).not.toHaveBeenCalled();
  });

  it("cancels only when the event's subscription id matches the stored one", async () => {
    env.STRIPE_SECRET_KEY = "sk";
    subFindFirst.mockImplementation(({ where }: { where: { stripeSubscriptionId?: string } }) => {
      if (where.stripeSubscriptionId === "sub_NEW") {
        return Promise.resolve({ id: "s1", status: "ACTIVE" });
      }
      return Promise.resolve(null);
    });
    subUpdate.mockResolvedValue({});

    const realDeleted = {
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_NEW", customer: "cus_1", canceled_at: 1700000000 } },
    } as unknown as Stripe.Event;

    await handleStripeWebhook(realDeleted);
    expect(subUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "s1" },
        data: expect.objectContaining({ status: "CANCELED" }),
      })
    );
  });

  it("customer.subscription.updated is also resolved by subscription id (not customer)", async () => {
    env.STRIPE_SECRET_KEY = "sk";
    subFindFirst.mockImplementation(({ where }: { where: { stripeSubscriptionId?: string } }) => {
      if (where.stripeSubscriptionId === "sub_NEW") {
        return Promise.resolve({ id: "s1", status: "ACTIVE" });
      }
      return Promise.resolve(null);
    });
    subUpdate.mockResolvedValue({});

    const staleUpdated = {
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_OLD",
          customer: "cus_1",
          status: "canceled",
          canceled_at: 1700000000,
          items: { data: [{ current_period_start: 1, current_period_end: 2 }] },
        },
      },
    } as unknown as Stripe.Event;

    await handleStripeWebhook(staleUpdated);
    expect(subUpdate).not.toHaveBeenCalled();

    subUpdate.mockClear();
    const liveUpdated = {
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_NEW",
          customer: "cus_1",
          status: "active",
          canceled_at: null,
          items: { data: [{ current_period_start: 1, current_period_end: 2 }] },
        },
      },
    } as unknown as Stripe.Event;

    await handleStripeWebhook(liveUpdated);
    expect(subUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "s1" },
        data: expect.objectContaining({ status: "ACTIVE" }),
      })
    );
  });
});

describe("handleStripeWebhook — invoice.payment_succeeded", () => {
  it("creates a billing history record for the matching subscription", async () => {
    env.STRIPE_SECRET_KEY = "sk";
    subFindFirst.mockResolvedValue({ id: "s1" });
    billCreate.mockResolvedValue({});
    const event = {
      type: "invoice.payment_succeeded",
      data: {
        object: {
          customer: "cus_1",
          amount_paid: 2000,
          currency: "usd",
          id: "in_1",
          hosted_invoice_url: "https://receipt",
          number: "INV-1",
          period_start: 1700000000,
          period_end: 1702592000,
        },
      },
    } as unknown as Stripe.Event;
    await handleStripeWebhook(event);
    expect(billCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ subscriptionId: "s1", amount: 2000, currency: "usd", status: "paid" }),
      })
    );
  });

  it("ignores events with no matching subscription", async () => {
    env.STRIPE_SECRET_KEY = "sk";
    const event = {
      type: "invoice.payment_succeeded",
      data: { object: { customer: "cus_404", amount_paid: 1, currency: "usd" } },
    } as unknown as Stripe.Event;
    await handleStripeWebhook(event);
    expect(billCreate).not.toHaveBeenCalled();
  });
});

describe("handleStripeWebhook — idempotency", () => {
  it("does not re-apply state when the event id was already processed", async () => {
    env.STRIPE_SECRET_KEY = "sk";
    stripeEventFind.mockResolvedValue({ id: 1, eventId: "evt_already_seen", type: "checkout.session.completed" });
    sharedClient.subscriptions.retrieve.mockResolvedValue({
      items: { data: [{ price: { id: "price_pro_monthly" }, current_period_start: 1700000000, current_period_end: 1702592000 }] },
      trial_end: null,
      status: "active",
    });
    subFindFirst.mockResolvedValue({ id: "s1", status: "FREE" });
    subUpdate.mockResolvedValue({});

    const event = {
      id: "evt_already_seen",
      type: "checkout.session.completed",
      data: { object: { customer: "cus_1", subscription: "sub_1", mode: "subscription", metadata: { userId: "u1" } } },
    } as unknown as Stripe.Event;

    await handleStripeWebhook(event);
    expect(stripeEventCreate).not.toHaveBeenCalled();
    expect(sharedClient.subscriptions.retrieve).not.toHaveBeenCalled();
    expect(subUpdate).not.toHaveBeenCalled();
  });

  it("treats a lost unique-key race as already-processed (no duplicate state)", async () => {
    env.STRIPE_SECRET_KEY = "sk";
    stripeEventCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        "Unique constraint failed on the fields: (`eventId`)",
        { code: "P2002", clientVersion: "6.0.0", meta: { target: ["eventId"] } }
      )
    );
    subFindFirst.mockResolvedValue({ id: "s1" });
    billCreate.mockResolvedValue({});
    stripeEventDelete.mockResolvedValue({});

    const event = {
      id: "evt_race",
      type: "invoice.payment_succeeded",
      data: { object: { customer: "cus_1", amount_paid: 2000, currency: "usd", id: "in_2" } },
    } as unknown as Stripe.Event;

    await handleStripeWebhook(event);
    expect(billCreate).not.toHaveBeenCalled();
    expect(stripeEventCreate).toHaveBeenCalledWith({
      data: { eventId: "evt_race", type: "invoice.payment_succeeded" },
    });
  });

  it("rolls the transaction back (no committed marker, no delete) and rethrows so Stripe retries", async () => {
    env.STRIPE_SECRET_KEY = "sk";
    subFindFirst.mockResolvedValue({ id: "s1" });
    billCreate.mockRejectedValue(new Error("db down"));

    const event = {
      id: "evt_fail",
      type: "invoice.payment_succeeded",
      data: { object: { customer: "cus_1", amount_paid: 2000, currency: "usd", id: "in_3" } },
    } as unknown as Stripe.Event;

    await expect(handleStripeWebhook(event)).rejects.toThrow("db down");
    // The marker lives inside the SAME transaction as the state change: a
    // failure rolls the marker back too, so there is no crash window and no
    // post-hoc delete (previously: marker committed, then deleted on failure —
    // a crash in between permanently skipped the event).
    expect(stripeEventDelete).not.toHaveBeenCalled();
    expect(stripeEventCreate).toHaveBeenCalledTimes(1);
  });

  it("skips a duplicate invoice without aborting (billing history already exists)", async () => {
    env.STRIPE_SECRET_KEY = "sk";
    subFindFirst.mockResolvedValue({ id: "s1" });
    billFindFirst.mockResolvedValue({ id: 1, stripeInvoiceId: "in_dup" });

    const event = {
      id: "evt_dup_invoice",
      type: "invoice.payment_succeeded",
      data: {
        object: {
          customer: "cus_1",
          amount_paid: 2000,
          currency: "usd",
          id: "in_dup",
          hosted_invoice_url: "https://receipt",
          number: "INV-1",
        },
      },
    } as unknown as Stripe.Event;

    await handleStripeWebhook(event);
    expect(billCreate).not.toHaveBeenCalled();
  });
});

function assert(
  mock: ReturnType<typeof vi.fn>,
  expectations: Array<{ where: Record<string, string>; data: Record<string, unknown> }>
) {
  expect(mock).toHaveBeenCalledTimes(expectations.length);
  expectations.forEach((exp, i) => {
    expect(mock).toHaveBeenNthCalledWith(
      i + 1,
      expect.objectContaining({
        where: exp.where,
        data: expect.objectContaining(exp.data),
      })
    );
  });
}