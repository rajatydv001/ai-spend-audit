import { describe, it, expect } from "vitest";
import {
  VENDOR_PRICING,
  resolvePricingVersion,
  getActiveToolPlans,
  isActiveAt,
  findOverlappingVersions,
  parseDate,
  type PricingVersion,
} from "@/lib/pricing/catalog";

const d = parseDate;

function version(overrides: Partial<PricingVersion>): PricingVersion {
  return {
    vendor: "acme",
    product: "Widget",
    plan: "Pro",
    billingType: "PER_USER",
    billingCadence: "MONTHLY",
    price: 10,
    currency: "USD",
    perUser: true,
    segment: "individual",
    minSeats: 1,
    usageModel: "NONE",
    officialPricingUrl: "https://acme.example/pricing",
    sourceStatus: "VERIFIED",
    lastVerifiedAt: d("2026-01-01"),
    validFrom: d("2025-01-01"),
    validUntil: null,
    ...overrides,
  };
}

describe("current active price resolution", () => {
  it("resolves the single open-ended version active today", () => {
    const v = version({ product: "Widget", plan: "Pro", price: 20 });
    const resolved = resolvePricingVersion("acme", "Widget", "Pro", d("2026-06-01"), [v]);
    expect(resolved?.price).toBe(20);
    expect(resolved?.billingCadence).toBe("MONTHLY");
  });

  it("resolves using the globally seeded catalog by default", () => {
    const resolved = resolvePricingVersion("openai", "ChatGPT", "Plus", new Date());
    expect(resolved?.plan).toBe("Plus");
    expect(typeof resolved?.price).toBe("number");
  });
});

describe("historical price resolution", () => {
  it("resolves the version valid at an earlier audit date, not the current one", () => {
    const old = version({ vendor: "acme", product: "Widget", plan: "Pro", price: 10, validFrom: d("2024-01-01"), validUntil: d("2025-06-01") });
    const current = version({ vendor: "acme", product: "Widget", plan: "Pro", price: 25, validFrom: d("2025-06-01"), validUntil: null });
    // Audit dated 2025-01-01 must see the $10 price.
    expect(resolvePricingVersion("acme", "Widget", "Pro", d("2025-01-15"), [old, current])?.price).toBe(10);
    // Audit dated after the price change must see the $25 price.
    expect(resolvePricingVersion("acme", "Widget", "Pro", d("2026-01-01"), [old, current])?.price).toBe(25);
  });

  it("treats validUntil as exclusive", () => {
    const a = version({ vendor: "acme", product: "Widget", plan: "Pro", price: 10, validFrom: d("2025-01-01"), validUntil: d("2025-06-01") });
    const b = version({ vendor: "acme", product: "Widget", plan: "Pro", price: 20, validFrom: d("2025-06-01"), validUntil: null });
    // Exactly on the boundary (validUntil) the NEW price is active.
    expect(resolvePricingVersion("acme", "Widget", "Pro", d("2025-06-01"), [a, b])?.price).toBe(20);
    // The day before, the OLD price is active.
    expect(resolvePricingVersion("acme", "Widget", "Pro", d("2025-05-31"), [a, b])?.price).toBe(10);
  });
});

describe("future-dated price", () => {
  it("is inert until its validFrom — never predicts or pre-applies", () => {
    const current = version({ vendor: "acme", product: "Widget", plan: "Pro", price: 20, validFrom: d("2025-01-01"), validUntil: null });
    const future = version({ vendor: "acme", product: "Widget", plan: "Pro", price: 30, validFrom: d("2030-01-01"), validUntil: null });
    // Today (2026) the future price must NOT be active.
    expect(resolvePricingVersion("acme", "Widget", "Pro", d("2026-01-01"), [current, future])?.price).toBe(20);
    expect(isActiveAt(future, d("2026-01-01"))).toBe(false);
    // On or after its effective date it becomes active (explicit catalog update).
    expect(resolvePricingVersion("acme", "Widget", "Pro", d("2030-01-01"), [current, future])?.price).toBe(30);
  });
});

describe("missing / unverified pricing", () => {
  it("returns null instead of inventing a price when nothing is active", () => {
    expect(resolvePricingVersion("acme", "Widget", "Pro", d("2024-01-01"), [])).toBeNull();
  });

  it("returns null when the only version is future-dated", () => {
    const future = version({ vendor: "acme", product: "Widget", plan: "Pro", price: 30, validFrom: d("2030-01-01") });
    expect(resolvePricingVersion("acme", "Widget", "Pro", d("2026-01-01"), [future])).toBeNull();
  });

  it("keeps sourceStatus to show it is unverified rather than a confirmed price", () => {
    const unverified = version({ vendor: "acme", product: "Widget", plan: "Pro", price: 19, sourceStatus: "UNVERIFIED", lastVerifiedAt: null });
    const resolved = resolvePricingVersion("acme", "Widget", "Pro", d("2026-01-01"), [unverified]);
    expect(resolved?.sourceStatus).toBe("UNVERIFIED");
    expect(resolved?.lastVerifiedAt).toBeNull();
  });
});

describe("custom pricing is never converted to an estimated number", () => {
  it("marks custom plans and carries price 0 rather than an invented figure", () => {
    const custom = version({
      vendor: "acme", product: "Widget", plan: "Enterprise",
      billingType: "CUSTOM", price: 0, sourceStatus: "CUSTOM", minSeats: 10,
    });
    const resolved = resolvePricingVersion("acme", "Widget", "Enterprise", d("2026-01-01"), [custom]);
    expect(resolved?.billingType).toBe("CUSTOM");
    expect(resolved?.sourceStatus).toBe("CUSTOM");
    expect(resolved?.price).toBe(0);
  });

  it("excludes custom plans from the engine's cheapest-plan surface", () => {
    const plans = getActiveToolPlans("Widget", d("2026-01-01"), [
      version({ product: "Widget", plan: "Hobby", price: 0 }),
      version({ product: "Widget", plan: "Pro", price: 20 }),
      version({ product: "Widget", plan: "Enterprise", billingType: "CUSTOM", price: 0, minSeats: 10 }),
    ]);
    const names = plans.filter((p) => !p.custom).map((p) => p.name);
    expect(names).not.toContain("Enterprise");
    expect(names).toEqual(["Hobby", "Pro"]);
  });
});

describe("usage-based pricing stays usage-based", () => {
  it("keeps usage products billed as usage, not a fixed monthly number", () => {
    const usage = version({
      vendor: "openai", product: "OpenAI API", plan: "Pay-as-you-go",
      billingType: "USAGE", billingCadence: "USAGE_BASED", price: 0, perUser: false, usageModel: "TOKEN_BASED",
    });
    const resolved = resolvePricingVersion("openai", "OpenAI API", "Pay-as-you-go", d("2026-01-01"), [usage], "USAGE_BASED");
    expect(resolved?.billingType).toBe("USAGE");
    expect(resolved?.billingCadence).toBe("USAGE_BASED");
    expect(resolved?.usageModel).toBe("TOKEN_BASED");
    expect(resolved?.price).toBe(0);
  });
});

describe("no overlapping active versions", () => {
  it("detects two versions that overlap in time", () => {
    const a = version({ vendor: "acme", product: "Widget", plan: "Pro", price: 10, validFrom: d("2025-01-01"), validUntil: d("2025-12-31") });
    const b = version({ vendor: "acme", product: "Widget", plan: "Pro", price: 12, validFrom: d("2025-06-01"), validUntil: null });
    expect(findOverlappingVersions([a, b])).toHaveLength(1);
  });

  it("allows non-overlapping sequential versions (no overlap)", () => {
    const a = version({ vendor: "acme", product: "Widget", plan: "Pro", price: 10, validFrom: d("2025-01-01"), validUntil: d("2025-06-01") });
    const b = version({ vendor: "acme", product: "Widget", plan: "Pro", price: 12, validFrom: d("2025-06-01"), validUntil: null });
    expect(findOverlappingVersions([a, b])).toHaveLength(0);
  });

  it("the shipped catalog has no overlapping active versions", () => {
    expect(findOverlappingVersions(VENDOR_PRICING)).toHaveLength(0);
  });
});

describe("billing cadence differences", () => {
  it("keeps monthly vs annual vs usage cadences distinct", () => {
    const monthly = version({ product: "Widget", plan: "Pro", billingCadence: "MONTHLY", price: 10 });
    const annual = version({ product: "Widget", plan: "Pro", billingCadence: "ANNUAL", price: 100 });
    const m = resolvePricingVersion("acme", "Widget", "Pro", d("2026-01-01"), [monthly], "MONTHLY");
    const a = resolvePricingVersion("acme", "Widget", "Pro", d("2026-01-01"), [annual], "ANNUAL");
    expect(m?.billingCadence).toBe("MONTHLY");
    expect(a?.billingCadence).toBe("ANNUAL");
    expect(m?.price).toBe(10);
    expect(a?.price).toBe(100);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Monthly + annual are billing VARIANTS of the same logical plan (item 8).
// ────────────────────────────────────────────────────────────────────────────
describe("monthly and annual are billing variants of the same plan", () => {
  it("shares the plan name across cadences in the shipped catalog", () => {
    const anthropic = VENDOR_PRICING.filter((v) => v.vendor === "anthropic");
    const proMonthly = anthropic.find((v) => v.plan === "Pro" && v.billingCadence === "MONTHLY" && isActiveAt(v, d("2026-09-15")));
    const proAnnual = anthropic.find((v) => v.plan === "Pro" && v.billingCadence === "ANNUAL" && isActiveAt(v, d("2026-09-15")));
    expect(proMonthly).toBeDefined();
    expect(proAnnual).toBeDefined();
    // Same logical plan name, NOT a separate "Pro (annual)" identity.
    expect(proMonthly?.plan).toBe("Pro");
    expect(proAnnual?.plan).toBe("Pro");
    // Different cadence, verified prices.
    expect(proMonthly?.price).toBe(20);
    expect(proAnnual?.price).toBe(17);
  });

  it("resolves each cadence independently from the unified log", () => {
    // Anthropic Team monthly $25, annual $20 — same plan, distinct cadences.
    const monthly = resolvePricingVersion("anthropic", "Claude", "Team", d("2026-09-15"), VENDOR_PRICING, "MONTHLY");
    const annual = resolvePricingVersion("anthropic", "Claude", "Team", d("2026-09-15"), VENDOR_PRICING, "ANNUAL");
    expect(monthly?.price).toBe(25);
    expect(annual?.price).toBe(20);
  });

  it("Anthropic Team has a VERIFIED $20 annual seat price (item 11)", () => {
    const annual = resolvePricingVersion("anthropic", "Claude", "Team", d("2026-09-15"), VENDOR_PRICING, "ANNUAL");
    expect(annual?.price).toBe(20);
    expect(annual?.sourceStatus).toBe("VERIFIED");
  });

  it("does NOT fabricate a Cursor annual price even though a billing toggle exists", () => {
    // cursor.com/pricing has a monthly/yearly toggle but the yearly amounts were
    // never captured from the official page — no annual variant may be invented.
    const annual = resolvePricingVersion("cursor", "Cursor", "Individual", d("2026-09-15"), VENDOR_PRICING, "ANNUAL");
    expect(annual).toBeNull();
    // Monthly stays verified.
    const monthly = resolvePricingVersion("cursor", "Cursor", "Individual", d("2026-09-15"), VENDOR_PRICING, "MONTHLY");
    expect(monthly?.price).toBe(20);
    expect(monthly?.sourceStatus).toBe("VERIFIED");
  });

  it("does not report monthly/annual same-plan variants as overlapping versions", () => {
    // Because cadence is part of the uniqueness key, a monthly + annual version of
    // the same plan active at the same time must NOT count as an overlap.
    const monthly = version({ product: "Widget", plan: "Pro", billingCadence: "MONTHLY", price: 10 });
    const annual = version({ product: "Widget", plan: "Pro", billingCadence: "ANNUAL", price: 9 });
    expect(findOverlappingVersions([monthly, annual])).toHaveLength(0);
  });

  it("shipped catalog: no overlapping versions and expected verified counts", () => {
    const overlaps = findOverlappingVersions(VENDOR_PRICING);
    expect(overlaps).toHaveLength(0);

    const active = VENDOR_PRICING.filter((v) => v.validUntil === null);
    const verified = active.filter((v) => v.sourceStatus === "VERIFIED");
    const unverified = active.filter((v) => v.sourceStatus === "UNVERIFIED");
    const custom = active.filter((v) => v.sourceStatus === "CUSTOM");
    const usage = active.filter((v) => v.billingType === "USAGE");

    // OpenAI Business Premium has been added, monthly + annual (item 6).
    const premium = active.filter(
      (v) => v.vendor === "openai" && v.plan === "Business Premium"
    );
    expect(premium).toHaveLength(2); // monthly + annual

    expect(verified.length).toBeGreaterThan(0);
    expect(custom.some((c) => c.billingType === "CUSTOM")).toBe(true);
    // Usage products are never treated as verified fixed prices.
    expect(usage.every((u) => u.price === 0 && u.sourceStatus === "UNVERIFIED")).toBe(true);
    void unverified;
  });
});