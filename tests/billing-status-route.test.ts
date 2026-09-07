import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  getBillingInfo: vi.fn(),
}));

vi.mock("@/lib/auth/dal", () => ({ requireUserId: mocks.requireUserId }));
vi.mock("@/lib/services/subscription-service", () => ({
  getBillingInfo: mocks.getBillingInfo,
}));

import { ApiError } from "@/lib/errors";
import { GET } from "@/app/api/billing/status/route";

const get = () =>
  GET(new Request("http://localhost/api/billing/status", { method: "GET" }));

describe("billing status route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUserId.mockResolvedValue("u1");
    mocks.getBillingInfo.mockResolvedValue({
      plan: "FREE",
      status: null,
      stripeConfigured: false,
      prices: { PRO: null, ENTERPRISE: null },
    });
  });

  it("requires authentication", async () => {
    mocks.requireUserId.mockRejectedValue(new ApiError("Unauthorized", 401));
    const res = await get();
    expect(res.status).toBe(401);
  });

  it("reports the Free state for a new/unconfigured user (no paid features via client state)", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      plan: "FREE",
      status: null,
      stripeConfigured: false,
      prices: { PRO: null, ENTERPRISE: null },
    });
  });

  it("reports the active paid plan once a verified subscription exists", async () => {
    mocks.getBillingInfo.mockResolvedValue({
      plan: "PRO",
      status: "ACTIVE",
      stripeConfigured: true,
      prices: { PRO: "price_pro_monthly", ENTERPRISE: "price_enterprise_monthly" },
    });
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.plan).toBe("PRO");
    expect(body.status).toBe("ACTIVE");
  });
});