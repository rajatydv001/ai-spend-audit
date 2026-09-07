import { describe, it, expect, vi, beforeEach } from "vitest";

const mutate = vi.hoisted(() => ({
  pricingCatalog: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ prisma: mutate }));

import {
  seedPricingCatalog,
  resolveActivePricing,
  requireActivePricing,
  applyPriceChange,
  listPricingVersions,
} from "@/lib/services/pricing-catalog-service";

const d = (v: string) => new Date(`${v}T00:00:00.000Z`);

beforeEach(() => {
  Object.values(mutate.pricingCatalog).forEach((m) => (m as ReturnType<typeof vi.fn>).mockReset());
});

describe("seedPricingCatalog", () => {
  it("inserts versions that do not exist and skips existing ones (idempotent, never overwrite)", async () => {
    mutate.pricingCatalog.findFirst.mockResolvedValue(null);
    mutate.pricingCatalog.findMany.mockResolvedValue([]); // no stale active versions
    const result = await seedPricingCatalog();
    expect(result.created).toBeGreaterThan(0);
    expect(mutate.pricingCatalog.create).toHaveBeenCalled();

    mutate.pricingCatalog.create.mockClear();
    mutate.pricingCatalog.findFirst.mockReset();
    mutate.pricingCatalog.findFirst.mockResolvedValue({ id: "exists" });
    const again = await seedPricingCatalog();
    expect(again.created).toBe(0);
    expect(mutate.pricingCatalog.create).not.toHaveBeenCalled();
  });

  it("closes/activates existing versions to mirror the authoritative catalog", async () => {
    mutate.pricingCatalog.findFirst.mockResolvedValue({ id: "exists", validUntil: null, active: true });
    mutate.pricingCatalog.findMany.mockResolvedValue([]); // no stale active versions
    const result = await seedPricingCatalog();
    expect(mutate.pricingCatalog.update).toHaveBeenCalled();
    // At least one closed (validUntil set) and one re-activated open version existed.
    expect(result.created).toBe(0);
    expect(result.closed).toBeGreaterThan(0);
  });

  it("closes stale active versions whose plan no longer exists in the catalog", async () => {
    mutate.pricingCatalog.findFirst.mockResolvedValue({ id: "exists", validUntil: null, active: true, sourceStatus: "VERIFIED", lastVerifiedAt: null, officialPricingUrl: null, segment: "individual", power: false });
    // A stale active plan (renamed/removed) that the catalog no longer includes.
    mutate.pricingCatalog.findMany.mockResolvedValue([
      { id: "stale", vendor: "cursor", product: "Cursor", plan: "Legacy Pro", billingCadence: "MONTHLY", active: true },
    ]);
    const result = await seedPricingCatalog();
    expect(result.closed).toBeGreaterThan(0);
    // The stale open version is closed (active=false).
    expect(mutate.pricingCatalog.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "stale" }, data: expect.objectContaining({ active: false }) })
    );
  });
});

describe("resolveActivePricing", () => {
  it("resolves the currently active open-ended version", async () => {
    const row = {
      id: "1", vendor: "acme", product: "Widget", plan: "Pro", billingType: "PER_USER",
      billingCadence: "MONTHLY", price: 25, currency: "USD", perUser: true, minSeats: 1,
      maxSeats: null, usageModel: "NONE", officialPricingUrl: "https://x", sourceStatus: "VERIFIED",
      lastVerifiedAt: d("2026-01-01"), validFrom: d("2025-06-01"), validUntil: null, active: true,
      createdAt: d("2025-06-01"), updatedAt: d("2025-06-01"),
    };
    mutate.pricingCatalog.findMany.mockResolvedValue([row]);
    const resolved = await resolveActivePricing("acme", "Widget", "Pro", d("2026-01-01"));
    expect(resolved?.price).toBe(25);
  });

  it("resolves the historical version valid at the given date", async () => {
    const old = {
      id: "1", vendor: "acme", product: "Widget", plan: "Pro", billingType: "PER_USER",
      billingCadence: "MONTHLY", price: 10, currency: "USD", perUser: true, minSeats: 1,
      maxSeats: null, usageModel: "NONE", officialPricingUrl: null, sourceStatus: "VERIFIED",
      lastVerifiedAt: null, validFrom: d("2025-01-01"), validUntil: d("2025-06-01"), active: false,
      createdAt: d("2025-01-01"), updatedAt: d("2025-01-01"),
    };
    const current = {
      id: "2", vendor: "acme", product: "Widget", plan: "Pro", billingType: "PER_USER",
      billingCadence: "MONTHLY", price: 25, currency: "USD", perUser: true, minSeats: 1,
      maxSeats: null, usageModel: "NONE", officialPricingUrl: null, sourceStatus: "VERIFIED",
      lastVerifiedAt: null, validFrom: d("2025-06-01"), validUntil: null, active: true,
      createdAt: d("2025-06-01"), updatedAt: d("2025-06-01"),
    };
    mutate.pricingCatalog.findMany.mockImplementation(({ where }) => {
      const asOf = d("2025-02-01");
      // Simulate the DB: only versions with validFrom <= date returned.
      if (where.validFrom.lte <= asOf) return [old];
      return [current, old];
    });
    // Historical audit in 2025-02 sees the $10 version.
    expect((await resolveActivePricing("acme", "Widget", "Pro", d("2025-02-01")))?.price).toBe(10);
    // Current audit (2026) sees the $25 version.
    expect((await resolveActivePricing("acme", "Widget", "Pro", d("2026-01-01")))?.price).toBe(25);
  });

  it("refuses to return null from requireActivePricing instead of inventing a price", async () => {
    mutate.pricingCatalog.findMany.mockResolvedValue([]);
    await expect(requireActivePricing("acme", "Widget", "Pro", d("2026-01-01"))).rejects.toThrow(/Refusing to invent/);
  });
});

describe("applyPriceChange", () => {
  it("closes the previous active version and inserts a new one — never overwrites", async () => {
    mutate.pricingCatalog.findMany.mockResolvedValue([
      { id: "old", active: true, validFrom: d("2025-01-01"), validUntil: null },
    ]);
    mutate.pricingCatalog.update.mockResolvedValue({
      id: "old", active: false, validFrom: d("2025-01-01"), validUntil: d("2026-03-01"),
    });
    mutate.pricingCatalog.create.mockImplementation(({ data }) => ({ id: "new", ...data }));

    const { oldVersion, newVersion } = await applyPriceChange({
      vendor: "acme", product: "Cursor", plan: "Pro",
      effectiveDate: d("2026-03-01"), price: 25, sourceStatus: "VERIFIED",
    });

    // Old record preserved with a closed validUntil.
    expect(oldVersion?.id).toBe("old");
    expect(oldVersion?.validUntil?.toISOString()).toBe(d("2026-03-01").toISOString());
    expect(oldVersion?.active).toBe(false);

    // New record is open-ended at the new price.
    expect(newVersion?.price).toBe(25);
    expect(newVersion?.validUntil).toBeNull();
    expect(newVersion?.validFrom.toISOString()).toBe(d("2026-03-01").toISOString());

    // The old record was updated (closed), never deleted or price-rewritten.
    expect(mutate.pricingCatalog.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ validUntil: d("2026-03-01"), active: false }) })
    );
  });

  it("today's audits keep $20 and only new audits after the effective date use $25", async () => {
    mutate.pricingCatalog.findMany.mockReset();
    mutate.pricingCatalog.findMany.mockResolvedValue([{ id: "old", validFrom: d("2025-01-01"), validUntil: null }]);
    mutate.pricingCatalog.update.mockResolvedValue({ id: "old", validUntil: d("2026-03-01"), active: false });
    mutate.pricingCatalog.create.mockImplementation(({ data }) => [{ id: "new", ...data }][0]);

    // Simulate the requested example: Cursor Pro $20 -> $25 effective 2026-03-01.
    const { newVersion } = await applyPriceChange({
      vendor: "cursor", product: "Cursor", plan: "Pro",
      effectiveDate: d("2026-03-01"), price: 25, sourceStatus: "VERIFIED",
    });
    expect(newVersion?.price).toBe(25);

    // Resolution before effective date -> old $20; after -> new $25.
    mutate.pricingCatalog.findMany.mockReset();
    mutate.pricingCatalog.findMany.mockImplementation(({ where }) => {
      const date = where.validFrom.lte;
      if (date < d("2026-03-01")) {
        return [{ ...{ id: "old", vendor: "cursor", product: "Cursor", plan: "Pro", billingType: "PER_USER", billingCadence: "MONTHLY", price: 20, currency: "USD", perUser: true, minSeats: 1, usageModel: "NONE", sourceStatus: "VERIFIED", lastVerifiedAt: null, validFrom: d("2025-01-01"), validUntil: null, active: true, createdAt: d("2025-01-01"), updatedAt: d("2025-01-01") } }];
      }
      return [{ ...{ id: "new", vendor: "cursor", product: "Cursor", plan: "Pro", billingType: "PER_USER", billingCadence: "MONTHLY", price: 25, currency: "USD", perUser: true, minSeats: 1, usageModel: "NONE", sourceStatus: "VERIFIED", lastVerifiedAt: null, validFrom: d("2026-03-01"), validUntil: null, active: true, createdAt: d("2026-03-01"), updatedAt: d("2026-03-01") } }];
    });

    expect((await resolveActivePricing("cursor", "Cursor", "Pro", d("2026-02-15")))?.price).toBe(20);
    expect((await resolveActivePricing("cursor", "Cursor", "Pro", d("2026-04-01")))?.price).toBe(25);
  });

  it("keeps custom and usage pricing as-is (never converted to a fixed number)", async () => {
    mutate.pricingCatalog.findMany.mockResolvedValue([]);
    mutate.pricingCatalog.create.mockImplementation(({ data }) => ({ id: "new", ...data }));

    const { newVersion } = await applyPriceChange({
      vendor: "acme", product: "Widget", plan: "Enterprise",
      effectiveDate: d("2026-01-01"), price: 0, billingType: "CUSTOM", minSeats: 10,
    });
    expect(newVersion.billingType).toBe("CUSTOM");
    expect(newVersion.price).toBe(0);
  });
});

describe("listPricingVersions", () => {
  it("returns all versions ordered for history display", async () => {
    mutate.pricingCatalog.findMany.mockResolvedValue([
      { id: "a", vendor: "acme", product: "Widget", plan: "Pro", billingType: "PER_USER", billingCadence: "MONTHLY", price: 10, currency: "USD", perUser: true, minSeats: 1, maxSeats: null, usageModel: "NONE", officialPricingUrl: null, sourceStatus: "VERIFIED", lastVerifiedAt: null, validFrom: d("2025-01-01"), validUntil: null, active: true, createdAt: d("2025-01-01"), updatedAt: d("2025-01-01") },
    ]);
    const rows = await listPricingVersions();
    expect(rows.length).toBe(1);
    expect(rows[0].sourceStatus).toBe("VERIFIED");
  });
});