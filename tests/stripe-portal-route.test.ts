import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  createBillingPortalSession: vi.fn(),
  rateLimitOrThrow: vi.fn(),
}));

vi.mock("@/lib/auth/dal", () => ({ requireUserId: mocks.requireUserId }));
vi.mock("@/lib/services/subscription-service", () => ({
  createBillingPortalSession: mocks.createBillingPortalSession,
}));
vi.mock("@/lib/services/rate-limit", () => ({ rateLimitOrThrow: mocks.rateLimitOrThrow }));

import { ApiError } from "@/lib/errors";
import { POST } from "@/app/api/stripe/portal/route";

const post = () =>
  POST(new Request("http://localhost/api/stripe/portal", { method: "POST" }));

describe("stripe billing portal route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUserId.mockResolvedValue("u1");
    mocks.rateLimitOrThrow.mockResolvedValue({ remaining: 19 });
    mocks.createBillingPortalSession.mockResolvedValue("https://portal.example");
  });

  it("rejects unauthenticated portal requests with 401", async () => {
    mocks.requireUserId.mockRejectedValue(new ApiError("Unauthorized", 401));
    const res = await post();

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(mocks.createBillingPortalSession).not.toHaveBeenCalled();
  });

  it("returns a 503 configuration error when Stripe is not configured", async () => {
    mocks.createBillingPortalSession.mockRejectedValue(
      new ApiError("Stripe is not configured. Set STRIPE_SECRET_KEY to enable billing.", 503)
    );
    const res = await post();

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/Stripe is not configured/i);
  });

  it("returns 400 when the user has no billing portal (no Stripe customer)", async () => {
    mocks.createBillingPortalSession.mockResolvedValue(null);
    const res = await post();

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "No billing portal available" });
  });

  it("returns the portal url for the authenticated owner", async () => {
    const res = await post();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://portal.example" });
    expect(mocks.createBillingPortalSession).toHaveBeenCalledWith("u1");
  });
});