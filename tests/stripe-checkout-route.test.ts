import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  createStripeCheckoutSession: vi.fn(),
  rateLimitOrThrow: vi.fn(),
}));

vi.mock("@/lib/auth/dal", () => ({ requireUserId: mocks.requireUserId }));
vi.mock("@/lib/services/subscription-service", () => ({
  createStripeCheckoutSession: mocks.createStripeCheckoutSession,
}));
vi.mock("@/lib/services/rate-limit", () => ({ rateLimitOrThrow: mocks.rateLimitOrThrow }));

import { ApiError } from "@/lib/errors";
import { POST } from "@/app/api/stripe/checkout/route";

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );

describe("stripe checkout route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUserId.mockResolvedValue("u1");
    mocks.rateLimitOrThrow.mockResolvedValue({ remaining: 9 });
    mocks.createStripeCheckoutSession.mockResolvedValue("https://checkout.example");
  });

  it("rejects unauthenticated checkout with 401", async () => {
    mocks.requireUserId.mockRejectedValue(new ApiError("Unauthorized", 401));
    const res = await post({ priceId: "price_pro_monthly", plan: "PRO" });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mocks.createStripeCheckoutSession).not.toHaveBeenCalled();
  });

  it("rejects an invalid plan payload with validation errors", async () => {
    const res = await post({ priceId: "price_pro_monthly", plan: "HACKER" });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(JSON.stringify(body.details)).toMatch(/plan/i);
    expect(mocks.createStripeCheckoutSession).not.toHaveBeenCalled();
  });

  it("passes a valid plan to the service and surfaces service-side plan rejection (e.g. Free)", async () => {
    mocks.createStripeCheckoutSession.mockRejectedValue(new ApiError("The Free plan cannot be upgraded to.", 400));
    const res = await post({ priceId: "price_pro_monthly", plan: "FREE" });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "The Free plan cannot be upgraded to." });
  });

  it("returns 400 for an invalid/mismatched price without calling Stripe", async () => {
    mocks.createStripeCheckoutSession.mockRejectedValue(new ApiError("Price does not match the requested plan.", 400));
    const res = await post({ priceId: "price_evil_cheap", plan: "PRO" });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Price does not match the requested plan." });
    expect(mocks.createStripeCheckoutSession).toHaveBeenCalledWith(
      "u1",
      "PRO",
      "price_evil_cheap"
    );
  });

  it("returns 503 with a clear configuration error when Stripe is not configured", async () => {
    mocks.createStripeCheckoutSession.mockRejectedValue(
      new ApiError("Stripe is not configured. Set STRIPE_SECRET_KEY to enable billing.", 503)
    );
    const res = await post({ priceId: "price_pro_monthly", plan: "PRO" });

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/Stripe is not configured/i);
  });

  it("returns the checkout url for a successful configured checkout", async () => {
    mocks.createStripeCheckoutSession.mockResolvedValue("https://checkout.example");
    const res = await post({ priceId: "price_pro_monthly", plan: "PRO" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://checkout.example" });
    expect(mocks.createStripeCheckoutSession).toHaveBeenCalledWith(
      "u1",
      "PRO",
      "price_pro_monthly"
    );
  });
});