import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  requireRole: vi.fn(),
  requirePlatformAdmin: vi.fn(),
  applyPriceChange: vi.fn(),
  listPricingVersions: vi.fn(),
}));

vi.mock("@/lib/auth/dal", () => ({ requireUserId: mocks.requireUserId }));
vi.mock("@/lib/auth/authorization", () => ({
  requirePlatformAdmin: mocks.requirePlatformAdmin,
  requireRole: mocks.requireRole,
}));
vi.mock("@/lib/services/pricing-catalog-service", () => ({
  applyPriceChange: mocks.applyPriceChange,
  listPricingVersions: mocks.listPricingVersions,
}));

import { ApiError } from "@/lib/errors";
import type { PricingCatalogRecord } from "@/lib/services/pricing-catalog-service";
import { GET, POST } from "@/app/api/pricing/catalog/route";

const body = {
  vendor: "openai",
  product: "gpt-4o",
  plan: "team",
  effectiveDate: "2026-10-01T00:00:00.000Z",
  price: 30,
  currency: "USD",
  billingType: "PER_USER",
  billingCadence: "monthly",
  perUser: true,
  segment: "team",
  sourceStatus: "VERIFIED" as const,
};

const post = () =>
  POST(
    new Request("http://localhost/api/pricing/catalog", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({}) }
  );

describe("GET /api/pricing/catalog — resolves the version ACTIVE as of asOf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUserId.mockResolvedValue("u1");
    mocks.requireRole.mockResolvedValue({ id: "u1", role: "ANALYST" });
  });

  const ver = (over: Partial<PricingCatalogRecord>): PricingCatalogRecord => ({
    id: "v1",
    vendor: "github",
    product: "Copilot",
    plan: "Pro",
    billingType: "PER_USER",
    billingCadence: "MONTHLY",
    price: 10,
    currency: "USD",
    perUser: true,
    segment: "individual",
    power: false,
    minSeats: null,
    maxSeats: null,
    usageModel: "NONE",
    officialPricingUrl: null,
    sourceStatus: "VERIFIED",
    lastVerifiedAt: null,
    validFrom: new Date("2026-09-02T00:00:00.000Z"),
    validUntil: null,
    active: true,
    createdAt: new Date("2025-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-09-02T00:00:00.000Z"),
    ...over,
  });

  const get = (asOf?: string) =>
    GET(
      new Request(
        `http://localhost/api/pricing/catalog${asOf ? `?asOf=${asOf}` : ""}`
      ),
      { params: Promise.resolve({}) }
    );

  it("returns the price that was active on a historical asOf date", async () => {
    // The same plan was $99/month until 2026-09-01, then $10/month. The list is
    // returned newest-first — the route must NOT assume the newest version was
    // active at asOf 2025-12-01.
    const v1 = ver({
      id: "v1",
      price: 99,
      validFrom: new Date("2025-08-01T00:00:00.000Z"),
      validUntil: new Date("2026-09-02T00:00:00.000Z"),
      active: false,
    });
    const v2 = ver({
      id: "v2",
      price: 10,
      validFrom: new Date("2026-09-02T00:00:00.000Z"),
      validUntil: null,
    });
    mocks.listPricingVersions.mockResolvedValue([v2, v1]);

    const res = await get("2025-12-01T00:00:00.000Z");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toHaveLength(1);
    expect(json.items[0].price).toBe(99);
    expect(json.items[0].active).toMatchObject({ id: "v1", price: 99 });
    expect(json.items[0].history).toHaveLength(2);
  });

  it("uses the current version when no asOf is supplied", async () => {
    mocks.listPricingVersions.mockResolvedValue([
      ver({ price: 10, validFrom: new Date("2026-09-02T00:00:00.000Z") }),
      ver({ id: "v0", price: 99, validUntil: new Date("2026-09-02T00:00:00.000Z") }),
    ]);

    const res = await get();
    const json = await res.json();
    expect(json.items[0].price).toBe(10);
    expect(json.items[0].active).toMatchObject({ id: "v1", price: 10 });
  });

  it("returns price null when asOf predates the first recorded version", async () => {
    mocks.listPricingVersions.mockResolvedValue([
      ver({ price: 10, validFrom: new Date("2026-09-02T00:00:00.000Z") }),
    ]);

    const res = await get("2026-01-01T00:00:00.000Z");
    const json = await res.json();
    expect(json.items[0].price).toBeNull();
    expect(json.items[0].active).toBeNull();
  });
});

describe("POST /api/pricing/catalog — platform-admin gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUserId.mockResolvedValue("u1");
    mocks.requirePlatformAdmin.mockResolvedValue({
      id: "u1",
      isPlatformAdmin: true,
    });
    mocks.applyPriceChange.mockResolvedValue({ id: "v1", price: 30 });
  });

  it("requires authentication", async () => {
    mocks.requireUserId.mockRejectedValue(new ApiError("Unauthorized", 401));
    const res = await post();
    expect(res.status).toBe(401);
  });

  it("rejects an org ADMIN who is not a platform admin (403)", async () => {
    mocks.requirePlatformAdmin.mockRejectedValue(new ApiError("Forbidden", 403));
    const res = await post();
    expect(res.status).toBe(403);
    expect(mocks.applyPriceChange).not.toHaveBeenCalled();
  });

  it("applies a price change for a platform admin", async () => {
    const res = await post();
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "v1", price: 30 });
    expect(mocks.applyPriceChange).toHaveBeenCalledWith(
      expect.objectContaining({
        vendor: "openai",
        product: "gpt-4o",
        price: 30,
      })
    );
  });
});