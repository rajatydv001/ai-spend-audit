import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  handleStripeWebhook: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  env: {
    STRIPE_WEBHOOK_SECRET: "whsec_test" as string | undefined,
    STRIPE_SECRET_KEY: "sk_test",
  },
}));

vi.mock("stripe", () => {
  class MockStripe {
    webhooks = { constructEvent: mocks.constructEvent };
  }
  return { default: MockStripe };
});

vi.mock("@/lib/services/subscription-service", () => ({
  handleStripeWebhook: mocks.handleStripeWebhook,
}));

import { env } from "@/lib/env";
import { POST } from "@/app/api/stripe/webhook/route";

describe("stripe webhook route", () => {
  beforeEach(() => {
    env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    mocks.constructEvent.mockReset();
    mocks.handleStripeWebhook.mockReset();
    mocks.handleStripeWebhook.mockResolvedValue(undefined);
  });

  it("returns 400 when the webhook secret is not configured", async () => {
    env.STRIPE_WEBHOOK_SECRET = undefined;
    const res = await POST(new Request("http://localhost/api/stripe/webhook", { method: "POST" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Webhook not configured" });
  });

  it("rejects a forged/invalid signature with 400 and never touches handlers", async () => {
    mocks.constructEvent.mockImplementation(() => {
      throw new Error("No signatures found");
    });
    const res = await POST(
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": "t=1,v1=forged" },
        body: JSON.stringify({ id: "evt_forged" }),
      })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid signature" });
    expect(mocks.handleStripeWebhook).not.toHaveBeenCalled();
  });

  it("accepts a valid signature and forwards the verified event", async () => {
    const event = { id: "evt_valid", type: "invoice.payment_succeeded" };
    mocks.constructEvent.mockReturnValue(event);
    const res = await POST(
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": "t=1,v1=real" },
        body: "raw-payload",
      })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(mocks.constructEvent).toHaveBeenCalledWith("raw-payload", "t=1,v1=real", "whsec_test");
    expect(mocks.handleStripeWebhook).toHaveBeenCalledWith(event);
  });

  it("surfaces processing failures as 500", async () => {
    const event = { id: "evt_valid", type: "invoice.payment_succeeded" };
    mocks.constructEvent.mockReturnValue(event);
    mocks.handleStripeWebhook.mockRejectedValue(new Error("db down"));
    const res = await POST(
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": "t=1,v1=real" },
        body: "raw-payload",
      })
    );
    expect(res.status).toBe(500);
  });
});